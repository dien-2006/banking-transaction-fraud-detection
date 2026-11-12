require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('class-validator');
const { CustomerCreateDto } = require('../dist/http/management.dto');
const { ManagementController } = require('../dist/http/management.controller');
const { Pool } = require('pg');
const { plainToInstance } = require('class-transformer');
const { AccountOpenDto } = require('../dist/http/management.dto');
const { DatabaseService } = require('../dist/database/database.service');
const { ConfigService } = require('@nestjs/config');

const customer = {
  name: 'Test customer', gender: 'Other', birthDate: '1995-01-01',
  nationalId: 'test-id', phone: '0900000000', email: 'test@example.invalid',
  address: 'Test address', occupation: 'Test', customerType: 'Individual', segment: 'Standard',
};

test('customer creation accepts an omitted code and requests automatic allocation', async () => {
  const dto = Object.assign(new CustomerCreateDto(), customer);
  assert.deepEqual(await validate(dto), []);
  let call;
  const controller = new ManagementController({ function: async (...args) => { call = args; return {}; } });
  await controller.createCustomer(dto, { userId: 1 }, { ip: '127.0.0.1' });
  assert.equal(call[0], 'banking_api.create_customer');
  assert.equal(call[1][0], null);
  assert.equal(call[1][1], customer.name);
});

test('only a nonblank name is required; optional empty values become SQL NULL', async () => {
  const dto = plainToInstance(CustomerCreateDto, { name: '  Nguyễn An  ', gender: '', birthDate: '',
    nationalId: '  ', phone: null, email: '', address: '', occupation: '', customerType: '', segment: '' });
  assert.deepEqual(await validate(dto), []);
  let args;
  await new ManagementController({ function: async (_name, values) => { args = values; return {}; } })
    .createCustomer(dto, { userId: 1 }, {});
  assert.equal(args[1], 'Nguyễn An');
  assert.equal(args[0], null);
  assert.deepEqual(args.slice(2), Array(9).fill(null));
  for (const name of [undefined, null, '', '   ']) {
    assert.ok((await validate(plainToInstance(CustomerCreateDto, { name }))).length);
  }
});

test('provided customer details must match format, date and schema length limits', async () => {
  for (const [key, value] of Object.entries({ email: 'wrong-email', phone: 'abcdef',
    birthDate: '2026-02-30', gender: 'Invalid', nationalId: 'x'.repeat(31),
    address: 'x'.repeat(256), occupation: 'x'.repeat(101), customerType: 'x'.repeat(31), segment: 'x'.repeat(31) })) {
    const errors = await validate(plainToInstance(CustomerCreateDto, { name: 'Nguyễn An', [key]: value }));
    assert.ok(errors.some(error => error.property === key), key);
  }
  assert.ok((await validate(plainToInstance(CustomerCreateDto, { name: 'An', birthDate: '2999-01-01' }))).length);
  assert.deepEqual(await validate(plainToInstance(CustomerCreateDto, { name: 'An', gender: 'Unknown',
    birthDate: '2000-02-29', phone: '+84 901 234 567' })), []);
});

test('opening an account requires an existing customer; inline profile creation is rejected', async () => {
  const dto = plainToInstance(AccountOpenDto, { accountNumber: 'test', branchId: 3, accountTypeId: 1,
    category: 'CUSTOMER', newCustomer: { name: 'Not allowed' } });
  assert.ok((await validate(dto, { whitelist: true, forbidNonWhitelisted: true }))
    .some(error => error.property === 'newCustomer'));
  let call;
  const controller = new ManagementController({ function: async (name, args) => { call = {name,args}; return {}; } });
  const actor = { role: 'employee', branchId: 3, userId: 1 };
  const input = { accountNumber: 'test', branchId: 3, accountTypeId: 1, category: 'CUSTOMER' };
  assert.throws(() => controller.openAccount(input, actor, {}), /đã có hồ sơ/);
  for (const role of ['employee', 'admin']) {
    const internal = { ...input, category: 'INTERNAL', customerId: 42 };
    assert.ok((await validate(plainToInstance(AccountOpenDto, internal))).some(error => error.property === 'category'));
    assert.throws(() => controller.openAccount(internal, { ...actor, role }, {}), /Chỉ hỗ trợ mở tài khoản cho khách hàng/);
    assert.throws(() => controller.openAccount({ ...internal, customerId: undefined }, { ...actor, role }, {}), /Chỉ hỗ trợ mở tài khoản cho khách hàng/);
  }
  assert.equal(call, undefined, 'Rejected requests must not reach the database');
  for (const customerId of [undefined, null, 0, -1]) {
    assert.ok((await validate(plainToInstance(AccountOpenDto, { ...input, customerId })))
      .some(error => error.property === 'customerId'));
  }
  await controller.openAccount({ ...input, customerId: 42 }, actor, {});
  assert.equal(call.name, 'banking_api.open_account');
  assert.deepEqual(call.args, ['test', 3, 1, 42, 'CUSTOMER']);
  const automatic = plainToInstance(AccountOpenDto, { branchId: 3, accountTypeId: 1, customerId: 42 });
  assert.deepEqual(await validate(automatic), []);
  await controller.openAccount(automatic, actor, {});
  assert.equal(call.args[0], null);
});

