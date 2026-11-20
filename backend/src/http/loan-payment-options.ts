import { Controller, Get, Injectable, NotFoundException, Param, ParseIntPipe, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuthUser } from '../security/auth.guard';
import { CurrentUser, Roles } from '../security/decorators';

@Injectable()
export class LoanPaymentOptionsService {
  constructor(private readonly db:DatabaseService) {}
  async get(loanId:number,user:AuthUser) {
    if(user.role!=='customer'||!user.customerId)throw new ForbiddenException('Chỉ dành cho khách hàng.');
    const result=await this.db.pool.query(`SELECT l.loanid,l.status,banking_api.loan_is_funded(l.loanid) AS funded,
      (SELECT banking_api.transaction_result(t.transactionid) FROM banking.bank_transaction t
        WHERE t.description=concat('LOAN_DISBURSEMENT|',l.loanid) ORDER BY t.transactionid DESC LIMIT 1) AS disbursement,
      (SELECT a.accountnumber FROM banking.bank_transaction t JOIN banking.transfer_request tr USING(transactionid)
        JOIN banking.bank_account a ON a.accountid=tr.destinationaccountid
        WHERE t.description=concat('LOAN_DISBURSEMENT|',l.loanid) ORDER BY t.transactionid DESC LIMIT 1) AS "receivingAccountNumber",
      banking_api.loan_counterparty_account(l.loanid,FALSE) IS NOT NULL AS "settlementReady",
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'scheduleId',s.scheduleid,'installmentNo',s.installmentno,'dueDate',s.duedate,'status',s.status,
        'principal',r.remaining->>'principal','interest',r.remaining->>'interest','penalty',r.remaining->>'penalty','total',r.remaining->>'total',
        'pendingPayment',EXISTS(SELECT 1 FROM banking.bank_transaction t JOIN banking.transaction_type tt USING(transactiontypeid)
          WHERE tt.typecode='LOAN_PAYMENT' AND t.status='Pending'
            AND split_part(t.description,'|',1)='LOAN_PAYMENT' AND split_part(t.description,'|',2)=l.loanid::text
            AND split_part(t.description,'|',3)=s.scheduleid::text)) ORDER BY s.duedate,s.installmentno)
        FROM banking.repayment_schedule s
        CROSS JOIN LATERAL (SELECT banking_api.loan_remaining(l.loanid,s.scheduleid) AS remaining) r
        WHERE s.loanid=l.loanid AND s.status<>'Paid'),'[]'::jsonb) AS schedules
      FROM banking.loan l WHERE l.loanid=$1 AND l.customerid=$2`,[loanId,user.customerId]);
    const row=result.rows[0];
    if(!row)throw new NotFoundException('Không tìm thấy khoản vay của bạn.');
    const active=['Active','Overdue'].includes(row.status);
    return {loanId:Number(row.loanid),status:row.status,funded:row.funded,disbursement:row.disbursement,
      receivingAccountNumber:row.receivingAccountNumber,ready:active&&row.settlementReady,
      unavailableReason:!active?'Khoản vay chưa đến trạng thái thanh toán hoặc đã kết thúc.':!row.settlementReady?'Ngân hàng tạm thời chưa thể tiếp nhận thanh toán khoản vay. Vui lòng liên hệ chi nhánh.':null,
      schedules:row.schedules};
  }
}
@Controller('me/loans')
@Roles('customer')
export class LoanPaymentOptionsController {
  constructor(private readonly options:LoanPaymentOptionsService) {}
  @Get(':id/payment-options') get(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:AuthUser){return this.options.get(id,user);}
}
