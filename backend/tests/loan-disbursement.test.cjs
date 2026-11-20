require('reflect-metadata');
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {validate}=require('class-validator'),{plainToInstance}=require('class-transformer');
const {LoanDecisionDto,LoanApprovalDto}=require('../dist/http/customer-products.dto');
const {CustomerProductsService}=require('../dist/http/customer-products.service');
const {attachLoanDisbursements}=require('../dist/database/loan-disbursements');
const {loadTransactionEmailDetails}=require('../dist/notification-email');
const {LoanPaymentOptionsService}=require('../dist/http/loan-payment-options');
const {ConfigService}=require('@nestjs/config');

test('approving a loan requires a server-issued account selection and a replay key; rejection only requires a reason',async()=>{
 const data={decision:'APPROVE',reason:'Verified application',destinationAccountId:10,requestKey:randomUUID()};
 assert.deepEqual(await validate(plainToInstance(LoanDecisionDto,data)),[]);
 for(const patch of [{destinationAccountId:undefined},{destinationAccountId:0},{destinationAccountId:1.2},{requestKey:undefined},{requestKey:'bad'}])assert.ok((await validate(plainToInstance(LoanDecisionDto,{...data,...patch}))).length);
 assert.deepEqual(await validate(plainToInstance(LoanDecisionDto,{decision:'REJECT',reason:'Not eligible'})),[]);
 assert.ok((await validate(plainToInstance(LoanApprovalDto,{reason:'Verified'}))).length);
 assert.ok((await validate(plainToInstance(LoanDecisionDto,{...data,sourceAccountId:999,amount:'1'}),{whitelist:true,forbidNonWhitelisted:true})).length);
});

test('missing bank ledger data never activates a loan or asks for manual ID configuration',async()=>{
 const client={query:async(sql)=>({rows:sql.includes('FROM banking.loan')?[{loanid:1,status:'Pending',branchid:3}]:[]})};
 const service=new CustomerProductsService({transaction:async(_context,work)=>work(client),prepareRisk:()=>assert.fail('No inference')},new ConfigService({}));
 await assert.rejects(()=>service.decideLoan(1,{decision:'APPROVE',reason:'Verified',destinationAccountId:2,requestKey:randomUUID()},{role:'employee',userId:1,employeeId:1,branchId:3}),/chưa thể giải ngân/);
});

