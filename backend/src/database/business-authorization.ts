import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

export type BusinessOperation = 'STAFF_TRANSFER' | 'STAFF_MOVEMENT' | 'LOAN_DISBURSEMENT' | 'LOAN_PAYMENT';
export interface AuthorizedMovement {
  operation: BusinessOperation;
  type: 'TRANSFER' | 'DEPOSIT' | 'WITHDRAWAL' | 'OPENING_BALANCE' | 'LOAN_PAYMENT';
  customerId: string | number | null;
  sourceId: string | number;
  destinationId: string | number;
  amount: string;
  key: string;
  code?: string;
  description: string | null;
  channel: 'Counter' | 'InternetBanking';
  loanId?: number;
}

export function moneyUnits(value: unknown): bigint {
  const text = String(value);
  if (!/^\d{1,17}(?:\.\d{1,2})?$/.test(text)) throw new BadRequestException('Số tiền không hợp lệ.');
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export async function existingMovement(client: PoolClient, key: string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
  const result = await client.query(`/* business-existing */ SELECT t.*,tr.customerid,tr.sourceaccountid,tr.destinationaccountid,tt.typecode
    FROM banking.bank_transaction t JOIN banking.transfer_request tr USING(transactionid)
    JOIN banking.transaction_type tt USING(transactiontypeid)
    WHERE tr.idempotencykey=$1 OR t.transactioncode=$1 FOR UPDATE OF t`, [key]);
  if(result.rows.length>1)throw new ConflictException('Mã yêu cầu trùng với nhiều chứng từ.');
  return result.rows[0];
}

export function assertSameMovement(prior: Record<string, unknown>, input: AuthorizedMovement) {
  if (String(prior.customerid) !== String(input.customerId)
    || String(prior.sourceaccountid) !== String(input.sourceId)
    || String(prior.destinationaccountid) !== String(input.destinationId)
    || moneyUnits(prior.amount) !== moneyUnits(input.amount)
    || prior.typecode !== input.type || prior.channel !== input.channel
    || (prior.description ?? null) !== input.description) {
    throw new ConflictException('Mã yêu cầu đã dùng với nội dung nghiệp vụ khác.');
  }
}

/** Manual authorization is not an ML prediction. The immutable DB requires a
 * non-null ALLOW risk row. A dedicated BUSINESS_POLICY identity and reasonjson
 * identify the zero score/probability as compatibility values, never inference.
 * Posting, balances, Success and outbox remain in the existing Banking Core. */
export async function authorizeBusinessOperation(client: PoolClient, transactionId: string | number, operation: BusinessOperation) {
  const gate = (await client.query(`SELECT decision FROM banking.risk_assessment WHERE transactionid=$1
    ORDER BY assessedat DESC,riskassessmentid DESC LIMIT 1`, [transactionId])).rows[0];
  if (gate?.decision === 'BLOCK') throw new ConflictException('Không thể hạch toán giao dịch đã bị BLOCK.');
  let policy = (await client.query(`/* business-policy */ SELECT modelversionid FROM banking.model_version
    WHERE modelname='business_authorization_v1' AND modeltype='BUSINESS_POLICY' AND status='ACTIVE'
    ORDER BY modelversionid LIMIT 1`)).rows[0];
  if (!policy) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('business-authorization-policy',0))");
    policy = (await client.query(`SELECT modelversionid FROM banking.model_version
      WHERE modelname='business_authorization_v1' AND modeltype='BUSINESS_POLICY' AND status='ACTIVE'
      ORDER BY modelversionid LIMIT 1`)).rows[0];
    if (!policy) policy = (await client.query(`INSERT INTO banking.model_version(modelname,modeltype,status,description)
      VALUES('business_authorization_v1','BUSINESS_POLICY','ACTIVE','Business authorization only; no Risk/ML evaluation or model artifact')
      RETURNING modelversionid`)).rows[0];
  }
  await client.query(`INSERT INTO banking.risk_assessment(transactionid,modelversionid,rulescore,risklevel,modelprobability,decision,reasonjson)
    VALUES($1,$2,0,'LOW',0,'ALLOW',$3::jsonb)`, [transactionId, policy.modelversionid, JSON.stringify({
    authorization_mode: operation, risk_evaluated: false, model_evaluated: false,
    compatibility_values: true, explanation: 'Business authorization; zero numeric fields are not model predictions',
  })]);
  await client.query(`INSERT INTO banking.audit_log(userid,entitytype,entityid,action,newvalue)
    VALUES(NULLIF(current_setting('app.user_id',true),'')::integer,'BUSINESS_AUTHORIZATION',$1,'INSERT',$2::jsonb)`,
  [String(transactionId), JSON.stringify({operation, riskEvaluated: false, modelEvaluated: false})]);
}

