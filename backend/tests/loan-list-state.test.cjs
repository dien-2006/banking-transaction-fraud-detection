const test=require('node:test'),assert=require('node:assert/strict');
const {attachLoanDisbursements}=require('../dist/database/loan-disbursements');
test('loan list fetches actual disbursements only for the authorized page in one query',async()=>{
 const page={items:[{loanid:'19',status:'Pending'},{loanid:'20',status:'Active'}],total:2};let calls=0;
 await attachLoanDisbursements({query:async(sql,args)=>{
  calls++;assert.deepEqual(args,[['19','20']]);assert.match(sql,/banking_api.transaction_result/);assert.match(sql,/LOAN_DISBURSEMENT/);
  return {rows:[{loanid:'19',disbursement:{status:'Pending',decision:'REVIEW',reviewcaseid:81}},{loanid:'20',disbursement:null}]};
 }},page);
 assert.equal(calls,1);assert.equal(page.items[0].status,'Pending');assert.equal(page.items[0].disbursement.reviewcaseid,81);assert.equal(page.items[1].disbursement,null);
 await attachLoanDisbursements({query:()=>assert.fail('No unscoped query')},{items:[]});
});
