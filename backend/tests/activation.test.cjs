require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { randomUUID, createHmac } = require('node:crypto');
const { RegistrationService } = require('../dist/http/registration.service');
const { ActivationController } = require('../dist/http/registration.controller');
const { ActivationDto, ActivationEmailDto } = require('../dist/http/registration.dto');
const { DatabaseService } = require('../dist/database/database.service');

const secret = 'test-only-activation-secret';
const input = () => ({ customerCode: 'C0000101', email: 'existing@example.invalid', username: 'activated.customer',
  password: 'test-only-password', challengeId: randomUUID(), code: '123456', acceptedTerms: true });
function harness() {
  const calls = [], entries = new Map(), throttles = [];
  const state = { customer: { customerid: '101', customercode: 'C0000101', fullname: 'Existing customer', email: input().email, status: 'Active' },
    login: null, markers: {}, sharedEmail: false };
  let eligible = true, otp = '101', fail = '', queued = Promise.resolve();
  const client = { async query(sql, args) {
    calls.push([sql, args]);
    if (sql.includes('FROM banking.customer WHERE customerid=$1 FOR UPDATE')) return { rows: state.customer && state.customer.customerid === args[0] ? [state.customer] : [] };
    if (sql.includes('SELECT newvalue')) return { rows: state.markers[args[0]] ? [{ newvalue: state.markers[args[0]] }] : [] };
    if (sql.includes('customerid<>$2')) return { rows: state.sharedEmail ? [{}] : [] };
    if (sql.includes('SELECT 1 FROM banking.customer_online_account')) return { rows: state.login ? [state.login] : [] };
    if (sql.includes('SELECT 1 FROM banking.system_user')) return { rows: args[0] === 'admin' ? [{}] : [] };
    if (sql.includes('SELECT banking_api.verify_password')) return { rows: [{ valid: !!state.login && state.login.customerId === args[1] && state.login.username === args[2] && state.login.password === args[0] && state.login.active }] };
    if (sql.includes('SELECT banking_api.register_customer_online_account')) {
      if (fail === 'login') throw Error('CONFLICT:Username already used');
      assert.equal(state.login, null, 'activation cannot overwrite a previous login');
      state.login = { customerId: args[0], username: args[1], password: args[2], active: true };
    }
    if (sql.startsWith('INSERT INTO banking.audit_log')) {
      if (fail === 'audit') throw Error('audit write failed');
      state.markers[args[0]] = JSON.parse(args[1]);
    }
    if (/create_customer|INSERT INTO banking\.(customer|bank_account|account_holder|transaction_posting)/.test(sql)) throw Error('Unexpected profile or financial write');
    return { rows: [] };
  }, release() {} };
  const db = { pool: {
    connect: async () => client,
    async query(sql, args) {
      calls.push([sql, args]);
      return { rows: eligible && state.customer?.status === 'Active' && state.customer.email === args[0]
        && state.customer.customercode === args[1] && !state.login && !state.sharedEmail
        ? [{ customerId: state.customer.customerid, customerCode: state.customer.customercode }] : [] };
    },
  }, ensureCryptoCompatibility: async () => {}, setContext: async () => {},
    transaction(ctx, work) {
      const execute = async () => {
        const snapshot = structuredClone(state);
        try { return await DatabaseService.prototype.transaction.call(this, ctx, work); }
        catch (error) { Object.assign(state, snapshot); throw error; }
      };
      const result = queued.then(execute); queued = result.catch(() => {}); return result;
    },
  };
  const redis = { assertReady() {}, client: {
    async set(key, value, options) { if (options.NX && entries.has(key)) return null; entries.set(key, value); return 'OK'; },
    async ttl() { return 60; },
    async del(keys) { for (const key of keys) entries.delete(key); },
    async eval(lua, args) { calls.push(['OTP', args]); return otp; },
  } };
  const service = new RegistrationService(db, redis, { async check(...args) { throttles.push(args); } }, {
    getOrThrow: () => secret, get: key => ({ BREVO_API_KEY: 'test-only-key', OTP_SENDER_EMAIL: 'sender@example.invalid' })[key],
  });
  return { service, calls, state, entries, throttles, ineligible: () => { eligible = false; }, invalid: value => { otp = value; }, fail: value => { fail = value; } };
}

