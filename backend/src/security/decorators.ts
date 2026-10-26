import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthRequest, AuthUser } from './auth.guard';
export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: AuthUser['role'][]) => SetMetadata('roles', roles);
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser =>
  ctx.switchToHttp().getRequest<AuthRequest>().user);
