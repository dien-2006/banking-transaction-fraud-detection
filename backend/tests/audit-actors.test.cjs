const test=require('node:test'),assert=require('node:assert/strict');
const {attachAuditActors}=require('../dist/database/audit-actors');
const {DatabaseService}=require('../dist/database/database.service');
test('audit actor enrichment is read-only, page-scoped, preserves missing attribution and normalizes source time',async()=>{
 const page={items:[{auditid:'100',userid:2,createdat:'2026-11-20 23:30:00',oldvalue:{balance:'100'},newvalue:{balance:'200'}},{auditid:'101',userid:null,createdat:'2026-11-20 12:00:00'}],total:2};
 const original=JSON.stringify(page.items[0].oldvalue);let count=0;
 await attachAuditActors({query:async(sql,args)=>{
  count++;assert.match(sql,/^SELECT /);assert.match(sql,/WHERE a.auditid=ANY\(\$1::bigint\[\]\)/);
  assert.deepEqual(args,[['100','101'],'Asia/Ho_Chi_Minh']);
  return {rows:[{auditid:'100',actor_name:'Nguyễn An',actor_code:'EMP002',occurred_at:new Date('2026-11-20T16:30:00Z')},
   {auditid:'101',actor_name:'Must not assign',actor_code:'Must not assign',occurred_at:new Date('2026-11-20T05:00:00Z')},
   {auditid:'999',actor_name:'Not on this page'}]};
 }},page,'Asia/Ho_Chi_Minh');
 assert.equal(count,1);assert.equal(page.items.length,2);assert.equal(page.items[0].actor_name,'Nguyễn An');
 assert.equal(page.items[0].createdat,'2026-11-20T16:30:00.000Z');assert.equal(JSON.stringify(page.items[0].oldvalue),original);
 assert.equal(page.items[1].userid,null);assert.equal(page.items[1].actor_name,null);assert.equal(page.items[1].actor_type,'UNRECORDED');
 await attachAuditActors({query:()=>assert.fail('Empty pages must not query all actors')},{items:[]},'Asia/Ho_Chi_Minh');
});
test('audit list keeps the existing DB filters, then enriches only returned rows',async()=>{
 const args=[2,'UPDATE','2026-11-20','2026-11-21',1,20],calls=[];
 const page={items:[{auditid:9,userid:2,newvalue:{modelprobability:0,reasonjson:{model_evaluated:false}}}],total:1,page:1,pageSize:20};
 const client={query:async(sql,values)=>{calls.push([sql,values]);return sql.includes('banking_api.list_audit_logs')?{rows:[{result:page}]}:{rows:[{auditid:9,actor_name:'Nguyễn An'}]};}};
 const fake={sourceTimezone:'Asia/Ho_Chi_Minh',transaction:async(_context,work)=>work(client)};
 const result=await DatabaseService.prototype.function.call(fake,'banking_api.list_audit_logs',args);
 assert.deepEqual(calls[0][1],args);assert.equal(result.items[0].actor_name,'Nguyễn An');assert.equal(result.items[0].userid,2);
 assert.equal(result.items[0].newvalue.modelprobability,0);assert.equal('modelEvaluated' in result.items[0].newvalue,false);
});
