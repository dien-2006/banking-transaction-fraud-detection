import { Body, Controller, ForbiddenException, Post, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, Public } from '../security/decorators';
import { LoginDto } from './dto';
import { AuthUser } from '../security/auth.guard';
import { PasswordChangeDto } from './management.dto';
import { SecurityThrottle } from '../security/throttle.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly db: DatabaseService, private readonly jwt: JwtService, private readonly throttle: SecurityThrottle) {}
  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() request: Request) {
    await this.throttle.check('login-ip', request.ip ?? 'unknown', 50, 60);
    await this.throttle.check('login-account', dto.username.trim().toLowerCase(), 10, 900);
    const user = await this.db.authenticate(
      dto.username,
      dto.password,
      dto.role as 'customer' | 'employee' | 'admin' | undefined,
      dto.deviceCode ?? null,
      request.ip,
    );
    const accessToken = await this.jwt.signAsync({ ...user, sub: String(user.customerId ?? user.userId) });
    return { accessToken, tokenType: 'Bearer', expiresIn: 900, user };
  }
  @Post('password')
  changePassword(@CurrentUser()user:AuthUser,@Body()dto:PasswordChangeDto){
    if(!user.userId)throw new ForbiddenException('Employee identity required');
    return this.db.function('banking_api.change_system_user_password',[user.userId,dto.oldPassword,dto.newPassword],{userId:user.userId});
  }
}
