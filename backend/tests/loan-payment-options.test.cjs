require('reflect-metadata');
const test=require('node:test'),assert=require('node:assert/strict');
const {ConfigService}=require('@nestjs/config');
const {LoanPaymentOptionsService,loanSettlementAccountId}=require('../dist/http/loan-payment-options');
const {TransactionController}=require('../dist/http/transaction.controller');

test('loan settlement configuration fails closed for missing or invalid account IDs',()=>{
 for(const value of [undefined,'',0,-1,'abc',1.2,Infinity])assert.equal(loanSettlementAccountId(new ConfigService({LOAN_SETTLEMENT_ACCOUNT_ID:value})),null);
 assert.equal(loanSettlementAccountId(new ConfigService({LOAN_SETTLEMENT_ACCOUNT_ID:'42'})),42);
});
test('payment quotes scope the loan to the authenticated customer',async()=>{
 let args;
 const options=new LoanPaymentOptionsService({pool:{query:async(_sql,values)=>{args=values;return {rows:[]};}}},new ConfigService({LOAN_SETTLEMENT_ACCOUNT_ID:42}));
 await assert.rejects(()=>options.get(7,{role:'employee',customerId:101}),/Chỉ dành/);
 await assert.rejects(()=>options.get(7,{role:'customer',customerId:101}),/Không tìm thấy/);
 assert.deepEqual(args,[7,101,42]);
});
test('missing settlement disables quotes and rejects payment before inference or posting',async()=>{
 const config=new ConfigService({});
 const options=new LoanPaymentOptionsService({pool:{query:async()=>({rows:[{loanid:7,status:'Active',settlementReady:false,schedules:[]}]})}},config);
 const result=await options.get(7,{role:'customer',customerId:101});
 assert.equal(result.ready,false);assert.match(result.unavailableReason,/chưa cấu hình/);
 const controller=new TransactionController({function:()=>assert.fail('No financial call allowed')},{},config);
 assert.throws(()=>controller.loanPayment({role:'customer',customerId:101},{}),/chưa cấu hình/);
});
test('repayment delegates to Banking Core with exact amount, fixed settlement and stable transaction code',()=>{
 let call;
 const controller=new TransactionController({function:(...args)=>{call=args;return {status:'Pending'};}},{},new ConfigService({LOAN_SETTLEMENT_ACCOUNT_ID:42}));
 const data={loanId:7,scheduleId:8,sourceAccountId:9,amount:'1118.87',transactionCode:'LP-retry-code'};
 assert.throws(()=>controller.loanPayment({role:'employee',customerId:101},data));
 const result=controller.loanPayment({role:'customer',customerId:101},data);
 assert.deepEqual(call,['banking_api.pay_loan',[101,7,8,9,42,'1118.87','LP-retry-code','Online']]);
 assert.equal(result.status,'Pending');
});