test('opening an account links the existing customer without creating another profile', {
  skip: !process.env.CUSTOMER_CODE_TEST_URL,
}, async () => {
  const url = new URL(process.env.CUSTOMER_CODE_TEST_URL);
  assert.ok(url.pathname.startsWith('/d4_'));
  const db = new DatabaseService(new ConfigService({
    POSTGRES_HOST: url.hostname, POSTGRES_INTERNAL_PORT: Number(url.port),
    POSTGRES_DB: url.pathname.slice(1), POSTGRES_USER: url.username, POSTGRES_PASSWORD: 'isolated-test',
  }));
  try {
    const branch = (await db.pool.query(`INSERT INTO banking.branch(branchcode,branchname,address,city,opendate)
      VALUES('AUTO-TEST','Test','Test','Test',CURRENT_DATE) RETURNING branchid`)).rows[0].branchid;
    const type = (await db.pool.query("INSERT INTO banking.account_type(typename) VALUES('Auto test') RETURNING accounttypeid")).rows[0].accounttypeid;
    const controller = new ManagementController(db);
    const actor = { role: 'employee', branchId: branch, userId: 1 };
    const profile = await controller.createCustomer(plainToInstance(CustomerCreateDto, {name: 'Existing customer'}), actor, {});
    const before = (await db.pool.query('SELECT count(*)::int AS n FROM banking.customer')).rows[0].n;
    const input = { accountNumber: 'AUTO-TEST-ACCOUNT', branchId: branch, accountTypeId: type,
      category: 'CUSTOMER', customerId: profile.customerid };
    const result = await controller.openAccount(input, actor, {});
    assert.equal((await db.pool.query('SELECT customerid FROM banking.account_holder WHERE accountid=$1',
      [result.accountid])).rows[0].customerid, String(profile.customerid));
    await assert.rejects(() => controller.openAccount(input, actor, {}), /duplicate key/);
    const automatic = { branchId: branch, accountTypeId: type, category: 'CUSTOMER', customerId: profile.customerid };
    const generated = await Promise.all(Array.from({ length: 12 }, () => controller.openAccount(automatic, actor, {})));
    assert.equal(new Set(generated.map(row => row.accountnumber)).size, 12);
    for (const row of generated) {
      assert.equal(row.accountnumber, '1' + String(row.accountid).padStart(15, '0'));
      assert.equal(Number(row.balance), 0);
    }
    const occupiedId = Math.max(...generated.map(row => row.accountid)) + 2;
    const occupiedNumber = '1' + String(occupiedId).padStart(15, '0');
    await controller.openAccount({ ...automatic, accountNumber: occupiedNumber }, actor, {});
    const afterCollision = await controller.openAccount(automatic, actor, {});
    assert.notEqual(afterCollision.accountnumber, occupiedNumber);
    assert.equal(afterCollision.accountid, occupiedId + 1);
    assert.throws(() => controller.openAccount({ branchId: branch, accountTypeId: type, category: 'INTERNAL' }, actor, {}), /Chỉ hỗ trợ mở tài khoản cho khách hàng/);
    assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM banking.customer')).rows[0].n, before);
  } finally { await db.onModuleDestroy(); }
});

test('customer codes use the existing identity safely, including concurrent creation', {
  skip: !process.env.CUSTOMER_CODE_TEST_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.CUSTOMER_CODE_TEST_URL });
  try {
    const db = await pool.query('SELECT current_database() AS name');
    assert.match(db.rows[0].name, /^d4_/);
    const create = async (code = null) => {
      const { rows } = await pool.query(`SELECT banking_api.create_customer(
        $1,'Test customer','Other',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL) AS customer`, [code]);
      return rows[0].customer;
    };
    const first = await create();
    const second = await create();
    assert.equal(second.customerid, first.customerid + 1);
    assert.equal(first.customercode, 'C' + String(first.customerid).padStart(7, '0'));
    assert.equal(second.customercode, 'C' + String(second.customerid).padStart(7, '0'));
    const concurrent = await Promise.all(Array.from({ length: 12 }, () => create()));
    assert.equal(new Set(concurrent.map(row => row.customerid)).size, 12);
    assert.equal(new Set(concurrent.map(row => row.customercode)).size, 12);
    // Legacy callers retain their explicit codes, even if they occupy a future auto code.
    const occupiedId = Math.max(...concurrent.map(row => row.customerid)) + 2;
    const occupiedCode = 'C' + String(occupiedId).padStart(7, '0');
    const legacy = await create(occupiedCode);
    assert.equal(legacy.customercode, occupiedCode);
    const afterCollision = await create();
    assert.equal(afterCollision.customerid, occupiedId + 1);
    assert.notEqual(afterCollision.customercode, occupiedCode);
    // Multiple customers may omit the unique identifier; both must store NULL.
    const minimal = new ManagementController({ function: async (_name, args) =>
      (await pool.query('SELECT banking_api.create_customer($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS result', args)).rows[0].result });
    for (let i = 0; i < 2; i++) {
      const row = await minimal.createCustomer(plainToInstance(CustomerCreateDto, { name: 'Minimal ' + i, nationalId: '' }), { userId: 1 }, {});
      for (const key of ['gender','dateofbirth','nationalid','phone','email','address','occupation','customertype','customersegment']) {
        assert.equal(row[key], null, key);
      }
    }
  } finally {
    await pool.end();
  }
});
