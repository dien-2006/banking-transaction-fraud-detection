import { Body, Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../security/decorators';
import { RegistrationDto, RegistrationEmailDto } from './registration.dto';
import { RegistrationService } from './registration.service';

@Controller('auth/registration')
@Public()
export class RegistrationController {
  constructor(private readonly registration: RegistrationService) {}
  @Post('otp') request(@Body() dto: RegistrationEmailDto, @Req() req: Request) {
    return this.registration.requestEmail(dto.email, req.ip ?? 'unknown');
  }
  @Post() register(@Body() dto: RegistrationDto, @Req() req: Request) {
    return this.registration.register(dto, req.ip ?? 'unknown');
  }
}