/** Remove compatibility numeric values from operational API presentations. */
export function presentBusinessAuthorization<T>(value: T): T {
  if (Array.isArray(value)) return value.map(presentBusinessAuthorization) as T;
  if (!value || typeof value !== 'object') return value;
  const row = value as Record<string, unknown>;
  const reason = row.reasonjson as Record<string, unknown> | undefined;
  const result = Object.fromEntries(Object.entries(row).map(([key, item]) => [key, presentBusinessAuthorization(item)]));
  if (reason?.model_evaluated === false) Object.assign(result, {
    rulescore: null, risklevel: null, modelprobability: null,
    riskEvaluated: false, modelEvaluated: false, authorizationMode: reason.authorization_mode,
  });
  return result as T;
}

export async function movementResult(client: Pick<PoolClient, 'query'>, transactionId: string | number) {
  const row = (await client.query(`SELECT banking_api.transaction_result($1) AS result,
    (SELECT e.payloadjson->>'reason' FROM banking.event_outbox e
      WHERE e.aggregateid=$1::text AND e.aggregatetype='BANK_TRANSACTION' AND e.eventtype='TransactionFailed'
      ORDER BY e.createdat DESC,e.eventoutboxid DESC LIMIT 1) AS failure_code`, [transactionId])).rows[0];
  if(!row?.result)throw new NotFoundException('Không tìm thấy chứng từ giao dịch.');
  const result = presentBusinessAuthorization(row.result);
  if (result?.status === 'Failed') return {...result,
    failureCode:row.failure_code ?? null,
    failureReason:row.failure_code === 'INSUFFICIENT_BALANCE'
      ? 'Tài khoản nguồn không đủ số dư khả dụng để hạch toán. Giao dịch chưa được ghi nợ/ghi có.'
      : 'Giao dịch đã thất bại và chưa được hạch toán. Cần kiểm tra nguyên nhân trước khi tạo lệnh khác.',
  };
  return result;
}

