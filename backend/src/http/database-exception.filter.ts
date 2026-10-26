import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

interface PgError extends Error { code?: string; constraint?: string }

@Catch()
export class DatabaseExceptionFilter implements ExceptionFilter {
  catch(error: PgError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      response.status(error.getStatus()).json(error.getResponse());
      return;
    }
    const marker = error.message?.match(/(AUTH_INVALID|AUTH_BLOCKED|FORBIDDEN|NOT_FOUND|CONFLICT|VALIDATION|ACCOUNT_INACTIVE|CONFIGURATION|INTEGRITY):([^\n]+)/);
    if (!marker && !error.code?.startsWith('23')) {
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({statusCode:HttpStatus.INTERNAL_SERVER_ERROR,code:'INTERNAL_ERROR',message:'Internal server error'});
      return;
    }
    const code = marker?.[1] ?? 'INTEGRITY';
    const status = ({
      AUTH_INVALID: HttpStatus.UNAUTHORIZED,
      AUTH_BLOCKED: HttpStatus.FORBIDDEN,
      FORBIDDEN: HttpStatus.FORBIDDEN,
      NOT_FOUND: HttpStatus.NOT_FOUND,
      CONFLICT: HttpStatus.CONFLICT,
      VALIDATION: HttpStatus.UNPROCESSABLE_ENTITY,
      ACCOUNT_INACTIVE: HttpStatus.UNPROCESSABLE_ENTITY,
      CONFIGURATION: HttpStatus.SERVICE_UNAVAILABLE,
      INTEGRITY: HttpStatus.CONFLICT,
    } as Record<string, number>)[code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(status).json({ statusCode: status, code,
      message: marker?.[2]?.trim() ?? 'Database integrity constraint rejected the request' });
  }
}
