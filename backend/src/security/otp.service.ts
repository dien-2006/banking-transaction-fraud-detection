import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomInt, randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { AuthUser } from "./auth.guard";
import { RedisService } from "./redis.service";
import {
  TransferDto,
  TransferOtpRequestDto,
  TransferOtpVerifyDto,
} from "../http/dto";

interface Profile {
  email?: string;
  fullname?: string;
}
interface Challenge {
  customerId: number;
  context: string;
  codeHash: string;
  attempts: number;
}
interface Authorization {
  customerId: number;
  context: string;
  idempotencyKey: string;
}

@Injectable()
export class OtpService {
  private readonly secret: string;
  constructor(
    private readonly redis: RedisService,
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>("OTP_HASH_SECRET");
  }
  context(customerId: number, dto: TransferOtpRequestDto): string {
    return createHmac("sha256", this.secret)
      .update(
        JSON.stringify({
          customerId,
          sourceAccountId: dto.sourceAccountId,
          destinationAccountId: dto.destinationAccountId,
          amount: String(dto.amount),
          idempotencyKey: dto.idempotencyKey,
          channel: dto.channel,
          description: dto.description ?? null,
        }),
      )
      .digest("hex");
  }
  async request(user: AuthUser, dto: TransferOtpRequestDto) {
    const customerId = this.customer(user);
    this.redis.assertReady();
    const rateKey = `otp:rate:${customerId}`;
    if (!(await this.redis.client.set(rateKey, "1", { NX: true, EX: 60 })))
      throw new HttpException(
        "Vui lòng chờ 60 giây trước khi gửi lại OTP",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const profile = await this.db.function<Profile>(
      "banking_api.get_customer_profile",
      [customerId],
    );
    if (!profile?.email) {
      await this.redis.client.del(rateKey);
      throw new ServiceUnavailableException("Customer email is not configured");
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0"),
      challengeId = randomUUID();
    const challenge: Challenge = {
      customerId,
      context: this.context(customerId, dto),
      codeHash: this.hash(code),
      attempts: 0,
    };
    await this.redis.client.set(
      `otp:challenge:${challengeId}`,
      JSON.stringify(challenge),
      { EX: 300 },
    );
    try {
      const messageId = await this.send(profile.email, profile.fullname ?? "Quý khách", code);
      // Acceptance is not delivery. Keep provider correlation outside business DB.
      await this.redis.client.set(`otp:delivery:${challengeId}`, JSON.stringify({ status: 'ACCEPTED', messageId }), { EX: 600 });
    } catch (error) {
      await this.redis.client.del([`otp:challenge:${challengeId}`, rateKey]);
      throw error;
    }
    return {
      challengeId,
      expiresIn: 300,
      destinationMasked: this.mask(profile.email),
      deliveryStatus: 'ACCEPTED',
    };
  }
  async verify(user: AuthUser, dto: TransferOtpVerifyDto) {
    this.redis.assertReady();
    const customerId = this.customer(user),
      token = randomUUID();
    const context = this.context(customerId, dto);
    const authorization: Authorization = {
      customerId,
      context,
      idempotencyKey: dto.idempotencyKey,
    };
    // Check, count attempts, consume and mint in one Redis operation. Concurrent
    // requests cannot reset the counter or exchange one challenge twice.
    const result = (await this.redis.client.eval(
      `
      local raw=redis.call('GET',KEYS[1])
      if not raw then return {'expired',0} end
      local challenge=cjson.decode(raw)
      if tostring(challenge.customerId)~=ARGV[1] or challenge.context~=ARGV[2] then
        return {'context',0}
      end
      if challenge.codeHash~=ARGV[3] then
        challenge.attempts=challenge.attempts+1
        if challenge.attempts>=5 then redis.call('DEL',KEYS[1]); return {'locked',0} end
        redis.call('SET',KEYS[1],cjson.encode(challenge),'KEEPTTL')
        return {'invalid',5-challenge.attempts}
      end
      redis.call('DEL',KEYS[1])
      redis.call('SET',KEYS[2],ARGV[4],'EX',120)
      return {'ok',0}
    `,
      {
        keys: [
          `otp:challenge:${dto.challengeId}`,
          `otp:authorization:${token}`,
        ],
        arguments: [
          String(customerId),
          context,
          this.hash(dto.code),
          JSON.stringify(authorization),
        ],
      },
    )) as [string, number];
    if (result[0] === "expired")
      throw new ForbiddenException("OTP đã hết hạn hoặc không tồn tại");
    if (result[0] === "context")
      throw new ForbiddenException("OTP không thuộc giao dịch này");
    if (result[0] === "locked") throw new ForbiddenException("OTP đã bị khóa");
    if (result[0] !== "ok")
      throw new ForbiddenException(`OTP không đúng, còn ${result[1]} lần thử`);
    return { authorizationToken: token, expiresIn: 120 };
  }
  async authorize(user: AuthUser, dto: TransferDto): Promise<string> {
    this.redis.assertReady();
    const customerId = this.customer(user),
      context = this.context(customerId, dto),
      completedKey = `otp:completed:${customerId}:${dto.idempotencyKey}`;
    if ((await this.redis.client.get(completedKey)) === context) return context;
    const authorized = await this.redis.client.eval(
      `
      local raw=redis.call('GET',KEYS[1])
      if not raw then return 0 end
      local auth=cjson.decode(raw)
      if tostring(auth.customerId)~=ARGV[1] or auth.context~=ARGV[2] or auth.idempotencyKey~=ARGV[3] then return -1 end
      redis.call('DEL',KEYS[1])
      return 1
    `,
      {
        keys: [`otp:authorization:${dto.otpAuthorizationToken}`],
        arguments: [String(customerId), context, dto.idempotencyKey],
      },
    );
    if (authorized === 0)
      throw new ForbiddenException("Xác thực OTP đã hết hạn hoặc đã sử dụng");
    if (authorized !== 1)
      throw new ForbiddenException("Xác thực OTP không khớp giao dịch");
    return context;
  }
  async restoreAuthorization(
    token: string,
    customerId: number,
    idempotencyKey: string,
    context: string,
  ) {
    await this.redis.client.set(
      `otp:authorization:${token}`,
      JSON.stringify({
        customerId,
        idempotencyKey,
        context,
      } satisfies Authorization),
      { EX: 120, NX: true },
    );
  }
  async markCompleted(
    customerId: number,
    idempotencyKey: string,
    context: string,
  ) {
    try {
      await this.redis.client.set(
        `otp:completed:${customerId}:${idempotencyKey}`,
        context,
        { EX: 86400 },
      );
    } catch {
      return;
    }
  }
  private customer(user: AuthUser) {
    if (!user.customerId)
      throw new ForbiddenException("Customer identity required");
    return user.customerId;
  }
  private hash(value: string) {
    return createHmac("sha256", this.secret).update(value).digest("hex");
  }
  private mask(email: string) {
    const [name, domain] = email.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }
  private async send(email: string, name: string, code: string) {
    const apiKey = this.config.get<string>("BREVO_API_KEY"),
      sender = this.config.get<string>("OTP_SENDER_EMAIL");
    if (!apiKey || !sender)
      throw new ServiceUnavailableException(
        "OTP email provider is not configured",
      );
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          email: sender,
          name: this.config.get<string>("OTP_SENDER_NAME", "D4 Bank"),
        },
        to: [{ email, name }],
        subject: "Mã xác thực giao dịch D4 Bank",
        textContent: `Mã OTP của bạn là ${code}. Mã có hiệu lực trong 5 phút. Không cung cấp mã này cho bất kỳ ai.`,
      }),
    });
    if (!response.ok)
      throw new ServiceUnavailableException("Không thể gửi email OTP");
    const receipt = await response.json() as { messageId?: string };
    return receipt.messageId ?? null;
  }
}
