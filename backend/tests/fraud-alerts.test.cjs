const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseService } = require('../dist/database/database.service');
const { AdminController } = require('../dist/http/admin.controller');

test('fraud listing reads BLOCK alerts without creating reviews or invoking risk', async () => {
  const expected = { items: [{ transactionid: 42, decision: 'BLOCK', reviewcaseid: null }], total: 1 };
  let reads = 0;
  const args = ['__blocked', 2, 20, 3];
  const client = { query: async (sql, values) => {
    reads++;
    assert.deepEqual(values, args);
    assert.match(sql, /LEFT JOIN banking\.review_case/);
    assert.match(sql, /v\.decision IN \('REVIEW','BLOCK'\)/);
    assert.match(sql, /a\.branchid=\$4::integer/);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
    return { rows: [{ result: expected }] };
  } };
  const db = { transaction: async (_context, work) => work(client) };
  assert.deepEqual(await DatabaseService.prototype.function.call(db, 'banking_api.list_fraud_reviews', args), expected);
  assert.equal(reads, 1);
});

test('blocked-alert filter preserves employee branch scope and denies customers', async () => {
  let args;
  const controller = new AdminController({ function: async (_name, values) => { args = values; return {}; } });
  const employee = { role: 'employee', userId: 2, employeeId: 2, branchId: 3 };
  await controller.reviews(employee, '__blocked', '1', '20', '999');
  assert.deepEqual(args, ['__blocked', 1, 20, 3]);
  await controller.reviews({ ...employee, role: 'admin' }, '__blocked');
  assert.deepEqual(args, ['__blocked', 1, 20, null]);
  assert.throws(() => controller.reviews({ role: 'customer', customerId: 1 }, '__blocked'));
});

test('legacy business-authorized cases retain the no-model presentation mask', async () => {
  const client = { query: async () => ({ rows: [{ result: { items: [{
    transactionid: 2, reviewcaseid: 3, decision: 'ALLOW', rulescore: 0,
    risklevel: 'LOW', modelprobability: 0,
    reasonjson: { model_evaluated: false, authorization_mode: 'LOAN_REPAYMENT' },
  }] } }] }) };
  const db = { transaction: async (_context, work) => work(client) };
  const page = await DatabaseService.prototype.function.call(db, 'banking_api.list_fraud_reviews', [null, 1, 20, null]);
  assert.equal(page.items[0].modelEvaluated, false);
  assert.equal(page.items[0].rulescore, null);
  assert.equal(page.items[0].risklevel, null);
  assert.equal(page.items[0].modelprobability, null);
});
