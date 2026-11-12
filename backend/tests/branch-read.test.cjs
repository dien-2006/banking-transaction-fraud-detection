const test = require('node:test');
const assert = require('node:assert/strict');
const { staffReadBranch } = require('../dist/security/branch-access');
const { AdminController } = require('../dist/http/admin.controller');
const { TransactionController } = require('../dist/http/transaction.controller');

const admin = { role: 'admin', userId: 1, employeeId: 2, branchId: 3 };
const employee = { ...admin, role: 'employee' };

test('admin defaults to all branches; employees cannot override authenticated scope', () => {
  assert.equal(staffReadBranch(admin), null);
  assert.equal(staffReadBranch({ ...admin, branchId: undefined }), null);
  assert.equal(staffReadBranch(admin, '9'), 9);
  for (const value of [undefined, '9', 'invalid', '-1']) assert.equal(staffReadBranch(employee, value), 3);
  for (const value of ['invalid', '0', '-1', '1.5', 'Infinity']) assert.throws(() => staffReadBranch(admin, value));
  assert.throws(() => staffReadBranch({ role: 'customer' }));
  assert.throws(() => staffReadBranch({ ...employee, branchId: undefined }));
});

test('all operational read APIs use global admin scope and fixed employee scope', async () => {
  let call;
  const db = { function: async (name, args) => { call = { name, args }; return {}; },
    adminOverview: async branch => { call = { branch }; return {}; } };
  const controller = new AdminController(db), transactions = new TransactionController(db, {}, {});
  for (const [method, branchIndex] of [['customers', 4], ['accounts', 4], ['cards', 5], ['loans', 2], ['employees', 2]]) {
    await controller[method](admin, {});
    assert.equal(call.args[branchIndex], null, method + ' global admin');
    await controller[method](admin, { branchId: '9' });
    assert.equal(call.args[branchIndex], 9, method + ' admin filter');
    if (method !== 'employees') {
      await controller[method](employee, { branchId: '9' });
      assert.equal(call.args[branchIndex], 3, method + ' employee');
      assert.throws(() => controller[method]({ role: 'customer' }, {}));
    }
  }
  await controller.reviews(admin);
  assert.equal(call.args[3], null);
  await controller.reviews(admin, undefined, '1', '20', '9');
  assert.equal(call.args[3], 9);
  await controller.reviews(employee, undefined, '1', '20', '9');
  assert.equal(call.args[3], 3);
  await controller.dashboard(admin);
  assert.equal(call.branch, undefined);
  await controller.dashboard(employee, { branchId: '9' });
  assert.equal(call.branch, 3);
  await transactions.list(admin, {});
  assert.equal(call.args[8], null);
  await transactions.list(employee, { branchId: '9' });
  assert.equal(call.args[8], 3);
  await transactions.list({ role: 'customer', customerId: 42 }, { branchId: '9', customerId: '99' });
  assert.equal(call.args[0], 42);
  await transactions.detail(admin, 7);
  assert.equal(call.args[2], null);
  await transactions.detail(employee, 7);
  assert.equal(call.args[2], 3);
});
