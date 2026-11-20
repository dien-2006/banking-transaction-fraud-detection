require('reflect-metadata');
const test=require('node:test'),assert=require('node:assert/strict');
const {LoanPaymentOptionsService}=require('../dist/http/loan-payment-options');
const {TransactionController}=require('../dist/http/transaction.controller');

test('payment quotes scope the loan to the authenticated customer without environment account IDs',async()=>{
 let args,query;
 const options=new LoanPaymentOptionsService({pool:{query:async(sql,values)=>{args=values;query=sql;return {rows:[]};}}});
 await assert.rejects(()=>options.get(7,{role:'employee',customerId:101}),/Chỉ dành/);
 await assert.rejects(()=>options.get(7,{role:'customer',customerId:101}),/Không tìm thấy/);
 assert.deepEqual(args,[7,101]);assert.match(query,/loan_counterparty_account\(l.loanid,FALSE\)/);
});
test('a missing bank ledger counterpart disables payment without asking the customer to configure IDs',async()=>{
 const options=new LoanPaymentOptionsService({pool:{query:async()=>({rows:[{loanid:7,status:'Active',funded:true,settlementReady:false,schedules:[]}]})}});
 const result=await options.get(7,{role:'customer',customerId:101});
 assert.equal(result.ready,false);assert.match(result.unavailableReason,/chưa thể tiếp nhận/);
 assert.ok(!/ID|cấu hình/.test(result.unavailableReason));
});
test('online repayment debits the selected customer account; Banking Core resolves the bank counterpart',()=>{
 let call;
 const controller=new TransactionController({function:(...args)=>{call=args;return {status:'Pending'};}},{});
 const data={loanId:7,scheduleId:8,sourceAccountId:9,amount:'1118.87',transactionCode:'LP-retry-code'};
 assert.throws(()=>controller.loanPayment({role:'employee',customerId:101},data));
 const result=controller.loanPayment({role:'customer',customerId:101},data);
 assert.deepEqual(call,['banking_api.pay_loan',[101,7,8,9,null,'1118.87','LP-retry-code','Online']]);
 assert.equal(result.status,'Pending');
});
test('existing Active loans keep online repayment without requiring a new disbursement receipt',async()=>{
 const options=new LoanPaymentOptionsService({pool:{query:async()=>({rows:[{loanid:7,status:'Active',funded:false,settlementReady:true,schedules:[]}]})}});
 const result=await options.get(7,{role:'customer',customerId:101});
 assert.equal(result.ready,true);assert.equal(result.unavailableReason,null);
});
test('a loan still pending approval cannot be repaid even when bank accounts exist',async()=>{
 const options=new LoanPaymentOptionsService({pool:{query:async()=>({rows:[{loanid:7,status:'Pending',funded:false,settlementReady:true,schedules:[]}]})}});
 assert.equal((await options.get(7,{role:'customer',customerId:101})).ready,false);
});
