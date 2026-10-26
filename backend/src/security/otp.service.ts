import { ForbiddenException, HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { AuthUser } from './auth.guard';
import { RedisService } from './redis.service';
import { TransferDto, TransferOtpRequestDto, TransferOtpVerifyDto } from '../http/dto';

interface Profile { email?:string;fullname?:string }
interface Challenge {customerId:number;context:string;codeHash:string;attempts:number}
interface Authorization {customerId:number;context:string;idempotencyKey:string}

@Injectable()
export class OtpService {
  private readonly secret:string;
  constructor(private readonly redis:RedisService,private readonly db:DatabaseService,private readonly config:ConfigService){
    this.secret=config.getOrThrow<string>('OTP_HASH_SECRET');
  }
  context(customerId:number,dto:TransferOtpRequestDto):string{return createHmac('sha256',this.secret).update(JSON.stringify({customerId,sourceAccountId:dto.sourceAccountId,destinationAccountId:dto.destinationAccountId,amount:String(dto.amount),idempotencyKey:dto.idempotencyKey,channel:dto.channel})).digest('hex');}
  async request(user:AuthUser,dto:TransferOtpRequestDto){
    const customerId=this.customer(user);this.redis.assertReady();
    const rateKey=`otp:rate:${customerId}`;
    if(!(await this.redis.client.set(rateKey,'1',{NX:true,EX:60})))throw new HttpException('Vui lòng chờ 60 giây trước khi gửi lại OTP',HttpStatus.TOO_MANY_REQUESTS);
    const profile=await this.db.function<Profile>('banking_api.get_customer_profile',[customerId]);
    if(!profile?.email){await this.redis.client.del(rateKey);throw new ServiceUnavailableException('Customer email is not configured');}
    const code=String(randomInt(0,1_000_000)).padStart(6,'0'),challengeId=randomUUID();
    const challenge:Challenge={customerId,context:this.context(customerId,dto),codeHash:this.hash(code),attempts:0};
    await this.redis.client.set(`otp:challenge:${challengeId}`,JSON.stringify(challenge),{EX:300});
    try{await this.send(profile.email,profile.fullname??'Quý khách',code);}catch(error){await this.redis.client.del([`otp:challenge:${challengeId}`,rateKey]);throw error;}
    return {challengeId,expiresIn:300,destinationMasked:this.mask(profile.email)};
  }
  async verify(user:AuthUser,dto:TransferOtpVerifyDto){
    this.redis.assertReady();
    const customerId=this.customer(user),key=`otp:challenge:${dto.challengeId}`,raw=await this.redis.client.get(key);
    if(!raw)throw new ForbiddenException('OTP đã hết hạn hoặc không tồn tại');
    const challenge=JSON.parse(raw) as Challenge;
    if(challenge.customerId!==customerId||challenge.context!==this.context(customerId,dto))throw new ForbiddenException('OTP không thuộc giao dịch này');
    const expected=Buffer.from(challenge.codeHash,'hex'),actual=Buffer.from(this.hash(dto.code),'hex');
    if(expected.length!==actual.length||!timingSafeEqual(expected,actual)){
      challenge.attempts+=1;if(challenge.attempts>=5){await this.redis.client.del(key);throw new ForbiddenException('OTP đã bị khóa');}
      const ttl=await this.redis.client.ttl(key);await this.redis.client.set(key,JSON.stringify(challenge),{EX:Math.max(ttl,1)});
      throw new ForbiddenException(`OTP không đúng, còn ${5-challenge.attempts} lần thử`);
    }
    const token=randomUUID(),authorization:Authorization={customerId,context:challenge.context,idempotencyKey:dto.idempotencyKey};
    await this.redis.client.multi().del(key).set(`otp:authorization:${token}`,JSON.stringify(authorization),{EX:120}).exec();
    return {authorizationToken:token,expiresIn:120};
  }
  async authorize(user:AuthUser,dto:TransferDto):Promise<string>{
    this.redis.assertReady();
    const customerId=this.customer(user),context=this.context(customerId,dto),completedKey=`otp:completed:${customerId}:${dto.idempotencyKey}`;
    if(await this.redis.client.get(completedKey)===context)return context;
    const raw=await this.redis.client.sendCommand(['GETDEL',`otp:authorization:${dto.otpAuthorizationToken}`]) as string|null;
    if(!raw)throw new ForbiddenException('Xác thực OTP đã hết hạn hoặc đã sử dụng');
    const authorization=JSON.parse(raw) as Authorization;
    if(authorization.customerId!==customerId||authorization.context!==context||authorization.idempotencyKey!==dto.idempotencyKey)throw new ForbiddenException('Xác thực OTP không khớp giao dịch');
    return context;
  }
  async restoreAuthorization(token:string,customerId:number,idempotencyKey:string,context:string){
    await this.redis.client.set(`otp:authorization:${token}`,JSON.stringify({customerId,idempotencyKey,context} satisfies Authorization),{EX:120,NX:true});
  }
  async markCompleted(customerId:number,idempotencyKey:string,context:string){
    try{await this.redis.client.set(`otp:completed:${customerId}:${idempotencyKey}`,context,{EX:86400});}catch{return;}
  }
  private customer(user:AuthUser){if(!user.customerId)throw new ForbiddenException('Customer identity required');return user.customerId;}
  private hash(value:string){return createHmac('sha256',this.secret).update(value).digest('hex');}
  private mask(email:string){const[name,domain]=email.split('@');return `${name.slice(0,2)}***@${domain}`;}
  private async send(email:string,name:string,code:string){const apiKey=this.config.get<string>('BREVO_API_KEY'),sender=this.config.get<string>('OTP_SENDER_EMAIL');if(!apiKey||!sender)throw new ServiceUnavailableException('OTP email provider is not configured');const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',signal:AbortSignal.timeout(10000),headers:{accept:'application/json','api-key':apiKey,'content-type':'application/json'},body:JSON.stringify({sender:{email:sender,name:this.config.get<string>('OTP_SENDER_NAME','D4 Bank')},to:[{email,name}],subject:'Mã xác thực giao dịch D4 Bank',textContent:`Mã OTP của bạn là ${code}. Mã có hiệu lực trong 5 phút. Không cung cấp mã này cho bất kỳ ai.`})});if(!response.ok)throw new ServiceUnavailableException('Không thể gửi email OTP');}
}