async function mockEmail(work) {
  const previous = global.fetch, messages = [];
  global.fetch = async (_url, options) => { messages.push(JSON.parse(options.body)); return new Response('{"messageId":"test-activation-message"}', { status: 201 }); };
  try { return await work(messages); } finally { global.fetch = previous; }
}

test('public activation DTO accepts code/email and login credentials, never a client-supplied identity, role or profile', async () => {
  assert.equal(Reflect.getMetadata('public', ActivationController), true);
  const dto = plainToInstance(ActivationDto, { ...input(), customerCode: ' c0000101 ', email: ' EXISTING@EXAMPLE.INVALID ', username: ' New.User ' });
  assert.equal((await validate(dto)).length, 0);
  assert.equal(dto.customerCode, 'C0000101'); assert.equal(dto.email, input().email); assert.equal(dto.username, 'new.user');
  assert.equal((await validate(plainToInstance(ActivationEmailDto, { email: input().email, customerCode: 'C0000101' }))).length, 0);
  for (const patch of [{ customerId: '102' }, { role: 'admin' }, { name: 'Replacement profile' }, { customerCode: '' },
    { email: 'bad' }, { username: 'name with spaces' }, { password: '1234567' }, { password: 'ế'.repeat(30) }, { acceptedTerms: false }]) {
    assert.ok((await validate(plainToInstance(ActivationDto, { ...input(), ...patch }), { whitelist: true, forbidNonWhitelisted: true })).length, JSON.stringify(patch));
  }
});

test('activation sends OTP only to the unique existing profile and binds the hash to that DB identity', async () => {
  await mockEmail(async messages => {
    const h = harness(), dto = input(), response = await h.service.requestActivationEmail(dto, '127.0.0.1');
    assert.equal(messages.length, 1); assert.match(messages[0].subject, /kích hoạt/);
    const code = messages[0].textContent.match(/\b\d{6}\b/)[0];
    const saved = JSON.parse(h.entries.get(`activation:challenge:${response.challengeId}`));
    assert.equal(saved.customerId, '101'); assert.equal(saved.customerCode, dto.customerCode); assert.equal(saved.email, dto.email);
    assert.equal(saved.codeHash, createHmac('sha256', secret).update(`activation:${response.challengeId}:${code}`).digest('hex'));
    assert.equal(saved.code, undefined); assert.ok([...h.entries.keys()].every(k => k.startsWith('activation:')));
    await assert.rejects(() => h.service.requestActivationEmail(dto, '127.0.0.1'), e => e.getStatus() === 429);
    assert.deepEqual(h.throttles[0], ['activation-email-ip', '127.0.0.1', 10, 3600]);
  });
});

test('unknown, shared-email, blocked, already activated and mismatched profiles get the same response without an email or identity leak', async () => {
  await mockEmail(async messages => {
    for (const condition of ['unknown', 'shared', 'blocked', 'activated', 'email', 'code']) {
      const h = harness(), dto = input();
      if (condition === 'unknown') h.ineligible();
      if (condition === 'shared') h.state.sharedEmail = true;
      if (condition === 'blocked') h.state.customer.status = 'Blocked';
      if (condition === 'activated') h.state.login = { active: false };
      if (condition === 'email') dto.email = 'other@example.invalid';
      if (condition === 'code') dto.customerCode = 'C0000102';
      const response = await h.service.requestActivationEmail(dto, '127.0.0.1');
      assert.equal(response.expiresIn, 300); assert.equal(response.resendAfter, 60); assert.equal(response.deliveryStatus, 'ACCEPTED');
      assert.equal(response.customerId, undefined); assert.equal(response.name, undefined);
      assert.equal(h.entries.has(`activation:challenge:${response.challengeId}`), false);
    }
    assert.equal(messages.length, 0);
  });
});

test('activation provider failure removes the unissued OTP and resend lock', async () => {
  const previous = global.fetch;
  global.fetch = async () => new Response('{}', { status: 403 });
  try {
    const h = harness();
    await assert.rejects(() => h.service.requestActivationEmail(input(), '127.0.0.1'), e => e.getStatus() === 503);
    assert.equal(h.entries.size, 0);
  } finally { global.fetch = previous; }
});

