const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpException } = require('@nestjs/common');
const { DatabaseExceptionFilter } = require('../dist/http/database-exception.filter');

function responseFor(error) {
  let status, body;
  const response = { status(value) { status = value; return this; }, json(value) { body = value; } };
  new DatabaseExceptionFilter().catch(error, { switchToHttp: () => ({ getResponse: () => response }) });
  return { status, body };
}

test('immutable financial history is a readable 409 conflict, not a server failure', () => {
  const result = responseFor(Object.assign(new Error('IMMUTABLE:a successful transaction must be reversed, not modified'), { code: 'P0001' }));
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'IMMUTABLE');
  assert.match(result.body.message, /Giao dịch đã hoàn tất/);
});

test('review conflicts, constraint errors and unknown failures retain their distinct responses', () => {
  const conflict = responseFor(Object.assign(new Error('CONFLICT:review requires a Pending transaction'), { code: 'P0001' }));
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, 'CONFLICT');
  assert.equal(responseFor(Object.assign(new Error('duplicate key'), { code: '23505' })).status, 409);
  const unknown = responseFor(new Error('private infrastructure details'));
  assert.equal(unknown.status, 500);
  assert.equal(unknown.body.message, 'Internal server error');
  const forbidden = responseFor(new HttpException('forbidden', 403));
  assert.equal(forbidden.status, 403);
});

test('customer/account conflicts identify the field without exposing SQL values', () => {
  for (const [constraint, pgCode, code, field, text] of [
    ['customer_nationalid_key','23505','CUSTOMER_IDENTITY_EXISTS','nationalId',/giấy tờ định danh/],
    ['bank_account_accountnumber_key','23505','ACCOUNT_NUMBER_EXISTS','accountNumber',/Số tài khoản đã tồn tại/],
    ['fk_holder_customer','23503','CUSTOMER_NOT_FOUND','customerId',/Khách hàng đã chọn/],
    ['fk_bank_account_branch','23503','BRANCH_NOT_FOUND','branchId',/Chi nhánh/],
    ['fk_bank_account_type','23503','ACCOUNT_TYPE_NOT_FOUND','accountTypeId',/Loại tài khoản/],
  ]) {
    const result = responseFor(Object.assign(new Error('SQL detail with PRIVATE-DATA'), { code: pgCode, constraint }));
    assert.equal(result.status, 409);
    assert.equal(result.body.code, code);
    assert.equal(result.body.field, field);
    assert.match(result.body.message, text);
    assert.ok(!JSON.stringify(result.body).includes('PRIVATE-DATA'));
  }
});
