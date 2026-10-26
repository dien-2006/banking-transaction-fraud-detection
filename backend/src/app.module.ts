import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from './database/database.module';
import { AuthController } from './http/auth.controller';
import { CustomerController } from './http/customer.controller';
import { TransactionController } from './http/transaction.controller';
import { AdminController } from './http/admin.controller';
import { HealthController } from './http/health.controller';
import { AuthGuard } from './security/auth.guard';
import { APP_GUARD } from '@nestjs/core';
import { APP_FILTER } from '@nestjs/core';
import { DatabaseExceptionFilter } from './http/database-exception.filter';
import { AnalyticsModule } from './analytics/analytics.module';
import { OtpController } from './security/otp.controller';
import { OtpService } from './security/otp.service';
import { RedisService } from './security/redis.service';
import { RolesGuard } from './security/roles.guard';
import { ManagementController } from './http/management.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      inject: [],
      useFactory: () => ({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '15m' } }),
    }),
    DatabaseModule, AnalyticsModule,
  ],
  controllers: [AuthController, CustomerController, TransactionController, AdminController, ManagementController, HealthController, OtpController],
  providers: [
    RedisService,
    OtpService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: DatabaseExceptionFilter },
  ],
})
export class AppModule {}