test('invalid, expired, locked and registration-purpose OTPs cannot start activation writes', async () => {
  for (const status of ['invalid', 'expired', 'locked', 'ok']) {
    const h = harness(); h.invalid(status);
    await assert.rejects(() => h.service.activate(input(), '127.0.0.1'), e => e.getStatus() === 403);
    assert.equal(h.calls.filter(([sql]) => sql !== 'OTP').length, 0);
    assert.match(h.calls[0][1].keys[0], /^activation:challenge:/);
    assert.equal(h.calls[0][1].arguments[2], 'C0000101');
  }
});

test('activation creates only the login for the existing customer and safely replays an uncertain response', async () => {
  const h = harness(), dto = input(), original = structuredClone(h.state.customer);
  const first = await h.service.activate(dto, '127.0.0.1');
  assert.deepEqual(await h.service.activate(dto, '127.0.0.1'), first);
  assert.equal(first.customerId, original.customerid); assert.deepEqual(h.state.customer, original);
  assert.equal(h.calls.filter(([sql]) => sql.includes('SELECT banking_api.register_customer_online_account')).length, 1);
  const marker = JSON.stringify(h.state.markers);
  assert.ok(!marker.includes(dto.password)); assert.ok(!marker.includes(dto.email));
  assert.ok(h.calls.some(([sql]) => sql === 'COMMIT'));
  await assert.rejects(() => h.service.activate({ ...dto, username: 'other.user' }, '127.0.0.1'), e => e.getStatus() === 409);
  await assert.rejects(() => h.service.activate({ ...dto, password: 'replacement-password' }, '127.0.0.1'), e => e.getStatus() === 409);
  assert.equal(h.state.login.password, dto.password);
});

