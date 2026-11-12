require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('class-validator');
const { plainToInstance } = require('class-transformer');
const { CardIssueDto, LoanCreateDto } = require('../dist/http/management.dto');
const { ManagementController } = require('../dist/http/management.controller');
const { DatabaseService } = require('../dist/database/database.service');
const { ConfigService } = require('@nestjs/config');

const card = { accountId:1,customerId:1,expiryDate:'2099-01-01',cardType:'Debit',pin:'1234',dailyLimit:'1000000' };
const loan = { customerId:1,branchId:1,loanTypeId:1,principal:'1000000',interestRate:'8.5',termMonths:12,startDate:'2026-11-11' };

test('card and loan IDs are required while generated numbers/codes may be omitted', async () => {
  assert.deepEqual(await validate(plainToInstance(CardIssueDto,card)),[]);
  assert.deepEqual(await validate(plainToInstance(LoanCreateDto,loan)),[]);
  for(const [Dto,input] of [[CardIssueDto,card],[LoanCreateDto,loan]]) {
    assert.ok((await validate(plainToInstance(Dto,{...input,customerId:undefined}))).length);
  }
  for(const input of [{...card,pin:'12ab'},{...card,pin:'123'},{...card,dailyLimit:'0'},{...card,dailyLimit:'1.001'},{...card,dailyLimit:'1e3'}]) {
    assert.ok((await validate(plainToInstance(CardIssueDto,input))).length);
  }
  for(const input of [{...loan,principal:'-1'},{...loan,principal:'1.001'},{...loan,termMonths:0},{...loan,termMonths:1.5},{...loan,interestRate:'-1'},{...loan,interestRate:'1.00001'}]) {
    assert.ok((await validate(plainToInstance(LoanCreateDto,input))).length);
  }
});

test('card account choices and loan creation preserve customer and branch scope', async () => {
  const calls=[];
  const db={pool:{query:async(sql,args)=>{calls.push({sql,args});return {rows:[{accountid:'7'}]};}},function:async(name,args)=>{calls.push({name,args});return {};}};
  const c=new ManagementController(db),user={role:'employee',userId:1,employeeId:2,branchId:3};
  await c.customerAccounts(42,user);
  assert.deepEqual(calls[0].args,[42,3,1]);
  assert.deepEqual(calls[1].args,[42,3]);
  assert.match(calls[1].sql,/status='Active'/);
  await c.createLoan({...loan,branchId:3,customerId:42},user,{});
  assert.equal(calls.at(-1).args[0],null);
  assert.equal(calls.at(-1).args[1],42);
});

