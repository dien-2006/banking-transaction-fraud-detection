import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { employeeBranch } from './branch-access';
import { DatabaseService } from '../database/database.service';

export interface AuthUser {
  sub: string; role: 'customer' | 'employee' | 'admin'; actorType: 'customer' | 'employee';
  customerId?: number; userId?: number; employeeId?: number; deviceId?: number;
  branchId?: number;
}
export interface AuthRequest extends Request { user: AuthUser }

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly reflector: Reflector,
    private readonly db: DatabaseService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>('public', [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('Missing bearer token');
    try {
      const user = await this.jwt.verifyAsync<AuthUser>(token);
      const positive = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0;
      if (!['admin', 'employee', 'customer'].includes(user.role)
        || (user.role === 'customer' ? user.actorType !== 'customer' || !positive(user.customerId)
          : user.actorType !== 'employee' || !positive(user.userId) || !positive(user.employeeId))) {
        throw new Error('Invalid actor identity');
      }
      employeeBranch(user);
      if (!await this.db.isActorActive(user)) throw new Error('Actor permissions changed');
      request.user = user;
      return true;
    }
    catch { throw new UnauthorizedException('Invalid or expired token'); }
  }
}
