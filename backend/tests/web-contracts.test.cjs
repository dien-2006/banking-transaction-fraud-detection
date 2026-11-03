const assert=require('node:assert/strict');
const test=require('node:test');
const {employeeBranch,assertBranch,assertResourceBranch}=require('../dist/security/branch-access');
const {ManagementController}=require('../dist/http/management.controller');
const {AdminController}=require('../dist/http/admin.controller');
const {TransactionController}=require('../dist/http/transaction.controller');
const {AnalyticsController}=require('../dist/analytics/analytics.controller');
const {AuthGuard}=require('../dist/security/auth.guard');
const {RolesGuard}=require('../dist/security/roles.guard');
const employee={role:'employee',actorType:'employee',userId:1,employeeId:2,branchId:3};
const admin={...employee,role:'admin'};
function database(allowed=true){const calls=[];return {calls,pool:{query:async(sql,args)=>{calls.push({sql,args});return {rows:allowed?[{ok:1}]:[]};}},function:async(name,args)=>{calls.push({name,args});return {};}};}
test('branch scope fails closed for missing IDs and other branches',async()=>{assert.equal(employeeBranch(employee),3);assert.equal(employeeBranch(admin),null);for(const branchId of [null,undefined,0,-1,NaN,1.5])assert.throws(()=>employeeBranch({...employee,branchId}));assert.throws(()=>assertBranch(employee,4));assert.doesNotThrow(()=>assertBranch(employee,3));const db=database(false);for(const resource of ['account','card','loan','customer','transaction'])await assert.rejects(assertResourceBranch(db,employee,resource,100));assert.ok(db.calls.every(call=>call.args[0]===100&&call.args[1]===3));await assertResourceBranch(db,admin,'account',100);});
test('all existing-object staff management writes reject cross-branch before mutation',async()=>{const db=database(false),controller=new ManagementController(db),req={ip:'127.0.0.1'};for(const method of ['updateCustomer','customerStatus','registerCustomer','accountStatus','cardStatus','cardLimit','approveLoan','fraudLabel']){const args=method==='approveLoan'?[7,employee,req]:[7,{},employee,req];await assert.rejects(controller[method](...args));}await assert.rejects(controller.deviceStatus(7,8,{},employee,req));await assert.rejects(controller.issueCard({accountId:7},employee,req));assert.equal(db.calls.some(call=>call.name),false);assert.throws(()=>controller.openAccount({branchId:4},employee,req));assert.throws(()=>controller.createLoan({branchId:4},employee,req));});
test('in-scope staff writes and admin writes preserve the existing business function calls',async()=>{const db=database(),c=new ManagementController(db),req={ip:'127.0.0.1'};await c.cardLimit(9,{limit:'500000'},employee,req);assert.equal(db.calls.at(-1).name,'banking_api.change_card_limit');assert.deepEqual(db.calls.at(-1).args,[9,'500000']);await c.cardStatus(9,{status:'Blocked'},admin,req);assert.equal(db.calls.at(-1).name,'banking_api.change_card_status');});
test('counter movement checks both branches before any financial call',async()=>{const db=database(false),controller=new TransactionController(db,{},{});await assert.rejects(controller.movement(employee,{type:'DEPOSIT',debitAccountId:5,creditAccountId:6}));assert.equal(db.calls.some(call=>call.name),false);});
test('employee reports cannot request global Gold or omit branch identity',async()=>{const analytics=new AnalyticsController({activeRelease:async()=>({schema_name:'gold'}),query:()=>[]});assert.throws(()=>analytics.query(employee));assert.deepEqual(await analytics.query(admin),[]);const reports=new AdminController(database());assert.throws(()=>reports.accounts({...employee,branchId:undefined},{}));});
test('JWT guards validate actor shape and deny missing employee branch',async()=>{let actor=employee;const jwt={verifyAsync:async()=>actor},reflector={getAllAndOverride:()=>false},guard=new AuthGuard(jwt,reflector,{isActorActive:async()=>true}),request={headers:{authorization:'Bearer fake'}},ctx={getHandler:()=>null,getClass:()=>null,switchToHttp:()=>({getRequest:()=>request})};assert.equal(await guard.canActivate(ctx),true);for(const invalid of [{role:'unknown'}, {...employee,branchId:null},{...employee,userId:0},{role:'customer',actorType:'customer',customerId:null}]){actor=invalid;await assert.rejects(guard.canActivate(ctx));}const roles=new RolesGuard({getAllAndOverride:()=>['admin']});request.user=employee;assert.throws(()=>roles.canActivate(ctx));request.user=admin;assert.equal(roles.canActivate(ctx),true);});
test('analytics selects only own allowlisted datasets and clamps numeric limits',async()=>{
 const calls=[],c=new AnalyticsController({activeRelease:async()=>({schema_name:'gold'}),query:async sql=>{calls.push(sql);return [];}});
 for(const dataset of ['__proto__','constructor','toString','transactions; DROP TABLE t'])assert.throws(()=>c.query(admin,dataset));
 await c.query(admin,'transactions','1.5');assert.match(calls.at(-1),/ORDER BY full_date DESC LIMIT 1$/);
 await c.query(admin,'models','999999');assert.match(calls.at(-1),/ORDER BY model_key LIMIT 1000$/);
});
test('Trino pagination preserves columns and converts connection/format errors into service errors',async()=>{
 const {TrinoService}=require('../dist/analytics/trino.service');const original=globalThis.fetch;
 const service=new TrinoService({get:(key,fallback)=>key==='TRINO_URL'?'http://trino.test':fallback});let count=0;
 try{
  globalThis.fetch=async()=>Response.json(++count===1?{columns:[{name:'count'}],nextUri:'http://trino.test/next'}:{data:[[3]]});assert.deepEqual(await service.query('SELECT 3'),[{count:3}]);
  globalThis.fetch=async()=>{throw new Error('offline');};await assert.rejects(service.query('SELECT 3'),error=>error.getStatus()===503);
  globalThis.fetch=async()=>new Response('<html>gateway</html>');await assert.rejects(service.query('SELECT 3'),error=>error.getStatus()===503);
  globalThis.fetch=async()=>Response.json({error:{message:'No Gold data'}});await assert.rejects(service.query('SELECT 3'),error=>error.getStatus()===503);
 }finally{globalThis.fetch=original;}
});
test('analytics filters dates before applying the row cap and rejects invalid/injected ranges',async()=>{
 const calls=[],c=new AnalyticsController({activeRelease:async()=>({schema_name:'gold'}),query:async sql=>{calls.push(sql);return [];}});
 await c.query(admin,'transactions','1000','2026-11-01','2026-11-02');
 assert.match(calls.at(-1),/WHERE full_date >= DATE '2026-11-01' AND full_date <= DATE '2026-11-02' ORDER BY full_date DESC LIMIT 1000$/);
 await c.query(admin,'models','100','2026-11-01','2026-11-02');
 assert.doesNotMatch(calls.at(-1),/WHERE full_date/);
 for(const [from,to] of [['2026-02-30',''],["2026-01-01' OR 1=1",''],['2026-11-02','2026-11-01']]) assert.throws(()=>c.query(admin,'transactions','100',from,to),e=>e.getStatus()===400);
});
test('one dashboard request pins all datasets to the same immutable release',async()=>{
 const schema='gold_r_'+'a'.repeat(20),calls=[];let pointers=0;
 const controller=new AnalyticsController({activeRelease:async()=>{pointers++;return {schema_name:schema,batch_id:'batch-one',published_at:'2026-11-02 10:00:00'}},query:async sql=>{calls.push(sql);return [];}});
 const result=await controller.snapshot(admin,'1000','2026-11-01','2026-11-02');
 assert.equal(pointers,1);assert.equal(calls.length,6);assert.ok(calls.every(sql=>sql.includes('hive.'+schema+'.')));assert.equal(result.release.batch_id,'batch-one');assert.equal(Object.keys(result.datasets).length,6);
 assert.throws(()=>controller.snapshot(employee));
});
