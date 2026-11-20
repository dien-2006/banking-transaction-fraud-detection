import { RegistrationController } from './http/registration.controller';
import { RegistrationService } from './http/registration.service';
import { CounterTransferController, CounterTransferService } from './http/counter-transfer';
import { CustomerProductsController, LoanDecisionController } from './http/customer-products.controller';
import { CustomerProductsService } from './http/customer-products.service';
import { LoanPaymentOptionsController, LoanPaymentOptionsService } from './http/loan-payment-options';
import { CardNumberRevealController, CardNumberRevealService } from './http/card-number-reveal';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { SecurityThrottle } from './security/throttle.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>('JWT_SECRET'), signOptions: { expiresIn: '15m' } }),
    }),
    DatabaseModule, AnalyticsModule,
  ],
  controllers: [RegistrationController, AuthController, CustomerController, CustomerProductsController, LoanDecisionController, LoanPaymentOptionsController, CardNumberRevealController, TransactionController, AdminController, ManagementController, HealthController, OtpController, CounterTransferController],
  providers: [
    RegistrationService,
    CounterTransferService,
    CustomerProductsService,
    LoanPaymentOptionsService,
    CardNumberRevealService,
    RedisService,
    SecurityThrottle,
    OtpService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: DatabaseExceptionFilter },
  ],
})
export class AppModule {}
