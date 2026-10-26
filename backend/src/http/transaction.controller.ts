import { Body, Controller, ForbiddenException, Get, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../database/database.service';
import { CurrentUser } from '../security/decorators';
import { AuthUser } from '../security/auth.guard';
import { LoanPaymentDto, MovementDto, ReviewDto, ReversalDto, TransferDto } from './dto';
import { OtpService } from '../security/otp.service';

@Controller('transactions')
export class TransactionController {
  constructor(private readonly db: DatabaseService, private readonly otp: OtpService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: Record<string, string>) {
    return this.db.function('banking_api.list_transactions', [
      user.role === 'customer' ? user.customerId : q.customerId ? Number(q.customerId) : null,
      q.accountId ? Number(q.accountId) : null, q.status ?? null, q.type ?? null,
      q.from ?? null, q.to ?? null, Number(q.page ?? 1), Number(q.pageSize ?? 20),
    ]);
  }

  @Get('destinations/:accountNumber')
  destination(@CurrentUser() user: AuthUser, @Param('accountNumber') accountNumber: string) {
    if (!user.customerId) throw new ForbiddenException('Customer identity required');
    return this.db.function('banking_api.resolve_transfer_destination', [accountNumber]);
  }

  @Get(':id')
  detail(@CurrentUser() user:AuthUser,@Param('id',ParseIntPipe)id:number){
    return this.db.function('banking_api.get_transaction',[id,user.role==='customer'?user.customerId:null]);
  }

  @Post('transfers')
  async transfer(@CurrentUser() user: AuthUser, @Body() dto: TransferDto, @Req() req: Request) {
    if (!user.customerId) throw new ForbiddenException('Customer identity required');
    const otpContext = await this.otp.authorize(user, dto);
    try {
      const result = await this.db.function('banking_api.create_transfer', [user.customerId,
        dto.sourceAccountId, dto.destinationAccountId, dto.amount, dto.idempotencyKey,
        dto.channel, user.deviceId ?? null, req.ip, dto.description ?? null]);
      await this.otp.markCompleted(user.customerId, dto.idempotencyKey, otpContext);
      return result;
    } catch (error) {
      await this.otp.restoreAuthorization(dto.otpAuthorizationToken,user.customerId,dto.idempotencyKey,otpContext).catch(()=>undefined);
      throw error;
    }
  }

  @Post('account-movements')
  movement(@CurrentUser() user: AuthUser, @Body() dto: MovementDto) {
    if (user.role === 'customer' && dto.type !== 'WITHDRAWAL') throw new ForbiddenException();
    return this.db.function('banking_api.create_account_movement', [dto.type,
      user.customerId ?? null, dto.debitAccountId, dto.creditAccountId, dto.amount,
      dto.transactionCode, dto.channel, user.employeeId ?? null, dto.description ?? null],
      { userId: user.userId });
  }

  @Post('loan-payments')
  loanPayment(@CurrentUser() user: AuthUser, @Body() dto: LoanPaymentDto) {
    if (!user.customerId) throw new ForbiddenException('Customer identity required');
    return this.db.function('banking_api.pay_loan', [user.customerId, dto.loanId,
      dto.scheduleId, dto.sourceAccountId, dto.internalCreditAccountId,
      dto.amount, dto.transactionCode, 'Online']);
  }

  @Post(':id/reversal')
  reversal(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReversalDto) {
    if (user.role === 'customer' || !user.employeeId) throw new ForbiddenException();
    return this.db.function('banking_api.reverse_transaction',
      [id, user.employeeId, dto.transactionCode, dto.reason], { userId: user.userId });
  }

  @Post('reviews/:id')
  review(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewDto) {
    if (user.role === 'customer' || !user.userId) throw new ForbiddenException();
    return this.db.function('banking_api.resolve_review',
      [id, user.userId, dto.action, dto.reason ?? null], { userId: user.userId });
  }
}