test('PostgreSQL disbursement preserves risk, atomic posting, retries, ownership and repayment evidence',{
 skip:!process.env.LOAN_DISBURSEMENT_TEST_URL,
},async t=>{
 const {Pool}=require('pg');const url=new URL(process.env.LOAN_DISBURSEMENT_TEST_URL);
 assert.match(url.pathname,/^\/d4_loan_test_[a-z0-9_]+$/);assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
 const pool=new Pool({connectionString:url.toString(),max:12});let ids;
 const columns=async()=>(await pool.query("SELECT table_name,column_name,data_type,is_nullable,is_identity FROM information_schema.columns WHERE table_schema='banking' ORDER BY table_name,ordinal_position")).rows;
 const before=await columns();assert.ok(before.length);
 const query=async(client,sql,args=[])=>(await client.query(sql,args)).rows[0];
 const risk=async(client,probability,type='DEPOSIT',source=ids.fund,channel='Counter',amount='1000')=>{
  await client.query("SELECT set_config('app.fraud_model',$1,true),set_config('app.user_id',$2,true)",[JSON.stringify({engine:'joblib',version:'isolated-test',modelVersionId:ids.model,databaseName:'fraud_detection_v1',probability,
   request:{customerId:ids.customer,sourceAccountId:source,amount,typeCode:type,channel,assessedAt:'2035-01-01 12:00:00'}}),String(ids.user)]);
 };
 const loan=async(client)=>(await query(client,'SELECT banking_api.create_loan(NULL,$1,$2,$3,$4,1000,0,2,CURRENT_DATE) AS r',[ids.customer,ids.branch,ids.employee,ids.loanType])).r;
 const fund=async(client,l,key=randomUUID(),destination=ids.account)=>(await query(client,'SELECT banking_api.disburse_loan($1,$2,$3,$4,$5) AS r',[l.loanid,destination,ids.fund,'LD-'+key,ids.employee])).r;
 const snapshot=async client=>await query(client,`SELECT (SELECT jsonb_agg(to_jsonb(a) ORDER BY accountid) FROM banking.bank_account a WHERE accountid IN ($1,$2)) AS accounts,
   (SELECT count(*)::int FROM banking.bank_transaction WHERE initiatedbycustomerid=$3) AS transactions,
   (SELECT count(*)::int FROM banking.transaction_posting p JOIN banking.bank_transaction t USING(transactionid) WHERE t.initiatedbycustomerid=$3) AS postings,
   (SELECT count(*)::int FROM banking.event_outbox e WHERE e.aggregateid IN (SELECT transactionid::text FROM banking.bank_transaction WHERE initiatedbycustomerid=$3)) AS events,
   (SELECT count(*)::int FROM banking.repayment_schedule s JOIN banking.loan l USING(loanid) WHERE l.customerid=$3) AS schedules`,[ids.account,ids.fund,ids.customer]);
 const isolated=async work=>{const c=await pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL search_path=banking,public');await risk(c,0.01);await work(c);await c.query('SET CONSTRAINTS ALL IMMEDIATE');}finally{await c.query('ROLLBACK');c.release();}};
 try{
  await pool.query('SET search_path=banking,public');
  const tag=randomUUID().slice(0,8);
  const branch=(await query(pool,"INSERT INTO banking.branch(branchcode,branchname,address,city,opendate) VALUES($1,'Test','Test','Test',CURRENT_DATE) RETURNING branchid",['LD-'+tag])).branchid;
  const role=(await query(pool,"INSERT INTO banking.role(rolename) VALUES($1) RETURNING roleid",['Test admin '+tag])).roleid;
  const employee=(await query(pool,"INSERT INTO banking.employee(employeecode,branchid,roleid,fullname,phone,email,hiredate,salary) VALUES($1,$2,$3,'Test',$4,$5,CURRENT_DATE,0) RETURNING employeeid",['LD-'+tag,branch,role,tag,tag+'@example.invalid'])).employeeid;
  const user=(await query(pool,"INSERT INTO banking.system_user(employeeid,username,passwordhash) VALUES($1,$2,'test-only-unused') RETURNING userid",[employee,'LD-'+tag])).userid;
  const customer=(await query(pool,"INSERT INTO banking.customer(customercode,fullname) VALUES($1,'Borrower') RETURNING customerid",['LD-'+tag])).customerid;
  const type=(await query(pool,"INSERT INTO banking.account_type(typename) VALUES($1) RETURNING accounttypeid",['LD-'+tag])).accounttypeid;
  const account=(await query(pool,"SELECT banking_api.open_account(NULL,$1,$2,$3,'CUSTOMER') AS r",[branch,type,customer])).r.accountid;
  const other=(await query(pool,"INSERT INTO banking.customer(customercode,fullname) VALUES($1,'Other') RETURNING customerid",['LD-OTHER-'+tag])).customerid;
  const otherAccount=(await query(pool,"SELECT banking_api.open_account(NULL,$1,$2,$3,'CUSTOMER') AS r",[branch,type,other])).r.accountid;
  const internal=(await query(pool,"SELECT banking_api.open_account(NULL,$1,$2,NULL,'INTERNAL') AS r",[branch,type])).r.accountid;
  await pool.query('UPDATE banking.bank_account SET balance=1000000 WHERE accountid=$1',[internal]);
  const loanType=(await query(pool,"INSERT INTO banking.loan_type(loantypename,maxamount,defaultinterestrate,maxtermmonths) VALUES($1,50000000,0,36) RETURNING loantypeid",['LD-'+tag])).loantypeid;
  const model=(await query(pool,"SELECT modelversionid FROM banking.model_version WHERE modelname='fraud_detection_v1' AND status='ACTIVE' LIMIT 1")).modelversionid;
  ids={branch,employee,user,customer,account,fund:internal,loanType,model,otherAccount};
  await t.test('ALLOW credits exact principal, debits bank, starts schedule and is replay safe',()=>isolated(async c=>{
   const l=await loan(c),key=randomUUID(),r=await fund(c,l,key);assert.equal(r.status,'Active');assert.equal(r.disbursement.status,'Success');
   const email=await loadTransactionEmailDetails(c,r.disbursement.transactionid,customer);assert.match(email,/\+1\.000 VND \(Ghi có\)/);assert.ok(!email.includes('Ghi nợ'));
   const page={items:[{loanid:l.loanid,status:'Active'}]};await attachLoanDisbursements(c,page);assert.equal(page.items[0].disbursement.status,'Success');
   assert.equal((await query(c,'SELECT balance FROM bank_account WHERE accountid=$1',[account])).balance,'1000.00');
   assert.equal((await query(c,'SELECT balance FROM bank_account WHERE accountid=$1',[internal])).balance,'999000.00');
   assert.equal((await query(c,'SELECT banking_api.loan_is_funded($1) AS ready',[l.loanid])).ready,true);
   const s=await snapshot(c);assert.equal(s.postings,2);assert.equal(s.schedules,2);assert.equal(s.events,1);
   assert.equal((await fund(c,l,key)).disbursement.transactionid,r.disbursement.transactionid);assert.deepEqual(await snapshot(c),s);
   await c.query('SAVEPOINT conflict');await assert.rejects(()=>fund(c,l,randomUUID()),/đã được xử lý/);await c.query('ROLLBACK TO conflict');
   await c.query('SAVEPOINT conflict');await assert.rejects(()=>fund(c,l,key,otherAccount),/thông tin giải ngân khác/);await c.query('ROLLBACK TO conflict');
   await c.query('SAVEPOINT conflict');await assert.rejects(()=>c.query("SELECT banking_api.reverse_transaction($1,$2,$3,'Test reversal')",[r.disbursement.transactionid,employee,'REVERSE-'+randomUUID().slice(0,8)]),/loan.*reversal/);await c.query('ROLLBACK TO conflict');
   await risk(c,0.01,'LOAN_PAYMENT',account,'InternetBanking','500');
   const schedule=await query(c,'SELECT scheduleid FROM repayment_schedule WHERE loanid=$1 ORDER BY installmentno LIMIT 1',[l.loanid]);
   const payment=(await query(c,"SELECT banking_api.pay_loan($1,$2,$3,$4,$5,500,$6,'Online') AS r",[customer,l.loanid,schedule.scheduleid,account,internal,'LP-'+randomUUID()])).r;
   assert.equal(payment.status,'Success');assert.equal((await query(c,'SELECT amountpaid FROM loan_payment WHERE transactionid=$1',[payment.transactionid])).amountpaid,'500.00');
  }));
  await t.test('REVIEW leaves balances/schedule untouched; approval funds once and rejection never funds',()=>isolated(async c=>{
   await risk(c,0.65);const l=await loan(c),r=await fund(c,l),s=await snapshot(c);assert.equal(r.status,'Pending');assert.equal(r.disbursement.status,'Pending');assert.equal(s.postings,0);assert.equal(s.schedules,0);
   const page={items:[{loanid:l.loanid,status:'Pending'}]};await attachLoanDisbursements(c,page);assert.equal(page.items[0].disbursement.status,'Pending');assert.equal(page.items[0].disbursement.reviewcaseid,r.disbursement.reviewcaseid);
   const email=await loadTransactionEmailDetails(c,r.disbursement.transactionid,customer);assert.match(email,/Số tiền yêu cầu: 1\.000 VND/);assert.ok(!/[+−]/.test(email.replace(/Mã giao dịch:.*\n/,'')));
   const approved=(await query(c,"SELECT banking_api.resolve_review($1,$2,'APPROVE','Verified test') AS r",[r.disbursement.reviewcaseid,user])).r;assert.equal(approved.status,'Success');
   assert.equal((await query(c,'SELECT status FROM loan WHERE loanid=$1',[l.loanid])).status,'Active');
   const done=await snapshot(c);await query(c,"SELECT banking_api.resolve_review($1,$2,'APPROVE','Verified test') AS r",[r.disbursement.reviewcaseid,user]);assert.deepEqual(await snapshot(c),done);
   const rejectedLoan=await loan(c),reject=await fund(c,rejectedLoan);await query(c,"SELECT banking_api.resolve_review($1,$2,'REJECT','Rejected test') AS r",[reject.disbursement.reviewcaseid,user]);
   assert.equal((await query(c,'SELECT status FROM loan WHERE loanid=$1',[rejectedLoan.loanid])).status,'Pending');assert.equal((await snapshot(c)).postings,2);
  }));
  await t.test('BLOCK and insufficient bank funds never activate the loan or create debt',()=>isolated(async c=>{
   await risk(c,0.95);const blocked=await fund(c,await loan(c));assert.equal(blocked.disbursement.status,'Cancelled');assert.equal(blocked.disbursement.decision,'BLOCK');assert.equal(blocked.status,'Pending');
   await risk(c,0.01);await c.query('UPDATE bank_account SET balance=0 WHERE accountid=$1',[internal]);const failed=await fund(c,await loan(c));assert.equal(failed.disbursement.status,'Failed');assert.equal(failed.status,'Pending');
   const s=await snapshot(c);assert.equal(s.postings,0);assert.equal(s.schedules,0);assert.equal((await query(c,'SELECT balance FROM bank_account WHERE accountid=$1',[account])).balance,'0.00');
  }));
  await t.test('the HTTP service uses the exact core result, scoped account options and one audit on replay',()=>isolated(async c=>{
   let predictions=0;
   const service=new CustomerProductsService({pool:c,transaction:async(_context,work)=>work(c),prepareRisk:async(_client,name,args)=>{
    assert.equal(name,'banking_api.create_account_movement');assert.equal(args[0],'DEPOSIT');assert.equal(Number(args[2]),Number(internal));
    predictions++;await risk(c,0.01);
   }},new ConfigService({}));
   const l=await loan(c),actor={role:'employee',userId:Number(user),employeeId:Number(employee),branchId:Number(branch)};
   const input={decision:'APPROVE',reason:'Verified application',destinationAccountId:Number(account),requestKey:randomUUID()};
   const options=await service.loanDisbursementOptions(Number(l.loanid),actor);
   assert.equal(options.ready,true);assert.deepEqual(options.accounts.map(a=>Number(a.accountId)),[Number(account)]);
   const first=await service.decideLoan(Number(l.loanid),input,actor);assert.equal(first.status,'Active');
   assert.equal((await service.decideLoan(Number(l.loanid),input,actor)).disbursement.transactionid,first.disbursement.transactionid);assert.equal(predictions,0);
   assert.equal((await query(c,"SELECT count(*)::int AS n FROM audit_log WHERE entitytype='LOAN' AND entityid=$1 AND newvalue->>'requestKey'=$2",[String(l.loanid),input.requestKey])).n,1);
   const updated=await service.loanDisbursementOptions(Number(l.loanid),actor);assert.equal(updated.ready,false);assert.equal(updated.disbursement.status,'Success');
  }));
  await t.test('bank counterparts are automatic, exclude customer accounts and preserve the funding destination for repayment',()=>isolated(async c=>{
   const l=await loan(c);
   await c.query('UPDATE bank_account SET balance=0 WHERE accountid=$1',[internal]);
   await c.query('UPDATE bank_account SET balance=999999999 WHERE accountid=$1',[account]);
   const bank=(await query(c,"SELECT banking_api.open_account(NULL,$1,$2,NULL,'INTERNAL') AS r",[branch,type])).r;
   await c.query('UPDATE bank_account SET balance=5000 WHERE accountid=$1',[bank.accountid]);
   const picked=await query(c,'SELECT banking_api.loan_counterparty_account($1,TRUE) AS accountid',[l.loanid]);
   assert.equal(Number(picked.accountid),Number(bank.accountid));assert.notEqual(Number(picked.accountid),Number(account));
   await risk(c,0.01,'DEPOSIT',bank.accountid,'Counter');
   const funded=(await query(c,'SELECT banking_api.disburse_loan($1,$2,$3,$4,$5) AS r',[l.loanid,account,bank.accountid,'LD-'+randomUUID(),employee])).r;
   assert.equal(funded.disbursement.status,'Success');
   await c.query('UPDATE bank_account SET balance=1000000 WHERE accountid=$1',[internal]);
   assert.equal(Number((await query(c,'SELECT banking_api.loan_counterparty_account($1,FALSE) AS accountid',[l.loanid])).accountid),Number(bank.accountid));
   await risk(c,0.01,'LOAN_PAYMENT',account,'InternetBanking','500');
   const schedule=await query(c,'SELECT scheduleid FROM repayment_schedule WHERE loanid=$1 ORDER BY installmentno LIMIT 1',[l.loanid]);
   const key='LP-'+randomUUID();
   const pay=()=>query(c,"SELECT banking_api.pay_loan($1,$2,$3,$4,NULL,500,$5,'Online') AS r",[customer,l.loanid,schedule.scheduleid,account,key]);
   const paid=await pay();assert.equal(paid.r.status,'Success');assert.equal(Number(paid.r.destinationaccountid),Number(bank.accountid));
   await c.query("UPDATE bank_account SET status='Frozen' WHERE accountid=$1",[bank.accountid]);
   assert.equal((await pay()).r.transactionid,paid.r.transactionid);
   assert.equal((await query(c,'SELECT count(*)::int AS n FROM loan_payment WHERE transactionid=$1',[paid.r.transactionid])).n,1);
  }));
  await t.test('no bank ledger account means no money movement; a rich customer account is never used instead',()=>isolated(async c=>{
   const l=await loan(c);await c.query("UPDATE bank_account SET status='Frozen' WHERE accountcategory='INTERNAL'");
   await c.query('UPDATE bank_account SET balance=999999999 WHERE accountid=$1',[account]);
   assert.equal((await query(c,'SELECT banking_api.loan_counterparty_account($1,TRUE) AS accountid',[l.loanid])).accountid,null);
   const service=new CustomerProductsService({pool:c,transaction:async(_context,work)=>work(c),prepareRisk:()=>assert.fail('No financial inference without a bank counterpart')},new ConfigService({}));
   const actor={role:'employee',userId:Number(user),employeeId:Number(employee),branchId:Number(branch)};
   assert.equal((await service.loanDisbursementOptions(Number(l.loanid),actor)).ready,false);
   await assert.rejects(()=>service.decideLoan(Number(l.loanid),{decision:'APPROVE',reason:'Verified application',destinationAccountId:Number(account),requestKey:randomUUID()},actor),/chưa thể giải ngân/);
   assert.equal((await snapshot(c)).postings,0);
  }));
  await t.test('rounding small loans never creates negative or unpayable zero installments',()=>isolated(async c=>{
   const l=(await query(c,'SELECT banking_api.create_loan(NULL,$1,$2,$3,$4,0.01,0,36,CURRENT_DATE) AS r',[customer,branch,employee,loanType])).r;
   await risk(c,0.01,'DEPOSIT',internal,'Counter','0.01');assert.equal((await fund(c,l)).status,'Active');
   const amounts=await query(c,"SELECT sum(principaldue) AS principal,count(*) FILTER(WHERE status='Paid')::int AS zero_paid FROM repayment_schedule WHERE loanid=$1",[l.loanid]);
   assert.equal(amounts.principal,'0.01');assert.equal(amounts.zero_paid,35);
  }));
  await t.test('wrong owner, branch and direct activation fail before moving money',()=>isolated(async c=>{
   const l=await loan(c),s=await snapshot(c);await c.query('SAVEPOINT invalid');await assert.rejects(()=>fund(c,l,randomUUID(),otherAccount),/đứng tên chính/);await c.query('ROLLBACK TO invalid');
   await c.query('SAVEPOINT invalid');await assert.rejects(()=>query(c,'SELECT banking_api.approve_loan($1)',[l.loanid]),/giải ngân thành công/);await c.query('ROLLBACK TO invalid');assert.deepEqual(await snapshot(c),s);
   const options=new LoanPaymentOptionsService({pool:c});const quote=await options.get(Number(l.loanid),{role:'customer',customerId:Number(customer)});assert.equal(quote.ready,false);
   const service=new CustomerProductsService({transaction:async(_context,work)=>work(c)},new ConfigService({}));
   await assert.rejects(()=>service.decideLoan(Number(l.loanid),{decision:'APPROVE',reason:'Verified',destinationAccountId:Number(account),requestKey:randomUUID()},{role:'employee',userId:Number(user),employeeId:Number(employee),branchId:Number(branch)+999}),/chi nhánh khác/);
  }));
  await t.test('an error while creating the schedule rolls back credit, debit, status, audit and outbox',()=>isolated(async c=>{
   const l=await loan(c),s=await snapshot(c);await c.query('SAVEPOINT failure');
   await c.query("CREATE FUNCTION pg_temp.reject_disbursement_schedule() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected schedule failure'; END $$");
   await c.query('CREATE TRIGGER isolated_schedule_failure BEFORE INSERT ON repayment_schedule FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_disbursement_schedule()');
   await assert.rejects(()=>fund(c,l),/Injected schedule failure/);await c.query('ROLLBACK TO failure');assert.deepEqual(await snapshot(c),s);
   assert.equal((await query(c,"SELECT count(*)::int AS n FROM audit_log WHERE entitytype='LOAN_DISBURSEMENT' AND entityid=$1",[String(l.loanid)])).n,0);
  }));
  await t.test('existing Active loans can repay from their online account without ID configuration or another disbursement',()=>isolated(async c=>{
   const l=await loan(c);await c.query("UPDATE loan SET status='Active' WHERE loanid=$1",[l.loanid]);
   await c.query('UPDATE bank_account SET balance=2000 WHERE accountid=$1',[account]);
   const schedule=await query(c,"INSERT INTO repayment_schedule(loanid,installmentno,duedate,principaldue,interestdue,penaltydue,status) VALUES($1,1,CURRENT_DATE,1000,0,0,'Pending') RETURNING scheduleid",[l.loanid]);
   const options=new LoanPaymentOptionsService({pool:c});const quote=await options.get(Number(l.loanid),{role:'customer',customerId:Number(customer)});assert.equal(quote.ready,true);
   await c.query('SAVEPOINT legacy');await assert.rejects(()=>fund(c,l),/cần đối soát/);await c.query('ROLLBACK TO legacy');
   await risk(c,0.01,'LOAN_PAYMENT',account,'InternetBanking');
   const key='LP-'+randomUUID();
   const pay=()=>query(c,"SELECT banking_api.pay_loan($1,$2,$3,$4,NULL,1000,$5,'Online') AS r",[customer,l.loanid,schedule.scheduleid,account,key]);
   const result=await pay();assert.equal(result.r.status,'Success');
   assert.equal((await query(c,'SELECT balance FROM bank_account WHERE accountid=$1',[account])).balance,'1000.00');
   assert.equal((await query(c,'SELECT status FROM loan WHERE loanid=$1',[l.loanid])).status,'Paid');
   assert.equal((await pay()).r.transactionid,result.r.transactionid);
   assert.equal((await query(c,'SELECT count(*)::int AS n FROM loan_payment WHERE loanid=$1',[l.loanid])).n,1);
  }));
  await t.test('backend approval and customer repayment work without model context or SQL changes',()=>isolated(async c=>{
   const {repayLoanWithoutRisk}=require('../dist/database/loan-repayment');
   const {listVisibleTransactions}=require('../dist/database/transaction-list');
   await c.query("SELECT set_config('app.fraud_model','',true)");
   await c.query("INSERT INTO customer_online_account(customerid,username,passwordhash) VALUES($1,$2,'test-only-unused')",[customer,'repayment-'+randomUUID()]);
   const service=new CustomerProductsService({pool:c,transaction:async(_context,work)=>work(c),prepareRisk:()=>assert.fail('No staff inference')},new ConfigService({}));
   const l=await loan(c),actor={role:'employee',userId:Number(user),employeeId:Number(employee),branchId:Number(branch)};
   const input={decision:'APPROVE',reason:'Verified application',destinationAccountId:Number(account),requestKey:randomUUID()};
   const result=await service.decideLoan(Number(l.loanid),input,actor);
   assert.equal(result.status,'Active');assert.equal(result.disbursement.modelEvaluated,false);assert.equal(result.disbursement.modelprobability,null);
   const visible=await listVisibleTransactions(c,[customer,null,null,null,null,null,1,100,null]);
   assert.equal(visible.total,0);assert.deepEqual(visible.items,[]);
   for(const {scheduleid} of (await c.query('SELECT scheduleid FROM repayment_schedule WHERE loanid=$1 ORDER BY installmentno',[l.loanid])).rows) {
    const args=[customer,l.loanid,scheduleid,account,null,'500','LP-'+randomUUID(),'Online'];
    const paid=await repayLoanWithoutRisk(c,args);assert.equal(paid.status,'Success');assert.equal(paid.modelEvaluated,false);
    assert.equal((await repayLoanWithoutRisk(c,args)).transactionid,paid.transactionid);
   }
   assert.equal((await query(c,'SELECT status FROM loan WHERE loanid=$1',[l.loanid])).status,'Paid');
   assert.equal((await query(c,'SELECT balance FROM bank_account WHERE accountid=$1',[account])).balance,'0.00');
  }));
  await t.test('concurrent requests with different keys still disburse once',async()=>{
   const l=await loan(pool);const attempts=await Promise.allSettled(Array.from({length:6},async()=>{const c=await pool.connect();try{await c.query('BEGIN');await risk(c,0.01);const r=await fund(c,l);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}));
   assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
   assert.equal((await query(pool,'SELECT count(*)::int AS n FROM banking.transaction_posting WHERE transactionid=$1',[attempts.find(r=>r.status==='fulfilled').value.disbursement.transactionid])).n,2);
  });
  assert.deepEqual(await columns(),before);
 }finally{await pool.end();}
});

test('officer completes a legacy pending review without inference and replays the recorded approval',async()=>{
 const actor={role:'employee',userId:1,employeeId:2,branchId:3};
 const input={decision:'APPROVE',reason:'Verified application',destinationAccountId:10,requestKey:randomUUID()};
 let saved,approvals=0;
 const client={query:async(sql,args)=>{
   if(sql.includes('SELECT * FROM banking.loan WHERE loanid=$1 FOR UPDATE'))return {rows:[{loanid:1,branchid:3,customerid:7,loantypeid:1,principalamount:'1000.00',status:saved?'Active':'Pending'}]};
   if(sql.includes("SELECT newvalue FROM banking.audit_log"))return {rows:saved?[{newvalue:saved}]:[]};
   if(sql.includes('SELECT t.transactionid,t.transactioncode'))return {rows:[{transactionid:50,transactioncode:'LD-legacy',status:'Pending',description:'LOAN_DISBURSEMENT|1',amount:'1000.00',initiatedbycustomerid:7,sourceaccountid:20,destinationaccountid:10}]};
   if(sql.includes('SELECT reviewcaseid'))return {rows:[{reviewcaseid:81}]};
   if(sql.includes('banking_api.resolve_review')){approvals++;return {rows:[{result:{transactionid:50,transactioncode:'LD-legacy',status:'Success',typecode:'DEPOSIT',destinationaccountid:10}}]};}
   if(sql==='SELECT * FROM banking.loan WHERE loanid=$1')return {rows:[{loanid:1,status:'Active'}]};
   if(sql.includes('INSERT INTO banking.audit_log'))saved=JSON.parse(args[3]);
   return {rows:[]};
 }};
 const service=new CustomerProductsService({transaction:async(_context,work)=>work(client),prepareRisk:()=>assert.fail('Staff must never predict')},new ConfigService({}));
 const first=await service.decideLoan(1,input,actor);
 assert.equal(first.status,'Active');assert.equal(first.disbursement.status,'Success');assert.equal(first.resolvedExistingDisbursement,true);
 assert.equal((await service.decideLoan(1,input,actor)).disbursement.transactionid,50);assert.equal(approvals,1);
 await assert.rejects(()=>service.decideLoan(1,{...input,destinationAccountId:11},actor),/thông tin khác/);
});
