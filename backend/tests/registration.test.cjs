require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { randomUUID } = require('node:crypto');
const { RegistrationService } = require('../dist/http/registration.service');
const { RegistrationController } = require('../dist/http/registration.controller');
const { RegistrationDto } = require('../dist/http/registration.dto');
const { DatabaseService } = require('../dist/database/database.service');

const input = () => ({ name: 'Người đăng ký', phone: '0912345678', email: 'new@example.invalid',
  username: 'new.customer', password: 'test-only-password', acceptedTerms: true, code: '123456', challengeId: randomUUID() });
function harness() {
  const entries = new Map(), calls = [], state = { customers: [], logins: [], markers: {} };
  let verified = 'ok', rejectLogin = false, audited = true;
  const redis = { assertReady() {}, client: {
    async set(key, value, options) { if (options.NX && entries.has(key)) return null; entries.set(key, value); return 'OK'; },
    async ttl() { return 60; },
    async del(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) entries.delete(key); },
    async eval(_lua, args) { calls.push(['OTP', args]); return verified; },
  } };
  const client = { async query(sql, args) {
    calls.push([sql, args]);
    if (sql.includes('SELECT newvalue')) return { rows: state.markers[args[0]] ? [{ newvalue: state.markers[args[0]] }] : [] };
    if (sql.includes('SELECT 1 FROM banking.customer WHERE')) return { rows: state.customers.filter(c => c.email === args[0]) };
    if (sql.includes('SELECT banking_api.create_customer')) {
      const customer = { customerid: String(state.customers.length + 1), customercode: 'C0000001', fullname: args[0], phone: args[1], email: args[2] };
      state.customers.push(customer); return { rows: [{ result: customer }] };
    }
    if (sql.includes("entitytype='CUSTOMER'")) return { rows: audited ? [{}] : [] };
    if (sql.includes('SELECT banking_api.register_customer_online_account')) {
      if (rejectLogin) throw new Error('CONFLICT:Tên đăng nhập đã được sử dụng');
      state.logins.push({ customerId: args[0], username: args[1], testPassword: args[2] });
    }
    if (sql.includes('SELECT banking_api.verify_password')) return { rows: [{ valid: state.logins.some(l => l.customerId === args[1] && l.testPassword === args[0]) }] };
    if (sql.startsWith('INSERT INTO banking.audit_log')) state.markers[args[0]] = JSON.parse(args[1]);
    return { rows: [] };
  }, release() {} };
  const db = { pool: { connect: async () => client },
    ensureCryptoCompatibility: async () => {}, setContext: async () => {},
    async transaction(ctx, work) {
      const snapshot = structuredClone(state);
      try { return await DatabaseService.prototype.transaction.call(this, ctx, work); }
      catch (error) { Object.assign(state, snapshot); throw error; }
    },
  };
  const service = new RegistrationService(db, redis, { async check() {} }, {
    getOrThrow: () => 'test-only-otp-secret', get: key => ({ BREVO_API_KEY: 'test-only-key', OTP_SENDER_EMAIL: 'sender@example.invalid' })[key],
  });
  return { service, entries, calls, state, reject: () => { rejectLogin = true; },
    noAudit: () => { audited = false; }, invalid: value => { verified = value; } };
}

test('registration endpoints are public but DTO forbids supplied identities and roles', async () => {
  assert.equal(Reflect.getMetadata('public', RegistrationController), true);
  const dto = plainToInstance(RegistrationDto, { ...input(), email: ' NEW@EXAMPLE.INVALID ', username: ' New.Customer ' });
  assert.equal((await validate(dto)).length, 0);
  assert.equal(dto.email, 'new@example.invalid'); assert.equal(dto.username, 'new.customer');
  for (const patch of [{ customerId: 1 }, { role: 'admin' }, { code: '12' }, { acceptedTerms: false },
    { email: 'bad' }, { password: '1234567' }, { password: 'ế'.repeat(30) }, { name: '  ' }, { phone: 'abc' }]) {
    const errors = await validate(plainToInstance(RegistrationDto, { ...input(), ...patch }), { whitelist: true, forbidNonWhitelisted: true });
    assert.ok(errors.length, JSON.stringify(patch));
  }
});

test('registration email stores only a hashed, purpose-separated OTP and honors resend delay', async () => {
  const h = harness(), previous = global.fetch;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.subject, 'Mã xác nhận đăng ký D4 Bank');
    assert.match(body.textContent, /\d{6}/);
    return new Response(JSON.stringify({ messageId: 'test-only-message' }), { status: 201 });
  };
  try {
    const response = await h.service.requestEmail('new@example.invalid', '127.0.0.1');
    assert.equal(response.resendAfter, 60); assert.equal(response.expiresIn, 300);
    const saved = JSON.parse(h.entries.get(`registration:challenge:${response.challengeId}`));
    assert.equal(saved.codeHash.length, 64); assert.equal(saved.code, undefined);
    assert.ok([...h.entries.keys()].every(k => k.startsWith('registration:')));
    await assert.rejects(() => h.service.requestEmail('new@example.invalid', '127.0.0.1'), e => e.getStatus() === 429);
  } finally { global.fetch = previous; }
});

