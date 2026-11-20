require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { BranchCreateDto } = require('../dist/http/management.dto');
const { ManagementController } = require('../dist/http/management.controller');
const { DatabaseExceptionFilter } = require('../dist/http/database-exception.filter');
const input = { name: 'Chi nhánh mới', city: 'Hà Nội', address: '12 Đường Kiểm Thử', openDate: '2026-11-20' };

test('branch creation trims required data, auto-allocates code and stores omitted phone as NULL', async () => {
  const dto = plainToInstance(BranchCreateDto, { ...input, name: ' Chi nhánh mới ', code: '', phone: '  ' });
  assert.deepEqual(await validate(dto), []);
  assert.equal(dto.name, input.name); assert.equal(dto.code, undefined); assert.equal(dto.phone, undefined);
  let call;
  const controller = new ManagementController({ function: async (...args) => { call = args; return {}; } });
  await controller.createBranch(dto, { userId: 7, role: 'admin' }, { ip: '127.0.0.1' });
  assert.deepEqual(call, ['banking_api.create_branch', [null,input.name,input.address,input.city,null,input.openDate], { userId: 7, ipAddress: '127.0.0.1' }]);
  assert.deepEqual(Reflect.getMetadata('roles', ManagementController.prototype.createBranch), ['admin']);
});

test('branch data rejects blank required fields, invalid calendar dates and out-of-contract values', async () => {
  for (const field of ['name', 'address', 'city', 'openDate']) {
    for (const value of [undefined, null, '', '   ']) {
      const errors = await validate(plainToInstance(BranchCreateDto, { ...input, [field]: value }));
      assert.ok(errors.some(e => e.property === field), field);
    }
  }
  for (const [field,value] of Object.entries({ name:'x'.repeat(151), address:'x'.repeat(256), city:'x'.repeat(101), phone:'abc', code:'x'.repeat(21), openDate:'2026-02-30' })) {
    assert.ok((await validate(plainToInstance(BranchCreateDto, { ...input, [field]:value }))).some(e => e.property === field), field);
  }
  for (const date of ['2026-11-20T00:00:00Z', '20/11/2026']) {
    assert.ok((await validate(plainToInstance(BranchCreateDto, { ...input, openDate:date }))).length);
  }
  assert.deepEqual(await validate(plainToInstance(BranchCreateDto, { ...input, phone:'+84 24 1234 5678', openDate:'2024-02-29' })), []);
  assert.ok((await validate(plainToInstance(BranchCreateDto, { ...input, branchid:99, status:'Active' }), { whitelist:true, forbidNonWhitelisted:true })).length);
});

test('duplicate branch code and an old DB function produce actionable, redacted errors', () => {
  for (const [error,expectedStatus,expectedCode] of [
    [{ code:'23505',constraint:'branch_branchcode_key' },409,'BRANCH_CODE_EXISTS'],
    [{ code:'23502',table:'branch',column:'branchcode' },503,'CONFIGURATION'],
  ]) {
    let status,body;
    const response = { status(s) {status=s;return this;}, json(value) {body=value;} };
    new DatabaseExceptionFilter().catch(Object.assign(new Error('PRIVATE-SQL-DATA'), error), { switchToHttp:()=>({getResponse:()=>response}) });
    assert.equal(status,expectedStatus); assert.equal(body.code,expectedCode); assert.ok(!JSON.stringify(body).includes('PRIVATE-SQL-DATA'));
  }
});

test('PostgreSQL allocates branch codes atomically and preserves the existing table contract', {
  skip: !process.env.BRANCH_CODE_TEST_URL,
}, async () => {
  const { Pool } = require('pg');
  const { readFileSync } = require('node:fs');
  const path = require('node:path');
  const url = new URL(process.env.BRANCH_CODE_TEST_URL);
  assert.match(url.pathname, /^\/d4_branch_test_[a-z0-9_]+$/);
  const pool = new Pool({ connectionString:url.toString(), max:12 });
  try {
    const columns = async () => (await pool.query("SELECT column_name,data_type,is_nullable,column_default,is_identity FROM information_schema.columns WHERE table_schema='banking' AND table_name='branch' ORDER BY ordinal_position")).rows;
    const before = await columns(); assert.ok(before.length > 0, 'Use a pre-created isolated branch fixture table');
    const source = readFileSync(path.join(__dirname, '../../sql/z_05_management_operations.sql'), 'utf8');
    const definition = source.match(/CREATE OR REPLACE FUNCTION banking_api\.create_branch[\s\S]*?\$\$;/)?.[0]; assert.ok(definition);
    await pool.query(definition);
    const create = async code => (await pool.query("SELECT banking_api.create_branch($1,' Test branch ',' Test address ',' Hà Nội ',NULL,CURRENT_DATE) AS result", [code ?? null])).rows[0].result;
    const first = await create();
    assert.equal(first.branchcode, 'CN'+String(first.branchid).padStart(3,'0'));
    assert.equal(first.phone,null); assert.equal(first.branchname,'Test branch'); assert.equal(first.status,'Active');
    const concurrent = await Promise.all(Array.from({length:12},()=>create()));
    assert.equal(new Set(concurrent.map(r=>r.branchid)).size,12);
    assert.equal(new Set(concurrent.map(r=>r.branchcode)).size,12);
    const occupiedId = Math.max(...concurrent.map(r=>r.branchid))+2;
    await create('CN'+String(occupiedId).padStart(3,'0'));
    const skipped = await create(); assert.equal(skipped.branchid,occupiedId+1);
    const next = skipped.branchid+1;
    await pool.query("INSERT INTO banking.branch(branchid,branchcode,branchname,address,city,opendate) VALUES($1,'LEGACY-IMPORT','Legacy','Address','City',CURRENT_DATE)",[next]);
    assert.equal((await create()).branchid,next+1);
    const count = (await pool.query('SELECT count(*)::int AS n FROM banking.branch')).rows[0].n;
    await assert.rejects(()=>create('LEGACY-IMPORT'),e=>e.code==='23505');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM banking.branch')).rows[0].n,count);
    assert.deepEqual(await columns(),before);
    const last = (await pool.query("SELECT last_value::int AS n FROM banking.branch_branchid_seq")).rows[0].n;
    await pool.query("INSERT INTO banking.branch(branchid,branchcode,branchname,address,city,opendate) SELECT n,'IMPORT-'||n,'Imported','Address','City',CURRENT_DATE FROM generate_series($1::int,$2::int) n",[last+1,last+100]);
    await assert.rejects(()=>create(),/CONFIGURATION/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM banking.branch')).rows[0].n,count+100);
  } finally { await pool.end(); }
});
