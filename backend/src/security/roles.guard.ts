import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthRequest, AuthUser } from './auth.guard';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles=this.reflector.getAllAndOverride<AuthUser['role'][]>('roles',[context.getHandler(),context.getClass()]);
    if(!roles?.length)return true;
    const user=context.switchToHttp().getRequest<AuthRequest>().user;
    if(!user||!roles.includes(user.role))throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    return true;
  }
}
