import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { assertSameMovement, authorizeBusinessOperation, existingMovement, moneyUnits, movementResult, type AuthorizedMovement } from './business-authorization';

/** Customer repayments are exempt from Risk/ML. The existing core still owns
 * posting/balances/outbox and loan_remaining/finalize_loan_payment own debt math. */
export async function repayLoanWithoutRisk(client: PoolClient, args: unknown[]) {
  const [customerId, loanId, scheduleId, sourceId, configuredDestination, amount, code, channel] = args;
  if (channel !== 'Online' || configuredDestination != null || !String(code ?? '').trim()
    || String(code).length > 40 || moneyUnits(amount) <= 0n) throw new BadRequestException('Yêu cầu trả vay không hợp lệ.');
  const customer = await client.query(`SELECT 1 FROM banking.customer c JOIN banking.customer_online_account a USING(customerid)
    WHERE c.customerid=$1 AND c.status='Active' AND a.isactive FOR SHARE OF c,a`, [customerId]);
  if (!customer.rows.length) throw new ForbiddenException('Khách hàng không còn hoạt động.');
  // One loan lock serializes installments, so concurrent final installments
  // cannot leave all schedules Paid while the parent loan remains Active.
  const loan = (await client.query('SELECT customerid,status FROM banking.loan WHERE loanid=$1 FOR UPDATE', [loanId])).rows[0];
  if (!loan || String(loan.customerid) !== String(customerId)) throw new NotFoundException('Không tìm thấy khoản vay của bạn.');
  const prior = await existingMovement(client, String(code));
  const input: AuthorizedMovement = {
    operation:'LOAN_PAYMENT', type:'LOAN_PAYMENT', customerId:String(customerId), sourceId:String(sourceId),
    destinationId:prior?.destinationaccountid ?? '', amount:String(amount), key:String(code), code:String(code),
    description:`LOAN_PAYMENT|${loanId}|${scheduleId}|Online`, channel:'InternetBanking',
  };
  if (prior) {
    assertSameMovement(prior,input);
    if (prior.status !== 'Pending') return movementResult(client,prior.transactionid);
  }
  const schedule = (await client.query(`SELECT status FROM banking.repayment_schedule WHERE loanid=$1 AND scheduleid=$2 FOR UPDATE`, [loanId,scheduleId])).rows[0];
  if (!schedule || !['Active','Overdue'].includes(loan.status) || schedule.status === 'Paid') throw new ConflictException('Khoản vay hoặc kỳ trả nợ không còn thanh toán được.');
  const pending = await client.query(`SELECT t.transactionid FROM banking.bank_transaction t JOIN banking.transaction_type tt USING(transactiontypeid)
    WHERE tt.typecode='LOAN_PAYMENT' AND t.status='Pending' AND split_part(t.description,'|',1)='LOAN_PAYMENT' AND split_part(t.description,'|',2)=$1::text
      AND split_part(t.description,'|',3)=$2::text AND ($3::bigint IS NULL OR t.transactionid<>$3)`,
  [loanId,scheduleId,prior?.transactionid ?? null]);
  if (pending.rows.length) throw new ConflictException('Kỳ trả nợ đã có một lệnh đang chờ.');
  const remaining = (await client.query("SELECT banking_api.loan_remaining($1,$2)->>'total' AS total",[loanId,scheduleId])).rows[0]?.total;
  if (!remaining || moneyUnits(remaining) !== moneyUnits(amount)) throw new BadRequestException('Số tiền không khớp dư nợ còn lại của kỳ.');
  const destinationId = prior?.destinationaccountid ?? (await client.query('SELECT banking_api.loan_counterparty_account($1,FALSE) AS accountid',[loanId])).rows[0]?.accountid;
  if (!destinationId) throw new ServiceUnavailableException('Ngân hàng tạm thời chưa thể tiếp nhận thanh toán khoản vay.');
  const accounts = await client.query(`SELECT 1 FROM banking.bank_account a CROSS JOIN banking.bank_account b
    WHERE a.accountid=$1 AND b.accountid=$2 AND a.accountcategory='CUSTOMER' AND b.accountcategory='INTERNAL'
      AND a.currency='VND' AND b.currency='VND' AND a.status='Active' AND b.status='Active'`,[sourceId,destinationId]);
  if (!accounts.rows.length) throw new BadRequestException('Tài khoản thanh toán hoặc đối ứng không hợp lệ.');
  const owner = await client.query(`SELECT 1 FROM banking.account_holder WHERE accountid=$1 AND customerid=$2
    AND status='Active' AND startdate<=CURRENT_DATE AND (enddate IS NULL OR enddate>=CURRENT_DATE)`,[sourceId,customerId]);
  if (!owner.rows.length) throw new ForbiddenException('Tài khoản nguồn không thuộc khách hàng.');
  let transactionId = prior?.transactionid;
  if (!transactionId) {
    const type = (await client.query("SELECT transactiontypeid FROM banking.transaction_type WHERE typecode='LOAN_PAYMENT' AND status='Active'")).rows[0];
    if (!type) throw new BadRequestException('Nghiệp vụ trả vay đã ngừng hoạt động.');
    transactionId = (await client.query(`INSERT INTO banking.bank_transaction(transactioncode,transactiontypeid,channel,amount,fee,currency,description,status,initiatedbycustomerid)
      VALUES($1,$2,'InternetBanking',$3,0,'VND',$4,'Pending',$5) RETURNING transactionid`,[code,type.transactiontypeid,amount,input.description,customerId])).rows[0].transactionid;
    await client.query(`INSERT INTO banking.transfer_request(transactionid,customerid,sourceaccountid,destinationaccountid,idempotencykey,amount,currency,status)
      VALUES($1,$2,$3,$4,$5,$6,'VND','Pending')`,[transactionId,customerId,sourceId,destinationId,code,amount]);
  }
  await authorizeBusinessOperation(client,transactionId,'LOAN_PAYMENT');
  const posted = (await client.query('SELECT banking_api.post_balanced_transaction($1,$2,$3,$4,$5,TRUE) AS status',
    [transactionId,sourceId,destinationId,amount,customerId])).rows[0].status;
  if (posted === 'Success') await client.query("SELECT banking_api.finalize_loan_payment($1,$2,$3,'Online')",[transactionId,loanId,scheduleId]);
  if (prior) await client.query(`UPDATE banking.review_case SET status='CLOSED',reviewedat=clock_timestamp(),
    reason='LOAN_PAYMENT policy: no Risk/ML; completed by the loan owner'
    WHERE transactionid=$1 AND status IN ('OPEN','IN_REVIEW')`,[transactionId]);
  return movementResult(client,transactionId);
}
