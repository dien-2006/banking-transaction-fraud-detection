import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../security/redis.service';
import { SecurityThrottle } from '../security/throttle.service';
import { sendOtpEmail } from '../security/otp-email';
import { ActivationDto, ActivationEmailDto, RegistrationDto } from './registration.dto';

export interface RegistrationResult { customerId: string; code: string; name: string; username: string }
type OtpPurpose = 'registration' | 'activation';
interface ActivationTarget { customerId: string; customerCode: string }

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);
  private readonly secret: string;
  constructor(private readonly db: DatabaseService, private readonly redis: RedisService,
    private readonly throttle: SecurityThrottle, private readonly config: ConfigService) {
    this.secret = config.getOrThrow<string>('OTP_HASH_SECRET');
  }
  private hash(value: string, purpose: OtpPurpose = 'registration') {
    return createHmac('sha256', this.secret).update(`${purpose}:${value}`).digest('hex');
  }

  async requestEmail(email: string, ip: string) {
    return this.issueEmail(email, ip, 'registration');
  }

  async requestActivationEmail(dto: ActivationEmailDto, ip: string) {
    return this.issueEmail(dto.email, ip, 'activation', async () => {
      // A shared or missing email is not sufficient proof to claim a customer.
      const found = await this.db.pool.query(`SELECT c.customerid::text AS "customerId", c.customercode AS "customerCode"
        FROM banking.customer c WHERE c.customercode=$2 AND lower(btrim(c.email))=$1 AND c.status='Active'
        AND NOT EXISTS (SELECT 1 FROM banking.customer_online_account a WHERE a.customerid=c.customerid)
        AND (SELECT count(*) FROM banking.customer WHERE lower(btrim(email))=$1)=1`, [dto.email, dto.customerCode]);
      return found.rows[0] as ActivationTarget | undefined;
    });
  }

  private async issueEmail(email: string, ip: string, purpose: OtpPurpose,
    resolveTarget?: () => Promise<ActivationTarget | undefined>) {
    this.redis.assertReady();
    await this.throttle.check(`${purpose}-email-ip`, ip, 10, 3600);
    await this.throttle.check(`${purpose}-email-address`, email, 5, 3600);
    const rateKey = `${purpose}:resend:${this.hash(email, purpose)}`;
    if (!await this.redis.client.set(rateKey, '1', { NX: true, EX: 60 })) {
      const retryAfter = Math.max(1, await this.redis.client.ttl(rateKey));
      throw new HttpException({ message: `Vui lòng chờ ${retryAfter} giây trước khi gửi lại mã.`, retryAfter }, HttpStatus.TOO_MANY_REQUESTS);
    }
    const challengeId = randomUUID();
    const response = { challengeId, expiresIn: 300, resendAfter: 60, deliveryStatus: 'ACCEPTED' };
    try {
      const target = await resolveTarget?.();
      // Same public response for unknown, mismatched, blocked or already activated profiles.
      if (resolveTarget && !target) return response;
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      // Separate Redis namespaces and HMAC purposes prevent cross-flow OTP use.
      await this.redis.client.set(`${purpose}:challenge:${challengeId}`,
        JSON.stringify({ email, ...target, codeHash: this.hash(`${challengeId}:${code}`, purpose), attempts: 0 }), { EX: 300 });
      const subject = purpose === 'activation' ? 'Mã kích hoạt ngân hàng trực tuyến D4 Bank' : 'Mã xác nhận đăng ký D4 Bank';
      const messageId = await sendOtpEmail(this.config, email, 'Quý khách', code, subject);
      // Correlate with provider event logs without recording recipient, code or API key.
      this.logger.log({ event: `${purpose}_otp_accepted`, challengeId, messageId });
      return response;
    } catch (error) {
      await this.redis.client.del([`${purpose}:challenge:${challengeId}`, rateKey]);
      throw error;
    }
  }

  private async verifyChallenge(dto: RegistrationDto | ActivationDto, ip: string, purpose: OtpPurpose) {
    this.redis.assertReady();
    await this.throttle.check(`${purpose}-submit-ip`, ip, 30, 900);
    const verified = await this.redis.client.eval(`
      local raw=redis.call('GET',KEYS[1])
      if not raw then return 'expired' end
      local challenge=cjson.decode(raw)
      if challenge.email~=ARGV[1] or challenge.codeHash~=ARGV[2] or (challenge.customerCode or '')~=ARGV[3] then
        challenge.attempts=challenge.attempts+1
        if challenge.attempts>=5 then redis.call('DEL',KEYS[1]); return 'locked' end
        redis.call('SET',KEYS[1],cjson.encode(challenge),'KEEPTTL')
        return 'invalid'
      end
      return challenge.customerId or 'ok'
    `, { keys: [`${purpose}:challenge:${dto.challengeId}`],
      arguments: [dto.email, this.hash(`${dto.challengeId}:${dto.code}`, purpose), 'customerCode' in dto ? dto.customerCode : ''] });
    if (typeof verified !== 'string' || (purpose === 'registration' ? verified !== 'ok' : !/^[1-9]\d{0,18}$/.test(verified)))
      throw new ForbiddenException(verified === 'locked'
      ? 'OTP đã bị khóa sau 5 lần thử. Vui lòng yêu cầu mã mới.' : 'OTP không đúng hoặc đã hết hạn.');
    return verified;
  }

  async register(dto: RegistrationDto, ip: string): Promise<RegistrationResult> {
    await this.verifyChallenge(dto, ip, 'registration');

    const context = this.hash(`profile:${JSON.stringify({ email: dto.email, name: dto.name, phone: dto.phone, username: dto.username })}`);
    return this.db.transaction({ ipAddress: ip }, async client => {
      // Durable one-registration-per-challenge identity lives in the existing audit log.
      // Redis is not a commit boundary: a lost response can safely replay this request.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('registration:'||$1,0))", [dto.challengeId]);
      const prior = await client.query(`SELECT newvalue FROM banking.audit_log
        WHERE entitytype='CUSTOMER_REGISTRATION' AND entityid=$1 AND action='INSERT' ORDER BY auditid LIMIT 1`, [dto.challengeId]);
      if (prior.rows.length) {
        const saved = prior.rows[0].newvalue;
        if (saved.context !== context)
          throw new ConflictException('Mã xác nhận đã dùng cho thông tin khác. Vui lòng đăng nhập hoặc yêu cầu mã mới.');
        const password = await client.query(`SELECT banking_api.verify_password($1,passwordhash) AS valid
          FROM banking.customer_online_account WHERE customerid=$2`, [dto.password, saved.result.customerId]);
        if (!password.rows[0]?.valid) throw new ConflictException('Tài khoản đã được tạo với mật khẩu trước đó. Vui lòng đăng nhập.');
        return saved.result as RegistrationResult;
      }
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('registration-email:'||$1,0))", [dto.email]);
      const existing = await client.query('SELECT 1 FROM banking.customer WHERE lower(btrim(email))=$1 LIMIT 1', [dto.email]);
      if (existing.rows.length) throw new ConflictException('Email đã có hồ sơ khách hàng. Vui lòng đăng nhập hoặc chọn Kích hoạt ngân hàng trực tuyến.');
      const staffName = await client.query('SELECT 1 FROM banking.system_user WHERE lower(btrim(username))=$1 LIMIT 1', [dto.username]);
      if (staffName.rows.length) throw new ConflictException('Tên đăng nhập đã được sử dụng. Vui lòng chọn tên khác.');
      const customer = await client.query(`SELECT banking_api.create_customer(NULL,$1,NULL,NULL,NULL,$2,$3,NULL,NULL,NULL,NULL) AS result`,
        [dto.name, dto.phone, dto.email]);
      const created = customer.rows[0]?.result;
      const audit = await client.query(`SELECT 1 FROM banking.audit_log WHERE entitytype='CUSTOMER'
        AND entityid=$1 AND action='INSERT' AND userid IS NULL LIMIT 1`, [String(created.customerid)]);
      if (!audit.rows.length) throw new Error('CONFIGURATION:Thiếu audit trigger khách hàng. Đăng ký chưa được lưu.');
      await client.query('SELECT banking_api.register_customer_online_account($1,$2,$3)', [created.customerid, dto.username, dto.password]);
      const result: RegistrationResult = { customerId: String(created.customerid), code: created.customercode,
        name: created.fullname, username: dto.username };
      await client.query(`INSERT INTO banking.audit_log(entitytype,entityid,action,newvalue,ipaddress)
        VALUES('CUSTOMER_REGISTRATION',$1,'INSERT',$2::jsonb,$3)`, [dto.challengeId, JSON.stringify({ context, result }), ip]);
      return result;
    });
  }

  async activate(dto: ActivationDto, ip: string): Promise<RegistrationResult> {
    const customerId = await this.verifyChallenge(dto, ip, 'activation');
    const context = this.hash(`profile:${JSON.stringify({ email: dto.email, customerCode: dto.customerCode, username: dto.username })}`, 'activation');
    return this.db.transaction({ ipAddress: ip }, async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('activation:'||$1,0))", [dto.challengeId]);
      // Lock the actual DB identity bound to this OTP, never a client-supplied ID.
      const profile = await client.query(`SELECT customerid, customercode, fullname, email, status
        FROM banking.customer WHERE customerid=$1 FOR UPDATE`, [customerId]);
      const customer = profile.rows[0];
      if (!customer || customer.status !== 'Active' || customer.customercode !== dto.customerCode
        || customer.email?.trim().toLowerCase() !== dto.email)
        throw new ForbiddenException('Hồ sơ đã thay đổi hoặc không đủ điều kiện kích hoạt. Vui lòng liên hệ chi nhánh.');
      const prior = await client.query(`SELECT newvalue FROM banking.audit_log
        WHERE entitytype='CUSTOMER_ACTIVATION' AND entityid=$1 AND action='INSERT' ORDER BY auditid LIMIT 1`, [dto.challengeId]);
      if (prior.rows.length) {
        const saved = prior.rows[0].newvalue;
        if (saved.context !== context || saved.result.customerId !== customerId)
          throw new ConflictException('Mã xác nhận đã được sử dụng. Vui lòng đăng nhập hoặc yêu cầu mã mới.');
        const password = await client.query(`SELECT banking_api.verify_password($1,passwordhash) AS valid
          FROM banking.customer_online_account WHERE customerid=$2 AND username=$3 AND isactive`, [dto.password, customerId, dto.username]);
        if (!password.rows[0]?.valid) throw new ConflictException('Tài khoản đã được kích hoạt. Vui lòng đăng nhập.');
        return saved.result as RegistrationResult;
      }
      const sharedEmail = await client.query(`SELECT 1 FROM banking.customer
        WHERE lower(btrim(email))=$1 AND customerid<>$2 LIMIT 1`, [dto.email, customerId]);
      if (sharedEmail.rows.length) throw new ForbiddenException('Email cần được chi nhánh đối soát trước khi kích hoạt.');
      const login = await client.query('SELECT 1 FROM banking.customer_online_account WHERE customerid=$1', [customerId]);
      if (login.rows.length) throw new ConflictException('Hồ sơ đã có tài khoản đăng nhập. Vui lòng đăng nhập hoặc liên hệ chi nhánh để khôi phục.');
      const staffName = await client.query('SELECT 1 FROM banking.system_user WHERE lower(btrim(username))=$1 LIMIT 1', [dto.username]);
      if (staffName.rows.length) throw new ConflictException('Tên đăng nhập đã được sử dụng. Vui lòng chọn tên khác.');
      await client.query('SELECT banking_api.register_customer_online_account($1,$2,$3)', [customerId, dto.username, dto.password]);
      const result: RegistrationResult = { customerId, code: customer.customercode, name: customer.fullname, username: dto.username };
      // Keep the success marker atomic with login creation so lost responses can be retried.
      await client.query(`INSERT INTO banking.audit_log(entitytype,entityid,action,newvalue,ipaddress)
        VALUES('CUSTOMER_ACTIVATION',$1,'INSERT',$2::jsonb,$3)`, [dto.challengeId, JSON.stringify({ context, result }), ip]);
      return result;
    });
  }
}
