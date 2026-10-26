import { Body,Controller,Post } from '@nestjs/common';
import { TransferOtpRequestDto,TransferOtpVerifyDto } from '../http/dto';
import { AuthUser } from './auth.guard';import { CurrentUser } from './decorators';import { OtpService } from './otp.service';
@Controller('security/otp') export class OtpController{constructor(private readonly otp:OtpService){}@Post('request')request(@CurrentUser()u:AuthUser,@Body()d:TransferOtpRequestDto){return this.otp.request(u,d);}@Post('verify')verify(@CurrentUser()u:AuthUser,@Body()d:TransferOtpVerifyDto){return this.otp.verify(u,d);}}
