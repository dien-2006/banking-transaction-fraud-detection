import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './module-loader.mjs';
const {loanState}=await import(await moduleUrl('loan-state'));
test('loan display distinguishes an application from a disbursement awaiting exact risk review',()=>{
 assert.equal(loanState({status:'Pending'}).label,'Chờ phê duyệt');
 const row={status:'Pending',disbursement:{status:'Pending',decision:'REVIEW',reviewcaseid:81}};
 assert.equal(loanState(row).label,'Chờ xác nhận giải ngân');assert.equal(loanState(row).reviewId,'81');assert.equal(row.status,'Pending');
 assert.equal(loanState({...row,disbursement:{...row.disbursement,reviewcaseid:undefined}}).reviewId,'');
 assert.equal(loanState({...row,status:'Active'}).label,'Đang trả nợ');assert.equal(loanState({...row,status:'Active'}).reviewId,'');
});
test('ALLOW does not imply completed funding and failed funding is not shown as an untouched application',()=>{
 assert.equal(loanState({status:'Pending',disbursement:{status:'Pending',decision:'ALLOW'}}).label,'Đang giải ngân');
 for(const [status,label] of [['Cancelled','Giải ngân bị từ chối'],['Failed','Giải ngân thất bại'],['Success','Cần đối soát giải ngân']])assert.equal(loanState({status:'Pending',disbursement:{status}}).label,label);
});

const {recoverLoanDecision}=await import(await moduleUrl('loan-state'));
test('a lost approval response recovers Failed/Cancelled/Pending as well as Success, for the exact stored request',()=>{
 const draft={decision:'APPROVE',requestKey:'same-request',destinationAccountId:10};
 const receipt={transactionid:88,transactioncode:'LD-same-request',typecode:'DEPOSIT',amount:'50000000.00',destinationaccountid:10,status:'Failed',failureCode:'INSUFFICIENT_BALANCE',failureReason:'Tài khoản nguồn ngân hàng không đủ số dư.'};
 const options={loanId:28,status:'Pending',disbursement:receipt};
 for(const status of ['Failed','Cancelled','Pending'])assert.equal(recoverLoanDecision(28,{...options,disbursement:{...receipt,status}},draft).disbursement.status,status);
 assert.equal(recoverLoanDecision(28,options,draft).disbursement.failureCode,'INSUFFICIENT_BALANCE');
 assert.equal(recoverLoanDecision(28,{...options,status:'Active',disbursement:{...receipt,status:'Success'}},draft).status,'Active');
 for(const patch of [{transactioncode:'LD-another'},{destinationaccountid:11},{typecode:'TRANSFER'},{amount:undefined},{transactionid:undefined},{status:'ALLOW'}])assert.equal(recoverLoanDecision(28,{...options,disbursement:{...receipt,...patch}},draft),null);
 assert.equal(recoverLoanDecision(29,options,draft),null);
 assert.equal(recoverLoanDecision(28,{...options,disbursement:{...receipt,status:'Success'}},draft),null);
 assert.equal(recoverLoanDecision(28,options,{...draft,decision:'REJECT'}),null);
});
