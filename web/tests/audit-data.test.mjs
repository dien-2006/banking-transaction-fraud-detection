import assert from 'node:assert/strict';
import test from 'node:test';
import {moduleUrl} from './module-loader.mjs';
const {presentAuditLog,loadAuditLogs,summarizeAuditLogs}=await import(await moduleUrl('audit-data'));
const row=(patch={})=>({auditid:1,userid:2,actor_name:'Nguyễn An',actor_code:'EMP002',entitytype:'BANK_ACCOUNT',entityid:'15',action:'UPDATE',createdat:'2026-11-20 23:30:00',oldvalue:{balance:'100',passwordhash:'hidden-before'},newvalue:{balance:'200',passwordhash:'hidden-after'},...patch});
test('naive bank timestamps have the same day/time in UTC and Vietnamese browsers',()=>{
 const previous=process.env.TZ;
 try {
  for(const timezone of ['UTC','Asia/Ho_Chi_Minh']) {
   process.env.TZ=timezone;
   const log=presentAuditLog(row());assert.equal(log.day,'2026-11-20');assert.match(log.time,/23:30:00 20\/11\/2026/);
   const utc=presentAuditLog(row({createdat:'2026-11-20T23:30:00Z'}));assert.equal(utc.day,'2026-11-21');assert.match(utc.time,/06:30:00 21\/11\/2026/);
  }
 }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
test('missing userid never invents a system actor/name/IP; staff names and entity labels are resolved',()=>{
 const unknown=presentAuditLog(row({userid:null,actor_name:'Do not attribute',ipaddress:null}));
 assert.equal(unknown.user,'Chưa ghi nhận người thực hiện');assert.equal(unknown.actorKnown,false);assert.equal(unknown.ip,'—');
 const known=presentAuditLog(row({entitytype:'TRANSACTION_POSTING'}));assert.equal(known.user,'Nguyễn An');assert.equal(known.actorCode,'EMP002');assert.equal(known.target,'Bút toán giao dịch');
 assert.equal(known.changes,'Số dư');assert.deepEqual(known.changedFields,['balance']);assert.ok(!JSON.stringify(known).includes('hidden-'));
 assert.equal(presentAuditLog(row({actor_name:null})).user,'Người dùng #2');
});
test('all summaries use the filtered records and exclude unattributed entries from actor rankings',()=>{
 const logs=[row(),row({auditid:2,userid:null}),row({auditid:3,userid:3,actor_name:'Lê Bình',action:'INSERT',createdat:'2026-11-19 09:00:00'})].map(presentAuditLog);
 const filtered=logs.filter(log=>log.day==='2026-11-20');
 const summary=summarizeAuditLogs(filtered);assert.equal(summary.total,2);assert.equal(summary.actors,1);assert.equal(summary.updates,2);assert.equal(summary.unattributed,1);
 assert.equal(summary.actionCounts.reduce((n,x)=>n+x.count,0),2);assert.equal(summary.entityCounts.reduce((n,x)=>n+x.count,0),2);
 assert.deepEqual(summary.topActors,[{id:'2',name:'Nguyễn An',count:1}]);
 assert.deepEqual(summarizeAuditLogs([]).topActors,[]);assert.equal(summarizeAuditLogs([]).total,0);
});
test('latest-first ordering preserves large audit IDs and does not depend on JSON aggregate ordering',async()=>{
 const rows=[row({auditid:'9007199254740992'}),row({auditid:'3',createdat:'2026-11-21 01:00:00'}),row({auditid:'9007199254740993'})];
 const result=await loadAuditLogs(async()=>({items:rows,total:3,page:1,pageSize:100}));
 assert.deepEqual(result.map(log=>log.id),['3','9007199254740993','9007199254740992']);
});
