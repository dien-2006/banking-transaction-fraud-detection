import { Body, Controller, ForbiddenException, Get, Post, Query } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, Roles } from '../security/decorators';
import { AuthUser } from '../security/auth.guard';
import { staffReadBranch } from '../security/branch-access';
import { createManualFraudReview, ManualFraudReviewDto } from './manual-fraud-review';

@Controller('admin')
export class AdminController {
  constructor(private readonly db: DatabaseService) {}
  private employee(user: AuthUser): void {
    staffReadBranch(user);
  }
  @Get('dashboard') dashboard(@CurrentUser() user: AuthUser, @Query() q: Record<string, string> = {}) {
    this.employee(user);
    return this.db.adminOverview(staffReadBranch(user, q.branchId) ?? undefined, user.userId);
  }
  @Get('profile') profile(@CurrentUser() user: AuthUser) {
    this.employee(user);
    return this.db.function('banking_api.get_employee_profile', [user.userId]);
  }
  @Get('notifications') notifications(@CurrentUser() user: AuthUser,
    @Query('page') page = '1', @Query('pageSize') size = '20') {
    this.employee(user);
    return this.db.function('banking_api.list_employee_notifications', [
      user.userId, Number(page), Number(size),
    ]);
  }
  @Get('fraud-reviews') reviews(@CurrentUser() user: AuthUser,
    @Query('status') status?: string, @Query('page') page = '1', @Query('pageSize') size = '20', @Query('branchId') branchId?: string) {
    this.employee(user);
    return this.db.function('banking_api.list_fraud_reviews', [
      status ?? null, Number(page), Number(size), staffReadBranch(user, branchId),
    ]);
  }
  @Roles('admin')
  @Post('fraud-reviews') createReview(@CurrentUser() user: AuthUser, @Body() input: ManualFraudReviewDto) {
    return createManualFraudReview(this.db, user, input);
  }
  @Get('customers') customers(@CurrentUser() user: AuthUser, @Query() q: Record<string, string>) {
    this.employee(user); return this.db.function('banking_api.list_customers', [
      q.query ?? null, q.status ?? null, Number(q.page ?? 1), Number(q.pageSize ?? 20),
      staffReadBranch(user, q.branchId),
    ], { userId: user.userId });
  }
  @Roles('admin')
  @Get('employees') employees(@CurrentUser() user: AuthUser, @Query() q: Record<string, string>) {
    this.employee(user); return this.db.function('banking_api.list_employees', [
      q.query ?? null, q.status ?? null, staffReadBranch(user, q.branchId),
      Number(q.page ?? 1), Number(q.pageSize ?? 20),
    ]);
  }
  @Get('accounts') accounts(@CurrentUser() user: AuthUser, @Query() q: Record<string, string>) {
    this.employee(user); return this.db.function('banking_api.list_accounts', [
      q.query ?? null, q.status ?? null, Number(q.page ?? 1), Number(q.pageSize ?? 20),
      staffReadBranch(user, q.branchId),
    ]);
  }
  @Roles('admin')
  @Get('branches') branches(@CurrentUser() user: AuthUser, @Query() q: Record<string, string>) {
    this.employee(user); return this.db.function('banking_api.list_branches', [
      q.query ?? null, q.status ?? null, Number(q.page ?? 1), Number(q.pageSize ?? 20),
    ]);
  }
  @Get('cards') cards(@CurrentUser() user: AuthUser, @Query() q: Record<string, string>) {
    this.employee(user); return this.db.function('banking_api.list_cards', [
      q.customerId ? Number(q.customerId) : null, q.accountId ? Number(q.accountId) : null,
      q.status ?? null, Number(q.page ?? 1), Number(q.pageSize ?? 20),
      staffReadBranch(user, q.branchId),
    ]);
  }
  @Get('loans') loans(@CurrentUser() user: AuthUser, @Query() q: Record<string, string>) {
    this.employee(user); return this.db.function('banking_api.list_loans', [
      q.customerId ? Number(q.customerId) : null, q.status ?? null,
      staffReadBranch(user, q.branchId),
      Number(q.page ?? 1), Number(q.pageSize ?? 20),
    ]);
  }
  @Roles('admin')
  @Get('audit-logs') auditLogs(@CurrentUser() user: AuthUser, @Query() q: Record<string, string>) {
    this.employee(user); return this.db.function('banking_api.list_audit_logs', [
      q.userId ? Number(q.userId) : null, q.action ?? null, q.from ?? null, q.to ?? null,
      Number(q.page ?? 1), Number(q.pageSize ?? 20),
    ]);
  }
  @Get('reference-data') referenceData(@CurrentUser() user: AuthUser) {
    this.employee(user); return this.db.function('banking_api.get_reference_data');
  }
  @Get('branch-dashboard') branchDashboard(@CurrentUser() user: AuthUser, @Query() q: Record<string, string>) {
    this.employee(user);
    const branchId = staffReadBranch(user, q.branchId);
    if (!branchId) throw new ForbiddenException('Branch identity required');
    if (q.from && q.to) return this.db.function('banking_api.branch_dashboard', [branchId, q.from, q.to]);
    if (q.from) return this.db.function('banking_api.branch_dashboard', [branchId, q.from]);
    return this.db.function('banking_api.branch_dashboard', [branchId]);
  }
}