test('automatic card/loan creation is unique, scoped, validated and does not move money', {
  skip:!process.env.CUSTOMER_CODE_TEST_URL,
},async()=>{
  const url=new URL(process.env.CUSTOMER_CODE_TEST_URL);
  assert.ok(url.pathname.startsWith('/d4_'));
  const db=new DatabaseService(new ConfigService({POSTGRES_HOST:url.hostname,POSTGRES_INTERNAL_PORT:Number(url.port),POSTGRES_DB:url.pathname.slice(1),POSTGRES_USER:url.username,POSTGRES_PASSWORD:'isolated-test'}));
  try {
    const role=(await db.pool.query("INSERT INTO banking.role(rolename) VALUES('Product tester') RETURNING roleid")).rows[0].roleid;
    const actors=[];
    for(let i=0;i<2;i++) {
      const branch=(await db.pool.query("INSERT INTO banking.branch(branchcode,branchname,address,city,opendate) VALUES($1,'Test','Test','Test',CURRENT_DATE) RETURNING branchid",['PROD-'+i])).rows[0].branchid;
      const employee=(await db.pool.query("INSERT INTO banking.employee(employeecode,branchid,roleid,fullname,phone,email,hiredate,salary) VALUES($1,$2,$3,'Test',$4,$5,CURRENT_DATE,0) RETURNING employeeid",['PROD-'+i,branch,role,'091000000'+i,'prod'+i+'@example.invalid'])).rows[0].employeeid;
      const user=(await db.pool.query("INSERT INTO banking.\"system_user\"(employeeid,username,passwordhash) VALUES($1,$2,'unused') RETURNING userid",[employee,'prod-'+i])).rows[0].userid;
      actors.push({role:'employee',branchId:branch,userId:user,employeeId:employee});
    }
    const c=new ManagementController(db),a=actors[0],b=actors[1];
    const owner=await c.createCustomer({name:'Product owner'},a,{});
    const other=await c.createCustomer({name:'Other owner'},b,{});
    const accountType=(await db.pool.query("INSERT INTO banking.account_type(typename) VALUES('Product account') RETURNING accounttypeid")).rows[0].accounttypeid;
    const account=await c.openAccount({branchId:a.branchId,accountTypeId:accountType,customerId:owner.customerid},a,{});
    assert.equal((await c.customerAccounts(owner.customerid,a)).length,1);
    await assert.rejects(()=>c.customerAccounts(other.customerid,a));
    const cardInput={...card,accountId:account.accountid,customerId:owner.customerid};
    const cards=await Promise.all(Array.from({length:6},()=>c.issueCard(cardInput,a,{})));
    assert.equal(new Set(cards.map(row=>row.maskedcardnumber)).size,6);
    for(const row of cards) {assert.ok(!('cardnumber' in row));assert.ok(!('pinhash' in row));assert.match(row.maskedcardnumber,/^\*{12}\d{4}$/);}
    const actual=(await db.pool.query("SELECT cardnumber,pinhash=public.crypt('1234',pinhash) AS valid_pin FROM banking.card WHERE cardid=$1",[cards[0].cardid])).rows[0];
    let sum=0;for(let i=0;i<actual.cardnumber.length;i++){let n=Number(actual.cardnumber[actual.cardnumber.length-1-i]);if(i%2===1){n*=2;if(n>9)n-=9;}sum+=n;}
    assert.equal(sum%10,0);assert.equal(actual.valid_pin,true);
    const luhnNumber=id=>{const body='9'+String(id).padStart(14,'0');let n=0;for(let i=0;i<body.length;i++){let digit=Number(body[body.length-1-i]);if(i%2===0){digit*=2;if(digit>9)digit-=9;}n+=digit;}return body+String((10-n%10)%10);};
    const reservedCardId=Math.max(...cards.map(row=>row.cardid))+2;
    await c.issueCard({...cardInput,cardNumber:luhnNumber(reservedCardId)},a,{});
    const nextCard=await c.issueCard(cardInput,a,{});
    assert.equal(nextCard.cardid,reservedCardId+1);
    for(const bad of [{...cardInput,customerId:other.customerid},{...cardInput,pin:'bad'},{...cardInput,expiryDate:'2000-01-01'},{...cardInput,dailyLimit:'-1'}]) await assert.rejects(()=>c.issueCard(bad,a,{}));
    const product=(await db.pool.query("INSERT INTO banking.loan_type(loantypename,maxamount,defaultinterestrate,maxtermmonths) VALUES('Test loan',50000000,8.5,36) RETURNING loantypeid")).rows[0].loantypeid;
    const loanInput={...loan,branchId:a.branchId,customerId:owner.customerid,loanTypeId:product};
    const loans=await Promise.all(Array.from({length:8},()=>c.createLoan(loanInput,a,{})));
    assert.equal(new Set(loans.map(row=>row.loancode)).size,8);
    for(const row of loans){assert.match(row.loancode,/^LN\d{8}$/);assert.equal(row.status,'Pending');}
    const reservedLoanId=Math.max(...loans.map(row=>row.loanid))+2;
    await c.createLoan({...loanInput,code:'LN'+String(reservedLoanId).padStart(8,'0')},a,{});
    const nextLoan=await c.createLoan(loanInput,a,{});
    assert.equal(nextLoan.loanid,reservedLoanId+1);
    await assert.rejects(()=>c.createLoan({...loanInput,customerId:other.customerid},a,{}));
    for(const bad of [{...loanInput,principal:'50000001'},{...loanInput,termMonths:37},{...loanInput,principal:'1.001'},{...loanInput,interestRate:'-1'}]) await assert.rejects(()=>c.createLoan(bad,a,{}));
    assert.equal((await db.pool.query('SELECT balance FROM banking.bank_account WHERE accountid=$1',[account.accountid])).rows[0].balance,'0.00');
    assert.equal(Number((await db.pool.query('SELECT count(*) AS n FROM banking.transaction_posting')).rows[0].n),0);
    assert.equal(Number((await db.pool.query('SELECT count(*) AS n FROM banking.card')).rows[0].n),8);
    assert.equal(Number((await db.pool.query('SELECT count(*) AS n FROM banking.loan')).rows[0].n),10);
    await db.pool.query("UPDATE banking.customer SET status='Inactive' WHERE customerid=$1",[owner.customerid]);
    await assert.rejects(()=>c.issueCard(cardInput,a,{}));
    await assert.rejects(()=>c.createLoan(loanInput,a,{}));
    await assert.rejects(()=>c.openAccount({branchId:a.branchId,accountTypeId:accountType,customerId:owner.customerid},a,{}));
    const audit=(await db.pool.query("SELECT newvalue FROM banking.audit_log WHERE entitytype='CARD' AND action='INSERT'")).rows;
    assert.ok(audit.every(row=>!('cardnumber' in row.newvalue)&&!('pinhash' in row.newvalue)));
  }finally{await db.onModuleDestroy();}
});
