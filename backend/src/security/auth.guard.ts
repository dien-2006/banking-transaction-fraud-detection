import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

export interface AuthUser {
  sub: string; role: 'customer' | 'employee' | 'admin'; actorType: 'customer' | 'employee';
  customerId?: number; userId?: number; employeeId?: number; deviceId?: number;
  branchId?: number;
}
export interface AuthRequest extends Request { user: AuthUser }

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>('public', [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('Missing bearer token');
    try { request.user = await this.jwt.verifyAsync<AuthUser>(token); return true; }
    catch { throw new UnauthorizedException('Invalid or expired token'); }
  }
}
