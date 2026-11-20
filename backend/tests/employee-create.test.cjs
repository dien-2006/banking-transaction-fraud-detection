require('reflect-metadata');
const test=require('node:test');
const assert=require('node:assert/strict');
const {plainToInstance}=require('class-transformer');
const {validate}=require('class-validator');
const {EmployeeCreateDto}=require('../dist/http/management.dto');
const {ManagementController}=require('../dist/http/management.controller');
const {DatabaseExceptionFilter}=require('../dist/http/database-exception.filter');
const input={branchId:1,roleId:1,name:'Nhân viên mới',phone:'0901234567',email:'employee@example.invalid',hireDate:'2026-11-20',salary:'0'};

test('admin creates only an employee profile with an automatic code and nullable personal details',async()=>{
 const dto=plainToInstance(EmployeeCreateDto,{...input,name:' Nhân viên mới ',email:' EMPLOYEE@EXAMPLE.INVALID ',code:' ',gender:'',birthDate:null});
 assert.deepEqual(await validate(dto),[]);
 let call;
 const controller=new ManagementController({function:async(...args)=>{call=args;return{};}});
 await controller.createEmployee(dto,{userId:7,role:'admin'},{ip:'127.0.0.1'});
 assert.deepEqual(call,['banking_api.create_employee',[null,1,1,input.name,null,null,input.phone,input.email,input.hireDate,'0'],{userId:7,ipAddress:'127.0.0.1'}]);
 assert.deepEqual(Reflect.getMetadata('roles',ManagementController.prototype.createEmployee),['admin']);
});

test('employee required fields, dates and salary obey the existing PostgreSQL contract',async()=>{
 for(const field of ['branchId','roleId','name','phone','email','hireDate','salary']){
  for(const value of [undefined,null,''])assert.ok((await validate(plainToInstance(EmployeeCreateDto,{...input,[field]:value}))).some(e=>e.property===field),field);
 }
 for(const [field,value]of Object.entries({branchId:-1,roleId:1.5,name:' ',phone:'abc',email:'bad',gender:'Invalid',birthDate:'2026-02-30',hireDate:'2026-02-30',salary:'-1'})){
  assert.ok((await validate(plainToInstance(EmployeeCreateDto,{...input,[field]:value}))).some(e=>e.property===field),field);
 }
 for(const salary of ['1.001','1e3','100000000000000000','Infinity','-0',' 10 '])assert.ok((await validate(plainToInstance(EmployeeCreateDto,{...input,salary}))).length,salary);
 for(const patch of [{name:'x'.repeat(151)},{code:'x'.repeat(21)},{email:'x'.repeat(151)},{phone:'0'.repeat(21)},{birthDate:'2999-01-01'},{hireDate:'2026-11-20T00:00:00Z'},{birthDate:'2000-01-01',hireDate:'1999-12-31'}])assert.ok((await validate(plainToInstance(EmployeeCreateDto,{...input,...patch}))).length);
 assert.deepEqual(await validate(plainToInstance(EmployeeCreateDto,{...input,birthDate:'2000-02-29',gender:'Unknown',salary:'99999999999999999.99',phone:'+84 901 234 567'})),[]);
 assert.ok((await validate(plainToInstance(EmployeeCreateDto,{...input,employeeid:99,password:'not-allowed'}),{whitelist:true,forbidNonWhitelisted:true})).length);
});

test('employee uniqueness/reference errors identify the correct field without leaking SQL details',()=>{
 for(const [error,expectedStatus,field] of [
  [{code:'23505',constraint:'employee_phone_key'},409,'phone'],
  [{code:'23505',constraint:'employee_email_key'},409,'email'],
  [{code:'23505',constraint:'employee_employeecode_key'},409,'code'],
  [{code:'23503',constraint:'fk_employee_role'},409,'roleId'],
  [{code:'23503',constraint:'fk_employee_branch'},409,'branchId'],
  [{code:'23502',table:'employee',column:'employeecode'},503,undefined],
 ]){
  let status,body;const response={status(s){status=s;return this;},json(v){body=v;}};
  new DatabaseExceptionFilter().catch(Object.assign(new Error('PRIVATE-SQL-DATA'),error),{switchToHttp:()=>({getResponse:()=>response})});
  assert.equal(status,expectedStatus);assert.equal(body.field,field);assert.ok(!JSON.stringify(body).includes('PRIVATE-SQL-DATA'));
  if(status===503)assert.equal(body.code,'CONFIGURATION');
 }
});