test('two different verified challenges for one customer cannot create a second login', async () => {
  const h = harness();
  const results = await Promise.allSettled([h.service.activate(input(), '127.0.0.1'), h.service.activate(input(), '127.0.0.1')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected' && r.reason.getStatus() === 409).length, 1);
  assert.equal(h.calls.filter(([sql]) => sql.includes('SELECT banking_api.register_customer_online_account')).length, 1);
});

test('changing profile/email/status after OTP issuance fails closed; old inactive logins are never overwritten', async () => {
  for (const condition of ['email', 'code', 'status', 'missing', 'shared', 'login', 'inactive-login', 'wrong-target']) {
    const h = harness();
    if (condition === 'email') h.state.customer.email = 'changed@example.invalid';
    if (condition === 'code') h.state.customer.customercode = 'C0000102';
    if (condition === 'status') h.state.customer.status = 'Blocked';
    if (condition === 'missing') h.state.customer = null;
    if (condition === 'shared') h.state.sharedEmail = true;
    if (condition.includes('login')) h.state.login = { username: 'existing-login', password: 'unchanged', active: condition === 'login' };
    if (condition === 'wrong-target') h.invalid('102');
    const original = structuredClone(h.state);
    await assert.rejects(() => h.service.activate(input(), '127.0.0.1'), e => [403,409].includes(e.getStatus()));
    assert.deepEqual(h.state, original);
    assert.equal(h.calls.filter(([sql]) => sql.includes('SELECT banking_api.register_customer_online_account')).length, 0);
  }
});

test('username and audit failures roll back login creation and allow a safe retry', async () => {
  for (const failure of ['login', 'audit', 'staff-name']) {
    const h = harness(), dto = input();
    if (failure === 'staff-name') dto.username = 'admin'; else h.fail(failure);
    await assert.rejects(() => h.service.activate(dto, '127.0.0.1'));
    assert.equal(h.state.login, null); assert.equal(Object.keys(h.state.markers).length, 0);
    assert.ok(h.calls.some(([sql]) => sql === 'ROLLBACK'));
    if (failure !== 'staff-name') {
      h.fail(''); await h.service.activate(dto, '127.0.0.1'); assert.equal(h.state.login.customerId, '101');
    }
  }
});

test('real Redis enforces OTP identity, purpose, TTL and five-attempt locking atomically', {
  skip: !process.env.ACTIVATION_REDIS_TEST_URL,
}, async () => {
  const url = new URL(process.env.ACTIVATION_REDIS_TEST_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.notEqual(url.port, '6379'); assert.equal(url.pathname, '/15');
  const { createClient } = require('redis');
  const client = createClient({ url: url.toString() });
  client.on('error', () => {});
  await client.connect();
  const keys = [], messages = [], previous = global.fetch;
  let transactions = 0;
  const wrapped = {
    set: async (key, ...args) => { keys.push(key); return client.set(key, ...args); },
    ttl: key => client.ttl(key), del: entries => client.del(entries),
    eval: (lua, options) => client.eval(lua, options),
  };
  const db = { pool: { query: async () => ({ rows: [{ customerId: '101', customerCode: 'C0000101' }] }) },
    async transaction() { transactions++; return { verified: true }; } };
  const service = new RegistrationService(db, { assertReady() {}, client: wrapped }, { async check() {} }, {
    getOrThrow: () => secret, get: key => ({ BREVO_API_KEY: 'test-only-key', OTP_SENDER_EMAIL: 'sender@example.invalid' })[key],
  });
  global.fetch = async (_url, options) => { messages.push(JSON.parse(options.body)); return new Response('{"messageId":"test-only-redis"}', { status: 201 }); };
  try {
    const request = async () => {
      const dto = { ...input(), email: `activation-${randomUUID()}@example.invalid` };
      const response = await service.requestActivationEmail(dto, '127.0.0.1');
      return { ...dto, challengeId: response.challengeId, code: messages.at(-1).textContent.match(/\b\d{6}\b/)[0] };
    };
    const dto = await request(), key = `activation:challenge:${dto.challengeId}`;
    const before = await client.ttl(key);
    await assert.rejects(() => service.activate({ ...dto, email: 'wrong@example.invalid' }, '127.0.0.1'), e => e.getStatus() === 403);
    await assert.rejects(() => service.activate({ ...dto, customerCode: 'C0000102' }, '127.0.0.1'), e => e.getStatus() === 403);
    assert.equal(JSON.parse(await client.get(key)).attempts, 2);
    assert.ok(await client.ttl(key) > 0 && await client.ttl(key) <= before);
    await assert.rejects(() => service.register(dto, '127.0.0.1'), e => e.getStatus() === 403);
    assert.equal(transactions, 0);
    assert.deepEqual(await service.activate(dto, '127.0.0.1'), { verified: true });
    assert.equal(transactions, 1);
    // OTP may verify on retry; the DB marker/unique constraint governs its one committed effect.
    assert.deepEqual(await service.activate(dto, '127.0.0.1'), { verified: true });
    const bad = await request(), badKey = `activation:challenge:${bad.challengeId}`;
    const wrongCode = bad.code === '000000' ? '999999' : '000000';
    const denied = await Promise.allSettled(Array.from({ length: 8 }, () => service.activate({ ...bad, code: wrongCode }, '127.0.0.1')));
    assert.ok(denied.every(r => r.status === 'rejected' && r.reason.getStatus() === 403));
    assert.equal(await client.get(badKey), null);
    await assert.rejects(() => service.activate(bad, '127.0.0.1'), e => e.getStatus() === 403);
    const registration = await service.requestEmail(`registration-${randomUUID()}@example.invalid`, '127.0.0.1');
    await assert.rejects(() => service.activate({ ...input(), challengeId: registration.challengeId,
      code: messages.at(-1).textContent.match(/\b\d{6}\b/)[0] }, '127.0.0.1'), e => e.getStatus() === 403);
    const expired = await request();
    await client.pExpire(`activation:challenge:${expired.challengeId}`, 1);
    await new Promise(resolve => setTimeout(resolve, 10));
    await assert.rejects(() => service.activate(expired, '127.0.0.1'), e => e.getStatus() === 403);
    assert.equal(transactions, 2);
  } finally {
    global.fetch = previous;
    if (keys.length) await client.del(keys);
    await client.quit();
  }
});
