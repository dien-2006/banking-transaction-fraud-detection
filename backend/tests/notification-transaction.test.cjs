require('reflect-metadata');
const test=require('node:test'),assert=require('node:assert/strict');
const {CustomerController}=require('../dist/http/customer.controller');
const {DatabaseService}=require('../dist/database/database.service');

test('transaction lookup uses the authenticated customer identity and exact transaction ID',async()=>{
 let args;
 const controller=new CustomerController({customerTransactionDetail:async(...values)=>{args=values;return null;}},{});
 await controller.transaction({role:'customer',customerId:101},901);
 assert.deepEqual(args,[901,101]);
 assert.throws(()=>controller.transaction({role:'employee'},901),/Customer identity required/);
});
test('transaction enrichment preserves authorization and returns no data for inaccessible transactions',async()=>{
 const calls=[];
 const db={sourceTimezone:'Asia/Ho_Chi_Minh',pool:{query:async(sql,args)=>{calls.push({sql,args});return {rows:[]};}}};
 assert.equal(await DatabaseService.prototype.customerTransactionDetail.call(db,901,101),null);
 assert.deepEqual(calls[0].args,[901,101,'Asia/Ho_Chi_Minh']);
 assert.match(calls[0].sql,/banking_api\.get_transaction\(\$1::bigint,\$2::bigint\)/);
 assert.match(calls[0].sql,/WHERE d\.body IS NOT NULL/);
});