test('provider failure removes the unissued OTP and its resend lock', async () => {
  const h = harness(), previous = global.fetch;
  global.fetch = async () => new Response('{}', { status: 403 });
  try {
    await assert.rejects(() => h.service.requestEmail('new@example.invalid', '127.0.0.1'), e => e.getStatus() === 503);
    assert.equal(h.entries.size, 0);
  } finally { global.fetch = previous; }
});

test('a malformed successful provider response cannot advance registration to OTP entry', async () => {
  const h = harness(), previous = global.fetch;
  global.fetch = async () => new Response('{}', { status: 201 });
  try {
    await assert.rejects(() => h.service.requestEmail('new@example.invalid', '127.0.0.1'), e => e.getStatus() === 503);
    assert.equal(h.entries.size, 0);
  } finally { global.fetch = previous; }
});

test('invalid, expired or locked registration OTP cannot open a DB transaction', async () => {
  for (const status of ['invalid', 'expired', 'locked']) {
    const h = harness(); h.invalid(status);
    await assert.rejects(() => h.service.register(input(), '127.0.0.1'), e => e.getStatus() === 403);
    assert.equal(h.calls.filter(([s]) => s !== 'OTP').length, 0);
  }
});

test('registration atomically creates a new profile and login; lost-response retries reuse that result', async () => {
  const h = harness(), dto = input();
  const first = await h.service.register(dto, '127.0.0.1');
  const replay = await h.service.register(dto, '127.0.0.1');
  assert.deepEqual(first, replay);
  assert.equal(h.state.customers.length, 1); assert.equal(h.state.logins.length, 1);
  const marker = JSON.stringify(h.state.markers);
  assert.ok(!marker.includes(dto.password));
  assert.deepEqual(Object.keys(h.state.markers[dto.challengeId]).sort(), ['context', 'result']);
  assert.ok(!marker.includes(dto.email)); assert.ok(!marker.includes(dto.phone));
  assert.ok(!/"(?:password|passwordhash|codeHash|otp|challengeId)"/.test(marker));
  assert.ok(h.calls.some(([sql]) => sql.includes("pg_advisory_xact_lock(hashtextextended('registration:'")));
  assert.ok(h.calls.some(([sql]) => sql === 'COMMIT'));
  assert.ok(!h.calls.some(([sql]) => /INSERT INTO banking\.(bank_account|account_holder|transaction_posting)/.test(sql)));
  await assert.rejects(() => h.service.register({ ...dto, name: 'Changed profile' }, '127.0.0.1'), e => e.getStatus() === 409);
  await assert.rejects(() => h.service.register({ ...dto, password: 'changed-password' }, '127.0.0.1'), e => e.getStatus() === 409);
});

test('login conflict or missing audit trigger rolls back the new customer as well', async () => {
  for (const failure of ['login', 'audit']) {
    const h = harness(); failure === 'login' ? h.reject() : h.noAudit();
    await assert.rejects(() => h.service.register(input(), '127.0.0.1'));
    assert.equal(h.state.customers.length, 0); assert.equal(h.state.logins.length, 0);
    assert.equal(Object.keys(h.state.markers).length, 0);
    assert.ok(h.calls.some(([sql]) => sql === 'ROLLBACK'));
    assert.ok(!h.calls.some(([sql]) => sql === 'COMMIT'));
  }
});

test('verified email cannot claim a previously existing customer profile', async () => {
  const h = harness(); h.state.customers.push({ customerid: '999', email: input().email });
  await assert.rejects(() => h.service.register(input(), '127.0.0.1'), e => e.getStatus() === 409);
  assert.equal(h.state.customers.length, 1); assert.equal(h.state.logins.length, 0);
});

test('customer login names remain case-insensitively unique in PostgreSQL', {
  skip: !process.env.CUSTOMER_CODE_TEST_URL,
}, async () => {
  const url = new URL(process.env.CUSTOMER_CODE_TEST_URL);
  assert.match(decodeURIComponent(url.pathname), /^\/d4_/);
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url.toString(), max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { readFileSync } = require('node:fs');
    const source = readFileSync(require('node:path').join(__dirname, '../../sql/z_05_management_operations.sql'), 'utf8');
    const definition = source.match(/CREATE OR REPLACE FUNCTION banking_api\.register_customer_online_account[\s\S]*?\$\$;/)?.[0];
    assert.ok(definition);
    // Function replacement and fixtures are rolled back inside the isolated test DB.
    await client.query(definition);
    const create = async () => (await client.query(`SELECT banking_api.create_customer(NULL,'Registration SQL test',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL) AS result`)).rows[0].result;
    const first = await create(), second = await create();
    const username = `signup_${randomUUID().replaceAll('-', '')}`;
    const registered = await client.query('SELECT banking_api.register_customer_online_account($1,$2,$3) AS result',
      [first.customerid, username.toUpperCase(), 'test-only-password']);
    assert.equal(registered.rows[0].result.username, username);
    assert.equal(registered.rows[0].result.passwordhash, undefined);
    await client.query('SAVEPOINT duplicate_login');
    await assert.rejects(() => client.query('SELECT banking_api.register_customer_online_account($1,$2,$3)',
      [second.customerid, username, 'test-only-password']), /CONFLICT/);
    await client.query('ROLLBACK TO SAVEPOINT duplicate_login');
    assert.equal((await client.query('SELECT count(*)::int AS n FROM banking.customer_online_account WHERE lower(username)=$1', [username])).rows[0].n, 1);
  } finally {
    await client.query('ROLLBACK'); client.release(); await pool.end();
  }
});