test('PostgreSQL safely allocates employee IDs, validates active references and rolls back conflicts without creating a login',{
 skip:!process.env.EMPLOYEE_CODE_TEST_URL,
},async()=>{
 const {Pool}=require('pg'),{readFileSync}=require('node:fs'),path=require('node:path');
 const url=new URL(process.env.EMPLOYEE_CODE_TEST_URL);assert.match(url.pathname,/^\/d4_employee_test_[a-z0-9_]+$/);
 const pool=new Pool({connectionString:url.toString(),max:12});let serial=0;
 try{
  const columns=async()=>(await pool.query("SELECT table_name,column_name,data_type,is_nullable,is_identity FROM information_schema.columns WHERE table_schema='banking' ORDER BY table_name,ordinal_position")).rows;
  const before=await columns();assert.ok(before.length>0);
  const source=readFileSync(path.join(__dirname,'../../sql/z_05_management_operations.sql'),'utf8');
  const definition=source.match(/CREATE OR REPLACE FUNCTION banking_api\.create_employee[\s\S]*?\$\$;/)?.[0];assert.ok(definition);await pool.query(definition);
  const create=async(patch={})=>{const n=++serial;const args=[patch.code??null,patch.branchId??1,patch.roleId??1,' Test employee ',null,null,patch.phone??`0900${String(n).padStart(6,'0')}`,patch.email??`employee-${n}@example.invalid`,'2026-11-20',patch.salary??'0'];return(await pool.query('SELECT banking_api.create_employee($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS result',args)).rows[0].result;};
  const first=await create({email:' Mixed.Case@Example.Invalid '});
  assert.equal(first.employeecode,'EMP'+String(first.employeeid).padStart(4,'0'));
  assert.equal(first.fullname,'Test employee');assert.equal(first.gender,null);assert.equal(first.dateofbirth,null);assert.equal(first.email,'mixed.case@example.invalid');assert.equal(first.branchname,'Test branch');assert.equal(first.rolename,'Test role');
  const concurrent=await Promise.all(Array.from({length:12},()=>create()));
  assert.equal(new Set(concurrent.map(r=>r.employeeid)).size,12);assert.equal(new Set(concurrent.map(r=>r.employeecode)).size,12);
  const occupiedId=Math.max(...concurrent.map(r=>r.employeeid))+2;
  await create({code:'EMP'+String(occupiedId).padStart(4,'0')});
  const after=await create();assert.equal(after.employeeid,occupiedId+1);
  await pool.query("INSERT INTO banking.employee(employeeid,employeecode,branchid,roleid,fullname,phone,email,hiredate,salary) VALUES($1,'LEGACY-EMP',1,1,'Imported','0999999999','imported@example.invalid',CURRENT_DATE,0)",[after.employeeid+1]);
  assert.equal((await create()).employeeid,after.employeeid+2);
  const count=async()=>(await pool.query('SELECT count(*)::int AS n FROM banking.employee')).rows[0].n;
  const total=await count();
  for(const patch of [{branchId:2},{roleId:2},{branchId:999},{roleId:999}])await assert.rejects(()=>create(patch),/VALIDATION/);
  await assert.rejects(()=>create({phone:first.phone}),e=>e.code==='23505');
  await assert.rejects(()=>create({email:'MIXED.CASE@EXAMPLE.INVALID'}),/CONFLICT/);
  await assert.rejects(()=>create({salary:'-1'}),e=>e.constraint==='ck_employee_salary');
  assert.equal(await count(),total);
  const same=await Promise.allSettled([create({email:'concurrent@example.invalid'}),create({email:'CONCURRENT@EXAMPLE.INVALID'})]);
  assert.equal(same.filter(r=>r.status==='fulfilled').length,1);assert.equal(await count(),total+1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM banking.system_user')).rows[0].n,0);
  assert.deepEqual(await columns(),before);
 }finally{await pool.end();}
});
