import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './module-loader.mjs';
const {loanState}=await import(await moduleUrl('loan-state'));
test('loan display distinguishes an application from a disbursement awaiting exact risk review',()=>{
 assert.equal(loanState({status:'Pending'}).label,'Chờ phê duyệt');
 const row={status:'Pending',disbursement:{status:'Pending',decision:'REVIEW',reviewcaseid:81}};
 assert.equal(loanState(row).label,'Chờ thẩm định giải ngân');assert.equal(loanState(row).reviewId,'81');assert.equal(row.status,'Pending');
 assert.equal(loanState({...row,disbursement:{...row.disbursement,reviewcaseid:undefined}}).reviewId,'');
 assert.equal(loanState({...row,status:'Active'}).label,'Đang trả nợ');assert.equal(loanState({...row,status:'Active'}).reviewId,'');
});
test('ALLOW does not imply completed funding and failed funding is not shown as an untouched application',()=>{
 assert.equal(loanState({status:'Pending',disbursement:{status:'Pending',decision:'ALLOW'}}).label,'Đang giải ngân');
 for(const [status,label] of [['Cancelled','Giải ngân bị từ chối'],['Failed','Giải ngân thất bại'],['Success','Cần đối soát giải ngân']])assert.equal(loanState({status:'Pending',disbursement:{status}}).label,label);
});
