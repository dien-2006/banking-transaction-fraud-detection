import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../security/decorators';
import { AuthUser } from '../security/auth.guard';
import { TrinoService } from './trino.service';

const DATASETS = { transactions:'vw_transaction_daily_summary',risk:'vw_risk_daily_summary',reviews:'vw_review_performance',models:'vw_model_performance',logins:'vw_login_daily_summary',loans:'vw_loan_payment_daily_summary' } as const;

@Controller('analytics')
@Roles('admin')
export class AnalyticsController {
  constructor(private readonly trino: TrinoService) {}
  @Get()
  query(@CurrentUser() user: AuthUser,@Query('dataset') dataset='transactions',@Query('limit') requestedLimit='100') {
    if (user.role!=='admin') throw new ForbiddenException();
    const view=DATASETS[dataset as keyof typeof DATASETS];
    if (!Object.hasOwn(DATASETS, dataset)) throw new ForbiddenException('Unsupported analytics dataset');
    const limit=Math.floor(Math.min(Math.max(Number(requestedLimit)||100,1),1000));
    return this.trino.query(`SELECT * FROM hive.gold.${view} ORDER BY ${dataset==='models'?'model_key':'full_date DESC'} LIMIT ${limit}`);
  }
}
