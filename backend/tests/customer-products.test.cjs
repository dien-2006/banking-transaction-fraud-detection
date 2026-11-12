require('reflect-metadata');
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {validate}=require('class-validator');
const {plainToInstance}=require('class-transformer');
const {ConfigService}=require('@nestjs/config');
const {DatabaseService}=require('../dist/database/database.service');
const {CustomerProductsService}=require('../dist/http/customer-products.service');
const {CustomerProductsController,LoanDecisionController}=require('../dist/http/customer-products.controller');
const {CustomerAccountDto,CustomerCardDto,CustomerLoanDto,LoanDecisionDto}=require('../dist/http/customer-products.dto');

test('self service DTOs reject client-supplied identity, numbers, credit policies and loan rates',async()=>{
  const key=randomUUID(), account={requestKey:key,branchId:1,accountTypeId:1}, card={requestKey:key,accountId:1,pin:'1234'}, loan={requestKey:key,branchId:1,loanTypeId:1,principal:'1000',termMonths:12};
  for(const [Dto,data] of [[CustomerAccountDto,account],[CustomerCardDto,card],[CustomerLoanDto,loan]]){
    assert.deepEqual(await validate(plainToInstance(Dto,data),{whitelist:true,forbidNonWhitelisted:true}),[]);
    for(const extra of [{customerId:999},{accountNumber:'MANUAL'},{interestRate:'0'},{cardType:'Credit'},{dailyLimit:'999999999'}])
      assert.ok((await validate(plainToInstance(Dto,{...data,...extra}),{whitelist:true,forbidNonWhitelisted:true})).length);
  }
  for(const cardType of ['Debit','Debit Napas','Debit Visa','Debit Mastercard'])
    assert.deepEqual(await validate(plainToInstance(CustomerCardDto,{...card,cardType})),[]);
  for(const cardType of ['Credit','Credit Visa','Virtual','Something else'])
    assert.ok((await validate(plainToInstance(CustomerCardDto,{...card,cardType}))).length);
  for(const input of [{...card,pin:'12a4'},{...card,pin:'123'},{...card,requestKey:'x'}])assert.ok((await validate(plainToInstance(CustomerCardDto,input))).length);
  for(const input of [{...loan,termMonths:0},{...loan,termMonths:1.2},{...loan,principal:'-1'},{...loan,principal:'1e9'}])assert.ok((await validate(plainToInstance(CustomerLoanDto,input))).length);
  assert.ok((await validate(plainToInstance(LoanDecisionDto,{decision:'ACTIVE',reason:'x'}))).length);
  assert.deepEqual(Reflect.getMetadata('roles',CustomerProductsController),['customer']);
  assert.deepEqual(Reflect.getMetadata('roles',LoanDecisionController),['employee','admin']);
});

test('self service and loan decisions reject wrong actors before opening a transaction',async()=>{
  const service=new CustomerProductsService({transaction:()=>assert.fail('Unexpected transaction')},new ConfigService({OTP_HASH_SECRET:'test-only'}));
  await assert.rejects(()=>service.create('account',{}, {role:'employee'}),/Chỉ dành/);
  await assert.rejects(()=>service.decideLoan(1,{decision:'APPROVE',reason:'Good'}, {role:'customer',customerId:1}),/Không có quyền/);
  await assert.rejects(()=>service.decideLoan(1,{decision:'APPROVE',reason:'Good'}, {role:'employee',employeeId:1,userId:1}),/Không có quyền/);
});