export async function createAuthorizedMovement(client: PoolClient, input: AuthorizedMovement) {
  if (moneyUnits(input.amount) <= 0n || String(input.sourceId) === String(input.destinationId)
    || !input.key.trim() || input.key.length > 100 || (input.code && input.code.length > 40)) {
    throw new BadRequestException('Thông tin nghiệp vụ không hợp lệ.');
  }
  // This entrypoint is exclusively staff-operated. Customer loan repayment has
  // its own ownership/schedule validation and never calls this staff path.
  const actor = (await client.query(`/* business-actor */ SELECT e.employeeid,e.branchid,r.rolename
    FROM banking.system_user u JOIN banking.employee e USING(employeeid) JOIN banking.role r USING(roleid)
    WHERE u.userid=NULLIF(current_setting('app.user_id',true),'')::integer
      AND u.isactive AND e.status='Active' AND r.status='Active' FOR SHARE OF u,e,r`)).rows[0];
  if (!actor || input.channel !== 'Counter' || input.type === 'LOAN_PAYMENT') throw new ForbiddenException('Yêu cầu nhân viên đang hoạt động.');
  const prior = await existingMovement(client, input.key);
  const accounts = (await client.query(`/* business-accounts */ SELECT accountid,accountcategory,currency,branchid FROM banking.bank_account
    WHERE accountid IN ($1,$2) ORDER BY accountid`, [input.sourceId, input.destinationId])).rows;
  const debit = accounts.find(a => String(a.accountid) === String(input.sourceId));
  const credit = accounts.find(a => String(a.accountid) === String(input.destinationId));
  const admin = /admin/i.test(actor.rolename) || actor.rolename === 'Quản trị hệ thống';
  const scope = input.operation === 'LOAN_DISBURSEMENT'
    ? (await client.query('SELECT branchid FROM banking.loan WHERE loanid=$1', [input.loanId])).rows[0]
    : debit;
  if (!admin && (!scope || String(scope.branchid) !== String(actor.branchid)
    || (input.operation === 'STAFF_MOVEMENT' && String(credit?.branchid) !== String(actor.branchid)))) {
    throw new ForbiddenException('Nghiệp vụ ngoài phạm vi chi nhánh.');
  }
  if (input.customerId == null && prior) input = {...input,customerId:prior.customerid};
  if (input.customerId == null) {
    const ownedId = input.type === 'WITHDRAWAL' ? input.sourceId : input.destinationId;
    input = {...input, customerId: (await client.query(`SELECT customerid FROM banking.account_holder
      WHERE accountid=$1 AND status='Active' AND startdate<=CURRENT_DATE AND (enddate IS NULL OR enddate>=CURRENT_DATE)
      ORDER BY CASE holdertype WHEN 'PRIMARY_OWNER' THEN 0 ELSE 1 END,customerid LIMIT 1`, [ownedId])).rows[0]?.customerid};
  }
  if (input.customerId == null) throw new NotFoundException('Không tìm thấy chủ tài khoản.');
  if (prior) {
    assertSameMovement(prior, input);
    return movementResult(client, prior.transactionid);
  }
  const transfer = input.type === 'TRANSFER';
  const debitCategory = transfer || input.type === 'WITHDRAWAL' ? 'CUSTOMER' : 'INTERNAL';
  const creditCategory = transfer || input.type !== 'WITHDRAWAL' ? 'CUSTOMER' : 'INTERNAL';
  if (!debit || !credit || debit.accountcategory !== debitCategory || credit.accountcategory !== creditCategory
    || debit.currency !== 'VND' || credit.currency !== 'VND') throw new BadRequestException('Tài khoản đối ứng không hợp lệ.');
  if (/^(LOAN_DISBURSEMENT|LOAN_PAYMENT)(\||$)/.test(input.description ?? '') && input.operation !== 'LOAN_DISBURSEMENT') {
    throw new BadRequestException('Nội dung nghiệp vụ dành riêng cho khoản vay.');
  }
  const ownerId = transfer || input.type === 'WITHDRAWAL' ? input.sourceId : input.destinationId;
  const owner = await client.query(`SELECT 1 FROM banking.account_holder WHERE accountid=$1 AND customerid=$2
    AND status='Active' AND startdate<=CURRENT_DATE AND (enddate IS NULL OR enddate>=CURRENT_DATE)`, [ownerId, input.customerId]);
  if (!owner.rows.length) throw new ForbiddenException('Khách hàng không sở hữu tài khoản.');
  const type = (await client.query("SELECT transactiontypeid FROM banking.transaction_type WHERE typecode=$1 AND status='Active'", [input.type])).rows[0];
  if (!type) throw new BadRequestException('Loại nghiệp vụ đã ngừng hoạt động.');
  const code = input.code ?? `TX-${randomUUID()}`;
  const transactionId = (await client.query(`/* business-create */ INSERT INTO banking.bank_transaction
    (transactioncode,transactiontypeid,employeeid,channel,amount,fee,currency,description,status,initiatedbycustomerid)
    VALUES($1,$2,$3,$4,$5,0,'VND',$6,'Pending',$7) RETURNING transactionid`,
  [code, type.transactiontypeid, actor.employeeid, input.channel, input.amount, input.description, input.customerId])).rows[0].transactionid;
  await client.query(`INSERT INTO banking.transfer_request(transactionid,customerid,sourceaccountid,destinationaccountid,idempotencykey,amount,currency,status)
    VALUES($1,$2,$3,$4,$5,$6,'VND','Pending')`, [transactionId, input.customerId, input.sourceId, input.destinationId, input.key, input.amount]);
  await authorizeBusinessOperation(client, transactionId, input.operation);
  await client.query('SELECT banking_api.post_balanced_transaction($1,$2,$3,$4,$5,$6)',
    [transactionId, input.sourceId, input.destinationId, input.amount, input.customerId, transfer || input.type === 'WITHDRAWAL']);
  return movementResult(client, transactionId);
}
