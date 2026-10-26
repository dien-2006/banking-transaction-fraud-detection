import { Body, Controller, ForbiddenException, Post, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, Public } from '../security/decorators';
import { LoginDto } from './dto';
import { AuthUser } from '../security/auth.guard';
import { PasswordChangeDto } from './management.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly db: DatabaseService, private readonly jwt: JwtService) {}
  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() request: Request) {
    const user = await this.db.authenticate(
      dto.username,
      dto.password,
      dto.role as 'customer' | 'employee' | 'admin',
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
