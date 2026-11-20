import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../security/redis.service';
import { SecurityThrottle } from '../security/throttle.service';
import { sendOtpEmail } from '../security/otp-email';
import { RegistrationDto } from './registration.dto';

export interface RegistrationResult { customerId: string; code: string; name: string; username: string }

@Injectable()
export class RegistrationService {
  private readonly secret: string;
  constructor(private readonly db: DatabaseService, private readonly redis: RedisService,
    private readonly throttle: SecurityThrottle, private readonly config: ConfigService) {
    this.secret = config.getOrThrow<string>('OTP_HASH_SECRET');
  }
  private hash(value: string) { return createHmac('sha256', this.secret).update(`registration:${value}`).digest('hex'); }

  async requestEmail(email: string, ip: string) {
    this.redis.assertReady();
    await this.throttle.check('registration-email-ip', ip, 10, 3600);
    await this.throttle.check('registration-email-address', email, 5, 3600);
    const rateKey = `registration:resend:${this.hash(email)}`;
    if (!await this.redis.client.set(rateKey, '1', { NX: true, EX: 60 })) {
      const retryAfter = Math.max(1, await this.redis.client.ttl(rateKey));
      throw new HttpException({ message: `Vui lòng chờ ${retryAfter} giây trước khi gửi lại mã.`, retryAfter }, HttpStatus.TOO_MANY_REQUESTS);
    }
    const challengeId = randomUUID();
    try {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      // This namespace and HMAC purpose cannot authorize transfer OTPs.
      await this.redis.client.set(`registration:challenge:${challengeId}`,
        JSON.stringify({ email, codeHash: this.hash(`${challengeId}:${code}`), attempts: 0 }), { EX: 300 });
      await sendOtpEmail(this.config, email, 'Quý khách', code, 'Mã xác nhận đăng ký D4 Bank');
      return { challengeId, expiresIn: 300, resendAfter: 60, deliveryStatus: 'ACCEPTED' };
    } catch (error) {
      await this.redis.client.del([`registration:challenge:${challengeId}`, rateKey]);
      throw error;
    }
  }

  async register(dto: RegistrationDto, ip: string): Promise<RegistrationResult> {
    this.redis.assertReady();
    await this.throttle.check('registration-submit-ip', ip, 30, 900);
    const verified = await this.redis.client.eval(`
      local raw=redis.call('GET',KEYS[1])
      if not raw then return 'expired' end
      local challenge=cjson.decode(raw)
      if challenge.email~=ARGV[1] or challenge.codeHash~=ARGV[2] then
        challenge.attempts=challenge.attempts+1
        if challenge.attempts>=5 then redis.call('DEL',KEYS[1]); return 'locked' end
        redis.call('SET',KEYS[1],cjson.encode(challenge),'KEEPTTL')
        return 'invalid'
      end
      return 'ok'
    `, { keys: [`registration:challenge:${dto.challengeId}`],
      arguments: [dto.email, this.hash(`${dto.challengeId}:${dto.code}`)] });
    if (verified !== 'ok') throw new ForbiddenException(verified === 'locked'
      ? 'OTP đã bị khóa sau 5 lần thử. Vui lòng yêu cầu mã mới.' : 'OTP không đúng hoặc đã hết hạn.');

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
      if (existing.rows.length) throw new ConflictException('Email đã có hồ sơ khách hàng. Vui lòng đăng nhập hoặc liên hệ chi nhánh để được cấp tài khoản.');
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
}
