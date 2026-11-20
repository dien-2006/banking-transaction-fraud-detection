const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseService}=require('../dist/database/database.service');
const {repayLoanWithoutRisk}=require('../dist/database/loan-repayment');
const {presentBusinessAuthorization,moneyUnits}=require('../dist/database/business-authorization');
const args=[101,7,8,9,null,'1000.00','LP-fixed-key','Online'];
function fixture(options={}) {
 const calls=[];
 const prior=options.prior;
 const receipt={transactionid:77,typecode:'LOAN_PAYMENT',transactioncode:'LP-fixed-key',amount:'1000.00',status:options.status??'Success',
   rulescore:0,risklevel:'LOW',modelprobability:0,reasonjson:{authorization_mode:'LOAN_PAYMENT',model_evaluated:false,risk_evaluated:false}};
 const client={query:async(sql,values)=>{
  calls.push([sql,values]);
  let rows=[];
  if(sql.includes('customer_online_account'))rows=options.inactive?[]:[{ok:1}];
  else if(sql.includes('SELECT customerid,status FROM banking.loan'))rows=[{customerid:options.foreignLoan?202:101,status:options.loanStatus??'Active'}];
  else if(sql.includes('business-existing'))rows=prior?[prior]:[];
  else if(sql.includes('SELECT status FROM banking.repayment_schedule'))rows=[{status:'Pending'}];
  else if(sql.includes("split_part(t.description"))rows=options.otherPending?[{transactionid:99}]:[];
  else if(sql.includes('loan_remaining'))rows=[{total:options.total??'1000.00'}];
  else if(sql.includes('loan_counterparty_account'))rows=[{accountid:options.noCounterparty?null:20}];
  else if(sql.includes('CROSS JOIN banking.bank_account'))rows=options.badAccounts?[]:[{ok:1}];
  else if(sql.includes('FROM banking.account_holder WHERE'))rows=options.noOwner?[]:[{ok:1}];
  else if(sql.includes('SELECT transactiontypeid'))rows=[{transactiontypeid:3}];
  else if(sql.includes('INSERT INTO banking.bank_transaction'))rows=[{transactionid:77}];
  else if(sql.includes('SELECT decision FROM'))rows=options.block?[{decision:'BLOCK'}]:[];
  else if(sql.includes('business-policy'))rows=[{modelversionid:42}];
  else if(sql.includes('post_balanced_transaction'))rows=[{status:options.status??'Success'}];
  else if(sql.includes('finalize_loan_payment')&&options.failFinalize)throw new Error('finalization failed');
  else if(sql.includes('transaction_result'))rows=[{result:receipt}];
  return {rows};
 },release:()=>calls.push(['RELEASE'])};
 return {calls,client,receipt};
}
const old={transactionid:77,customerid:101,sourceaccountid:9,destinationaccountid:20,amount:'1000.00',typecode:'LOAN_PAYMENT',channel:'InternetBanking',description:'LOAN_PAYMENT|7|8|Online',status:'Success'};
test('loan repayment routes around inference and finalizes debt only after committed-intent posting succeeds',async()=>{
 const {client,calls}=fixture();
 const db={transaction:async(_context,work)=>work(client),prepareRisk:()=>assert.fail('Repayment must not invoke Risk/ML')};
 const result=await DatabaseService.prototype.function.call(db,'banking_api.pay_loan',args);
 assert.equal(result.status,'Success');assert.equal(result.modelEvaluated,false);assert.equal(result.modelprobability,null);
 assert.ok(calls.findIndex(([sql])=>sql.includes('post_balanced_transaction'))<calls.findIndex(([sql])=>sql.includes('finalize_loan_payment')));
 assert.equal(calls.some(([sql])=>/banking_api\.(pay_loan|assess_transaction|calculate_risk|joblib_features)\(/.test(sql)),false);
 assert.equal(calls.filter(([sql])=>sql.includes('INSERT INTO banking.risk_assessment')).length,1);
});
test('ordinary online customer transfers still require the existing model path',async()=>{
 let evaluated=0;
 const fake={transaction:async(_context,work)=>work({query:()=>assert.fail('Core must not run after inference failure')}),prepareRisk:async()=>{evaluated++;throw new Error('model offline');}};
 await assert.rejects(()=>DatabaseService.prototype.function.call(fake,'banking_api.create_transfer',[]),/model offline/);
 assert.equal(evaluated,1);
});
test('insufficient balance never settles the schedule; finalizer errors roll back the whole DB transaction',async()=>{
 const failed=fixture({status:'Failed'});assert.equal((await repayLoanWithoutRisk(failed.client,args)).status,'Failed');
 assert.equal(failed.calls.some(([sql])=>sql.includes('finalize_loan_payment')),false);
 const broken=fixture({failFinalize:true});
 const fake={pool:{connect:async()=>broken.client},ensureCryptoCompatibility:async()=>{},setContext:async()=>{}};
 await assert.rejects(()=>DatabaseService.prototype.transaction.call(fake,{},c=>repayLoanWithoutRisk(c,args)),/finalization failed/);
 assert.ok(broken.calls.some(([sql])=>sql==='ROLLBACK'));assert.ok(!broken.calls.some(([sql])=>sql==='COMMIT'));
});
test('repayment rejects foreign loans/accounts, changed debt, invalid amount, other pending payment and BLOCK before posting',async()=>{
 for(const option of [{inactive:true},{foreignLoan:true},{noOwner:true},{badAccounts:true},{total:'999.99'},{noCounterparty:true},{otherPending:true},{loanStatus:'Pending'},{block:true}]) {
  const {client,calls}=fixture(option);await assert.rejects(()=>repayLoanWithoutRisk(client,args));
  assert.equal(calls.some(([sql])=>sql.includes('post_balanced_transaction')),false);
 }
 for(const amount of ['0','NaN','1.001','-1'])await assert.rejects(()=>repayLoanWithoutRisk(fixture().client,[...args.slice(0,5),amount,...args.slice(6)]));
});
test('retries return the existing receipt even after a loan is Paid; changed payload cannot debit again',async()=>{
 const retry=fixture({prior:old,loanStatus:'Paid'});assert.equal((await repayLoanWithoutRisk(retry.client,args)).transactionid,77);
 assert.equal(retry.calls.some(([sql])=>sql.includes('INSERT INTO')||sql.includes('post_balanced_transaction')),false);
 for(const patch of [{customerid:202},{sourceaccountid:10},{amount:'1001.00'},{description:'LOAN_PAYMENT|7|99|Online'}]) {
  await assert.rejects(()=>repayLoanWithoutRisk(fixture({prior:{...old,...patch}}).client,args));
 }
});
test('legacy pending repayment follows the new exemption only for its exact owner, key, amount and schedule',async()=>{
 const retry=fixture({prior:{...old,status:'Pending'}});
 const result=await repayLoanWithoutRisk(retry.client,args);assert.equal(result.status,'Success');
 assert.equal(retry.calls.some(([sql])=>sql.includes('INSERT INTO banking.bank_transaction')),false);
 assert.ok(retry.calls.some(([sql])=>sql.includes('UPDATE banking.review_case')));
});
test('manual compatibility fields are never presented as calculated risk or model probability; money stays exact',()=>{
 const row={reasonjson:{model_evaluated:false,authorization_mode:'STAFF_MOVEMENT'},modelprobability:0,rulescore:0,risklevel:'LOW'};
 assert.equal(presentBusinessAuthorization({items:[row]}).items[0].modelprobability,null);
 assert.equal(presentBusinessAuthorization({modelprobability:'.65'}).modelprobability,'.65');
 assert.equal(moneyUnits('99999999999999999.99'),9999999999999999999n);
});
