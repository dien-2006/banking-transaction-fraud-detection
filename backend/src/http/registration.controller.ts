import { Body, Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../security/decorators';
import { ActivationDto, ActivationEmailDto, RegistrationDto, RegistrationEmailDto } from './registration.dto';
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

@Controller('auth/activation')
@Public()
export class ActivationController {
  constructor(private readonly registration: RegistrationService) {}
  @Post('otp') request(@Body() dto: ActivationEmailDto, @Req() req: Request) {
    return this.registration.requestActivationEmail(dto, req.ip ?? 'unknown');
  }
  @Post() activate(@Body() dto: ActivationDto, @Req() req: Request) {
    return this.registration.activate(dto, req.ip ?? 'unknown');
  }
}
