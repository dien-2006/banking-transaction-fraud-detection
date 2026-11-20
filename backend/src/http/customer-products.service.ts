import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { AuthUser } from '../security/auth.guard';
import { CustomerAccountDto, CustomerCardDto, CustomerLoanDto, LoanDecisionDto } from './customer-products.dto';
import { customerCardTypes } from './customer-card-policy';

@Injectable()
export class CustomerProductsService {
  constructor(private readonly db: DatabaseService, private readonly config: ConfigService) {}
  private identity(user: AuthUser) {
    if (user.role !== 'customer' || !user.customerId) throw new ForbiddenException('Chỉ dành cho khách hàng.');
    return user.customerId;
  }
  private cardPolicy() {
    const dailyLimit=String(this.config.get('CUSTOMER_CARD_DAILY_LIMIT','50000000'));
    if (!/^\d{1,17}(?:\.\d{1,2})?$/.test(dailyLimit) || Number(dailyLimit)<=0) throw new Error('Invalid CUSTOMER_CARD_DAILY_LIMIT');
    return {cardType:'Debit', types:customerCardTypes, dailyLimit, validityYears:3};
  }
  async catalog(user: AuthUser) {
    this.identity(user);
    const result=await this.db.pool.query(`SELECT jsonb_build_object(
      'branches',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',b.branchid,'name',b.branchname,
        'acceptingLoans',EXISTS(SELECT 1 FROM banking.employee e WHERE e.branchid=b.branchid AND e.status='Active')) ORDER BY b.branchid),'[]'::jsonb)
        FROM banking.branch b WHERE b.status='Active'),
      'accountTypes',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',accounttypeid,'name',typename,'minBalance',minbalance) ORDER BY accounttypeid),'[]'::jsonb)
        FROM banking.account_type WHERE status='Active'),
      'loanTypes',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',loantypeid,'name',loantypename,'maxAmount',maxamount,
        'interestRate',defaultinterestrate,'maxTermMonths',maxtermmonths) ORDER BY loantypeid),'[]'::jsonb)
        FROM banking.loan_type WHERE status='Active')) AS catalog`);
    return {...result.rows[0].catalog, card:this.cardPolicy()};
  }
  async create(kind: 'account'|'card'|'loan', dto: CustomerAccountDto|CustomerCardDto|CustomerLoanDto, user: AuthUser, ip?:string) {
    const customerId=this.identity(user);
    // HMAC includes the PIN for replay checking, without storing a PIN or a guessable PIN hash.
    const fields=kind==='account'
      ? [(dto as CustomerAccountDto).branchId,(dto as CustomerAccountDto).accountTypeId]
      : kind==='card' ? [(dto as CustomerCardDto).accountId,(dto as CustomerCardDto).pin]
      : [(dto as CustomerLoanDto).branchId,(dto as CustomerLoanDto).loanTypeId,(dto as CustomerLoanDto).principal,(dto as CustomerLoanDto).termMonths];
    if(kind==='card') {
      const data=dto as CustomerCardDto;
      if(data.cardType!==undefined) {
        if(!customerCardTypes.some(type=>type.value===data.cardType))throw new BadRequestException('Loại thẻ ghi nợ không được hỗ trợ.');
        fields.push(data.cardType);
      }
    }
    const digest=createHmac('sha256',this.config.getOrThrow<string>('OTP_HASH_SECRET'))
      .update(JSON.stringify([kind,...fields])).digest('hex');
    return this.db.transaction({ipAddress:ip},async client=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`customer-product:${customerId}`]);
      const previous=await client.query(`SELECT newvalue FROM banking.audit_log WHERE entitytype='CUSTOMER_PRODUCT'
        AND newvalue->>'customerId'=$1 AND newvalue->>'requestKey'=$2 ORDER BY auditid DESC LIMIT 1`,[String(customerId),dto.requestKey]);
      if(previous.rows[0]) {
        const saved=previous.rows[0].newvalue;
        if(saved.digest!==digest)throw new ConflictException('Yêu cầu đã được dùng với thông tin khác. Hãy tải lại danh sách trước khi tạo tiếp.');
        return saved.result;
      }
      const customer=await client.query("SELECT customerid FROM banking.customer WHERE customerid=$1 AND status='Active' FOR SHARE",[customerId]);
      if(!customer.rows.length)throw new ForbiddenException('Hồ sơ khách hàng không còn hoạt động.');
      let result: Record<string,unknown>;
      if(kind==='account') {
        const data=dto as CustomerAccountDto;
        const row=await client.query('SELECT banking_api.open_account(NULL,$1,$2,$3,\'CUSTOMER\') AS result',[data.branchId,data.accountTypeId,customerId]);
        result=row.rows[0].result;
      } else if(kind==='card') {
        const data=dto as CustomerCardDto, policy=this.cardPolicy();
        const account=await client.query(`SELECT a.accountid FROM banking.bank_account a JOIN banking.account_holder h USING(accountid)
          WHERE a.accountid=$1 AND h.customerid=$2 AND h.status='Active' AND h.holdertype='PRIMARY_OWNER'
          AND h.startdate<=CURRENT_DATE AND (h.enddate IS NULL OR h.enddate>=CURRENT_DATE)
          AND a.status='Active' AND a.accountcategory='CUSTOMER' AND a.currency='VND' FOR SHARE OF a,h`,[data.accountId,customerId]);
        if(!account.rows.length)throw new ForbiddenException('Chỉ được mở thẻ trên tài khoản VND đang hoạt động do bạn đứng tên chính.');
        const row=await client.query(`SELECT banking_api.issue_card(NULL,$1,$2,CURRENT_DATE,(CURRENT_DATE+interval '3 years')::date,$5,$3,$4::numeric) AS result`,[data.accountId,customerId,data.pin,policy.dailyLimit,data.cardType??policy.cardType]);
        result=row.rows[0].result;
      } else {
        const data=dto as CustomerLoanDto;
        const product=await client.query("SELECT defaultinterestrate FROM banking.loan_type WHERE loantypeid=$1 AND status='Active' FOR SHARE",[data.loanTypeId]);
        if(!product.rows.length)throw new BadRequestException('Sản phẩm vay không còn hoạt động.');
        // The immutable loan schema requires an employee. Assign an active officer at the chosen branch.
        const officer=await client.query(`SELECT e.employeeid FROM banking.employee e JOIN banking.branch b USING(branchid)
          WHERE e.branchid=$1 AND e.status='Active' AND b.status='Active'
          ORDER BY (SELECT count(*) FROM banking.loan l WHERE l.employeeid=e.employeeid AND l.status='Pending'),e.employeeid
          LIMIT 1 FOR SHARE OF e,b`,[data.branchId]);
        if(!officer.rows.length)throw new BadRequestException('Chi nhánh chưa có nhân viên tiếp nhận hồ sơ vay.');
        const row=await client.query(`SELECT banking_api.create_loan(NULL,$1,$2,$3,$4,$5::numeric,$6::numeric,$7,CURRENT_DATE) AS result`,
          [customerId,data.branchId,officer.rows[0].employeeid,data.loanTypeId,data.principal,product.rows[0].defaultinterestrate,data.termMonths]);
        result=row.rows[0].result;
      }
      await client.query(`INSERT INTO banking.audit_log(entitytype,entityid,action,newvalue,ipaddress)
        VALUES('CUSTOMER_PRODUCT',$1,'INSERT',$2::jsonb,$3)`,[String(result.accountid??result.cardid??result.loanid),
        JSON.stringify({customerId,requestKey:dto.requestKey,kind,digest,result}),ip??null]);
      return result;
    });
  }
  private loanOfficer(user:AuthUser) {
    if(!['employee','admin'].includes(user.role)||!user.employeeId||!user.userId||(user.role==='employee'&&!user.branchId))
      throw new ForbiddenException('Không có quyền duyệt khoản vay.');
  }
  async loanDisbursementOptions(id:number,user:AuthUser) {
    this.loanOfficer(user);
    const result=await this.db.pool.query(`SELECT l.loanid,l.status,
      banking_api.loan_counterparty_account(l.loanid,TRUE) IS NOT NULL AS "fundingReady",
      (SELECT banking_api.transaction_result(t.transactionid) FROM banking.bank_transaction t
        WHERE t.description=concat('LOAN_DISBURSEMENT|',l.loanid) ORDER BY t.transactionid DESC LIMIT 1) AS disbursement,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('accountId',a.accountid,'accountNumber',a.accountnumber) ORDER BY a.accountid)
        FROM banking.bank_account a JOIN banking.account_holder h USING(accountid)
        WHERE h.customerid=l.customerid AND h.status='Active' AND h.holdertype='PRIMARY_OWNER'
          AND h.startdate<=(CURRENT_TIMESTAMP AT TIME ZONE $3)::date
          AND (h.enddate IS NULL OR h.enddate>=(CURRENT_TIMESTAMP AT TIME ZONE $3)::date)
          AND a.status='Active' AND a.accountcategory='CUSTOMER' AND a.currency='VND'),'[]'::jsonb) AS accounts
      FROM banking.loan l WHERE l.loanid=$1 AND ($2::integer IS NULL OR l.branchid=$2)`,
      [id,user.role==='employee'?user.branchId:null,this.config.get('SOURCE_TIMEZONE','Asia/Ho_Chi_Minh')]);
    if(!result.rows[0])throw new NotFoundException('Không tìm thấy khoản vay trong phạm vi được cấp quyền.');
    const row=result.rows[0];
    return {loanId:Number(row.loanid),status:row.status,ready:row.status==='Pending'&&row.fundingReady,
      unavailableReason:!row.fundingReady?'Ngân hàng tạm thời chưa thể giải ngân. Vui lòng liên hệ bộ phận vận hành.':null,
      accounts:row.accounts,disbursement:row.disbursement};
  }
  async decideLoan(id:number,dto:LoanDecisionDto,user:AuthUser,ip?:string) {
    this.loanOfficer(user);
    if(dto.reason.trim().length<3)throw new BadRequestException('Vui lòng nhập lý do xử lý.');
    if(dto.decision==='APPROVE'&&(!Number.isSafeInteger(dto.destinationAccountId)||!dto.destinationAccountId||!dto.requestKey))
      throw new BadRequestException('Chọn tài khoản nhận tiền giải ngân và mã yêu cầu hợp lệ.');
    return this.db.transaction({userId:user.userId,ipAddress:ip},async client=>{
      const row=await client.query('SELECT * FROM banking.loan WHERE loanid=$1 FOR UPDATE',[id]), loan=row.rows[0];
      if(!loan)throw new NotFoundException('Không tìm thấy khoản vay.');
      if(user.role==='employee'&&Number(loan.branchid)!==Number(user.branchId))throw new ForbiddenException('Khoản vay thuộc chi nhánh khác.');
      const existing=await client.query(`SELECT t.transactionid,tr.sourceaccountid FROM banking.bank_transaction t
        JOIN banking.transfer_request tr USING(transactionid)
        WHERE t.transactioncode=$2 OR (t.description=concat('LOAN_DISBURSEMENT|',$1::bigint) AND t.status IN ('Pending','Success'))
        ORDER BY CASE WHEN t.transactioncode=$2 THEN 0 ELSE 1 END,t.transactionid DESC`,
        [id,dto.requestKey?`LD-${dto.requestKey}`:null]);
      if(loan.status!=='Pending'&&!existing.rows.length)throw new ConflictException('Hồ sơ đã được xử lý. Vui lòng tải lại danh sách.');
      let result:Record<string,unknown>;
      if(dto.decision==='APPROVE') {
        const fundingId=existing.rows[0]?.sourceaccountid
          ?? (await client.query('SELECT banking_api.loan_counterparty_account($1,TRUE) AS accountid',[id])).rows[0]?.accountid;
        if(!fundingId)throw new ServiceUnavailableException('Ngân hàng tạm thời chưa thể giải ngân. Vui lòng liên hệ bộ phận vận hành.');
        const eligible=await client.query(`SELECT c.customerid FROM banking.customer c JOIN banking.branch b ON b.branchid=$2
          JOIN banking.loan_type t ON t.loantypeid=$3
          WHERE c.customerid=$1 AND c.status='Active' AND b.status='Active' AND t.status='Active' FOR SHARE OF c,b,t`,
          [loan.customerid,loan.branchid,loan.loantypeid]);
        if(!existing.rows.length&&!eligible.rows.length)throw new ConflictException('Khách hàng, chi nhánh hoặc sản phẩm vay đã ngừng hoạt động.');
        if(!existing.rows.length) {
          // Same model and immutable DEPOSIT type as the Banking Core movement.
          await this.db.prepareRisk(client,'banking_api.create_account_movement',
            ['DEPOSIT',loan.customerid,fundingId,dto.destinationAccountId,loan.principalamount,`LD-${dto.requestKey}`,'Counter']);
        }
        result=(await client.query('SELECT banking_api.disburse_loan($1::bigint,$2::bigint,$3::bigint,$4::varchar,$5::integer) AS result',
          [id,dto.destinationAccountId,fundingId,`LD-${dto.requestKey}`,user.employeeId])).rows[0].result;
      } else {
        if(loan.status!=='Pending'||existing.rows.length)throw new ConflictException('Khoản vay đã có lệnh giải ngân. Vui lòng xử lý lệnh tại Fraud & Review.');
        result=(await client.query("UPDATE banking.loan SET status='Cancelled' WHERE loanid=$1 RETURNING *",[id])).rows[0];
      }
      await client.query(`INSERT INTO banking.audit_log(userid,entitytype,entityid,action,oldvalue,newvalue,ipaddress)
        SELECT $1::integer,'LOAN',$2::varchar,'STATUS_CHANGE',$3::jsonb,$4::jsonb,$5::varchar
        WHERE NOT EXISTS(SELECT 1 FROM banking.audit_log WHERE entitytype='LOAN' AND entityid=$2::varchar
          AND newvalue->>'requestKey'=$6::text)`,[user.userId,String(id),JSON.stringify(loan),JSON.stringify({...result,decision:dto.decision,reason:dto.reason.trim(),requestKey:dto.requestKey}),ip??null,dto.requestKey??null]);
      return result;
    });
  }
}