test('real PostgreSQL self service is atomic, idempotent, scoped, masked and never posts money',{
  skip:!process.env.CUSTOMER_SELF_SERVICE_TEST_DB,
},async()=>{
  const name=process.env.CUSTOMER_SELF_SERVICE_TEST_DB;
  assert.match(name,/^d4_selfservice_[0-9]+$/);
  const config=new ConfigService({...process.env,POSTGRES_DB:name}),db=new DatabaseService(config);
  const service=new CustomerProductsService(db,config);
  try{
    const role=(await db.pool.query("INSERT INTO banking.role(rolename) VALUES('Self service test') RETURNING roleid")).rows[0].roleid;
    const actors=[];
    for(let i=0;i<2;i++){
      const branch=(await db.pool.query("INSERT INTO banking.branch(branchcode,branchname,address,city,opendate) VALUES($1,'Test','Test','Test',CURRENT_DATE) RETURNING branchid",['SELF-'+i])).rows[0].branchid;
      const employee=(await db.pool.query("INSERT INTO banking.employee(employeecode,branchid,roleid,fullname,phone,email,hiredate,salary) VALUES($1,$2,$3,'Test',$4,$5,CURRENT_DATE,0) RETURNING employeeid",['SELF-'+i,branch,role,'090000000'+i,'self'+i+'@example.invalid'])).rows[0].employeeid;
      const user=(await db.pool.query("INSERT INTO banking.\"system_user\"(employeeid,username,passwordhash) VALUES($1,$2,'unused') RETURNING userid",[employee,'SELF-'+i])).rows[0].userid;
      actors.push({role:'employee',userId:Number(user),employeeId:Number(employee),branchId:Number(branch)});
    }
    const owner=await db.function('banking_api.create_customer',[null,'Self Service Test',null,null,null,null,null,null,null,null,null]);
    const other=await db.function('banking_api.create_customer',[null,'Other Test',null,null,null,null,null,null,null,null,null]);
    const user={role:'customer',customerId:Number(owner.customerid)};
    const type=Number((await db.pool.query("INSERT INTO banking.account_type(typename) VALUES('Self service account') RETURNING accounttypeid")).rows[0].accounttypeid);
    const accountInput={requestKey:randomUUID(),branchId:actors[0].branchId,accountTypeId:type};
    const accounts=await Promise.all(Array.from({length:5},()=>service.create('account',accountInput,user)));
    assert.equal(new Set(accounts.map(row=>row.accountid)).size,1);
    assert.match(accounts[0].accountnumber,/^1\d{15,}$/);
    assert.equal(accounts[0].accountcategory,'CUSTOMER');
    assert.equal(Number(accounts[0].balance),0);
    const reordered={accountTypeId:type,branchId:actors[0].branchId,requestKey:accountInput.requestKey};
    assert.equal((await service.create('account',reordered,user)).accountid,accounts[0].accountid);
    await assert.rejects(()=>service.create('account',{...accountInput,branchId:actors[1].branchId},user),/thông tin khác/);
    const cardInput={requestKey:randomUUID(),accountId:accounts[0].accountid,pin:'4829'};
    await assert.rejects(()=>service.create('card',cardInput,{role:'customer',customerId:Number(other.customerid)}),/đứng tên chính/);
    const cards=await Promise.all(Array.from({length:4},()=>service.create('card',cardInput,user)));
    assert.equal(new Set(cards.map(row=>row.cardid)).size,1);
    assert.ok(cards.every(row=>!('cardnumber'in row)&&!('pinhash'in row)));
    assert.equal(cards[0].cardtype,'Debit');
    assert.equal(Number(cards[0].dailylimit),50000000);
    await db.function('banking_api.register_customer_online_account',[owner.customerid,'self-service-reveal','isolated-test-password']);
    const {CardNumberRevealService}=require('../dist/http/card-number-reveal');
    const numbers=new CardNumberRevealService(db,{check:async()=>{}});
    const revealed=await numbers.reveal(cards[0].cardid,user,'isolated-test-password');
    assert.equal(revealed.expiresIn,30);
    assert.match(revealed.cardNumber,/^9\d+$/);
    assert.equal(revealed.cardNumber,(await db.pool.query('SELECT cardnumber FROM banking.card WHERE cardid=$1',[cards[0].cardid])).rows[0].cardnumber);
    await assert.rejects(()=>numbers.reveal(cards[0].cardid,user,'incorrect-password'),error=>error.getStatus()===403);
    await assert.rejects(()=>numbers.reveal(cards[0].cardid,{role:'customer',customerId:Number(other.customerid)},'isolated-test-password'),error=>error.getStatus()===403);
    const accesses=(await db.pool.query("SELECT newvalue FROM banking.audit_log WHERE entitytype='CARD_ACCESS'")).rows;
    assert.equal(accesses.length,1);
    assert.ok(!JSON.stringify(accesses).includes(revealed.cardNumber));
    assert.ok(!JSON.stringify(accesses).includes('isolated-test-password'));
    await assert.rejects(()=>service.create('card',{...cardInput,pin:'9138'},user),/thông tin khác/);
    await assert.rejects(()=>service.create('card',{...cardInput,cardType:'Credit',requestKey:randomUUID()},user),/không được hỗ trợ/);
    await assert.rejects(()=>service.create('card',{...cardInput,cardType:'Debit Visa'},user),/thông tin khác/);
    for(const cardType of ['Debit Napas','Debit Visa','Debit Mastercard']) {
      const issued=await service.create('card',{...cardInput,cardType,requestKey:randomUUID()},user);
      assert.equal(issued.cardtype,cardType);
      assert.ok(!('cardnumber' in issued)&&!('pinhash' in issued));
    }
    await db.pool.query("UPDATE banking.bank_account SET status='Frozen' WHERE accountid=$1",[accounts[0].accountid]);
    await assert.rejects(()=>service.create('card',{...cardInput,requestKey:randomUUID()},user),/đứng tên chính/);
    await db.pool.query("UPDATE banking.bank_account SET status='Active' WHERE accountid=$1",[accounts[0].accountid]);
    const product=Number((await db.pool.query("INSERT INTO banking.loan_type(loantypename,maxamount,defaultinterestrate,maxtermmonths) VALUES('Self service loan',50000000,8.5,36) RETURNING loantypeid")).rows[0].loantypeid);
    const input={requestKey:randomUUID(),branchId:actors[0].branchId,loanTypeId:product,principal:'1000000',termMonths:12};
    const loans=await Promise.all(Array.from({length:4},()=>service.create('loan',input,user)));
    assert.equal(new Set(loans.map(row=>row.loanid)).size,1);
    assert.equal(loans[0].status,'Pending');
    assert.equal(Number(loans[0].employeeid),actors[0].employeeId);
    assert.equal(Number(loans[0].interestrate),8.5);
    assert.equal(Number((await db.pool.query('SELECT count(*) AS n FROM banking.repayment_schedule')).rows[0].n),0);
    await assert.rejects(()=>service.create('loan',{...input,requestKey:randomUUID(),principal:'50000001'},user));
    await assert.rejects(()=>service.create('loan',{...input,requestKey:randomUUID(),termMonths:37},user));
    await assert.rejects(()=>service.decideLoan(loans[0].loanid,{decision:'APPROVE',reason:'Valid test'},actors[1]),/chi nhánh khác/);
    const approved=await service.decideLoan(loans[0].loanid,{decision:'APPROVE',reason:'Approved test'},actors[0]);
    assert.equal(approved.status,'Active');
    const {LoanPaymentOptionsService}=require('../dist/http/loan-payment-options');
    const settlement=await db.function('banking_api.open_account',[null,actors[0].branchId,type,null,'INTERNAL']);
    const paymentOptions=new LoanPaymentOptionsService(db,new ConfigService({LOAN_SETTLEMENT_ACCOUNT_ID:settlement.accountid}));
    const quote=await paymentOptions.get(approved.loanid,user);
    assert.equal(quote.ready,true);
    assert.equal(quote.schedules.length,12);
    assert.equal(quote.schedules[0].total,'90416.66');
    assert.equal(quote.schedules[0].pendingPayment,false);
    await assert.rejects(()=>paymentOptions.get(approved.loanid,{role:'customer',customerId:Number(other.customerid)}),/Không tìm thấy/);
    assert.equal((await new LoanPaymentOptionsService(db,new ConfigService({})).get(approved.loanid,user)).ready,false);
    assert.equal(Number((await db.pool.query('SELECT count(*) AS n FROM banking.repayment_schedule WHERE loanid=$1',[approved.loanid])).rows[0].n),12);
    await assert.rejects(()=>service.decideLoan(approved.loanid,{decision:'APPROVE',reason:'Again test'},actors[0]),/đã được xử lý/);
    const rejected=await service.create('loan',{...input,requestKey:randomUUID()},user);
    assert.equal((await service.decideLoan(rejected.loanid,{decision:'REJECT',reason:'Rejected test'},actors[0])).status,'Cancelled');
    assert.equal(Number((await db.pool.query('SELECT count(*) AS n FROM banking.repayment_schedule WHERE loanid=$1',[rejected.loanid])).rows[0].n),0);
    const race=await service.create('loan',{...input,requestKey:randomUUID()},user);
    const results=await Promise.allSettled(['APPROVE','REJECT'].map(decision=>service.decideLoan(race.loanid,{decision,reason:'Concurrent test'},actors[0])));
    assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
    const catalog=await service.catalog(user);
    assert.equal(catalog.card.cardType,'Debit');
    assert.equal(catalog.card.types.length,4);
    assert.ok(catalog.accountTypes.some(row=>row.id===type));
    assert.equal(Number((await db.pool.query('SELECT count(*) AS n FROM banking.transaction_posting')).rows[0].n),0);
    assert.equal(Number((await db.pool.query('SELECT sum(balance) AS n FROM banking.bank_account')).rows[0].n),0);
    const audit=(await db.pool.query("SELECT newvalue FROM banking.audit_log WHERE entitytype='CUSTOMER_PRODUCT'")).rows;
    for(const row of audit){assert.ok(!JSON.stringify(row).includes('4829'));assert.ok(!JSON.stringify(row).includes('pinhash'));}
    const notes=(await db.pool.query("SELECT newvalue->>'reason' AS reason FROM banking.audit_log WHERE action='STATUS_CHANGE' AND entitytype='LOAN'")).rows;
    assert.ok(notes.some(row=>row.reason==='Rejected test'));
    const destinationAccount=await db.function('banking_api.open_account',[null,actors[0].branchId,type,other.customerid,'CUSTOMER']);
    const transferType=(await db.pool.query("INSERT INTO banking.transaction_type(typecode,typename) VALUES('TRANSFER','Notification link test') RETURNING transactiontypeid")).rows[0].transactiontypeid;
    const notificationTransaction=(await db.pool.query(`INSERT INTO banking.bank_transaction(transactioncode,transactiontypeid,channel,amount,currency,status,initiatedbycustomerid)
      VALUES('NOTICE-LINK-TEST',$1,'InternetBanking',1,'VND','Pending',$2) RETURNING transactionid`,[transferType,owner.customerid])).rows[0].transactionid;
    await db.pool.query(`INSERT INTO banking.transfer_request(transactionid,customerid,sourceaccountid,destinationaccountid,idempotencykey,amount,currency,status)
      VALUES($1,$2,$3,$4,'NOTICE-LINK-IDEMPOTENCY',1,'VND','Pending')`,[notificationTransaction,owner.customerid,accounts[0].accountid,destinationAccount.accountid]);
    const linked=await db.customerTransactionDetail(Number(notificationTransaction),Number(owner.customerid));
    assert.equal(Number(linked.transaction.transactionid),Number(notificationTransaction));
    assert.equal(linked.transaction.transactioncode,'NOTICE-LINK-TEST');
    assert.equal(linked.transfer.sourceAccountNumber,accounts[0].accountnumber);
    assert.equal(linked.transfer.destinationAccountNumber,destinationAccount.accountnumber);
    assert.equal(linked.transfer.destinationAccountName,'Other Test');
    assert.equal(await db.customerTransactionDetail(Number(notificationTransaction),Number(other.customerid)),null);
    // Failure after the product insert must roll back both product and replay record.
    const failing={transaction:(context,work)=>db.transaction(context,client=>work({query:async(sql,args)=>{
      if(sql.includes("VALUES('CUSTOMER_PRODUCT'"))throw new Error('Injected audit failure');
      return client.query(sql,args);
    }}))};
    const before=Number((await db.pool.query('SELECT count(*) AS n FROM banking.bank_account')).rows[0].n);
    await assert.rejects(()=>new CustomerProductsService(failing,config).create('account',{...accountInput,requestKey:randomUUID()},user),/Injected audit failure/);
    assert.equal(Number((await db.pool.query('SELECT count(*) AS n FROM banking.bank_account')).rows[0].n),before);
    console.log('PASS isolated product creation, concurrent retries, ownership, rejection, approval, rollback and no money movement');
  }finally{await db.onModuleDestroy();}
});

test('the existing approval endpoint delegates to the same reasoned, atomic loan decision service',async()=>{
  const {ManagementController}=require('../dist/http/management.controller');
  let received;
  const controller=new ManagementController({pool:{query:async()=>({rows:[{}]})}}, {decideLoan:async(...args)=>{received=args;return {status:'Active'};}});
  const actor={role:'employee',userId:1,employeeId:2,branchId:3};
  await controller.approveLoan(7,actor,{ip:'127.0.0.1'},{reason:'Checked application'});
  assert.deepEqual(received,[7,{decision:'APPROVE',reason:'Checked application'},actor,'127.0.0.1']);
});
