require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('class-validator');
const { plainToInstance } = require('class-transformer');
const { ConfigService } = require('@nestjs/config');
const { DatabaseService } = require('../dist/database/database.service');
const { createManualFraudReview, ManualFraudReviewDto } = require('../dist/http/manual-fraud-review');
const { AdminController } = require('../dist/http/admin.controller');

test('manual alerts require admin and validated code/reason; risk policy cannot be supplied', async () => {
  assert.deepEqual(Reflect.getMetadata('roles', AdminController.prototype.createReview), ['admin']);
  for (const role of ['employee', 'customer'])
    await assert.rejects(() => createManualFraudReview({ transaction: () => assert.fail('No DB access') }, { role, userId: 1 }, {}), error => error.getStatus() === 403);
  for (const value of [{ transactionCode: ' ', reason: 'x' }, { transactionCode: 'x', reason: ' ' }, { transactionCode: 'x'.repeat(41), reason: 'x' }, { transactionCode: 'x', reason: 'x'.repeat(256) }, { transactionCode: 'x', reason: 'x', decision: 'REVIEW' }])
    assert.ok((await validate(plainToInstance(ManualFraudReviewDto, value), { whitelist: true, forbidNonWhitelisted: true })).length);
  const dto = plainToInstance(ManualFraudReviewDto, { transactionCode: ' TX-1 ', reason: ' Check ' });
  assert.deepEqual(await validate(dto), []);
  assert.equal(dto.transactionCode, 'TX-1');
  assert.equal(dto.reason, 'Check');
});

test('a completed transaction cannot be reopened even when its prior risk decision was REVIEW', async () => {
  const db = { transaction: async (_context, work) => work({ query: async (sql) => {
    if (sql.startsWith('SELECT transactionid')) return { rows: [{ transactionid: '1', status: 'Success' }] };
    if (sql.startsWith('SELECT reviewcaseid')) return { rows: [] };
    if (sql.startsWith('SELECT decision')) return { rows: [{ decision: 'REVIEW' }] };
    assert.fail('Completed transactions must not be mutated');
  } }) };
  await assert.rejects(() => createManualFraudReview(db, { role: 'admin', userId: 1 }, { transactionCode: 'DONE', reason: 'Check' }), error => error.getStatus() === 400);
});

test('manual alert creation is atomic, concurrent retries reuse the case and financial state is untouched', {
  skip: !process.env.CUSTOMER_SELF_SERVICE_TEST_DB,
}, async () => {
  const name = process.env.CUSTOMER_SELF_SERVICE_TEST_DB;
  assert.match(name, /^d4_selfservice_[0-9]+$/);
  const db = new DatabaseService(new ConfigService({ ...process.env, POSTGRES_DB: name }));
  try {
    const role = (await db.pool.query("INSERT INTO banking.role(rolename) VALUES('Manual alert test') RETURNING roleid")).rows[0].roleid;
    const branch = (await db.pool.query("INSERT INTO banking.branch(branchcode,branchname,address,city,opendate) VALUES('MANUAL','Test','Test','Test',CURRENT_DATE) RETURNING branchid")).rows[0].branchid;
    const employee = (await db.pool.query("INSERT INTO banking.employee(employeecode,branchid,roleid,fullname,phone,email,hiredate,salary) VALUES('MANUAL',$1,$2,'Test','0900000000','manual@example.invalid',CURRENT_DATE,0) RETURNING employeeid", [branch, role])).rows[0].employeeid;
    const userId = Number((await db.pool.query("INSERT INTO banking.\"system_user\"(employeeid,username,passwordhash) VALUES($1,'manual','unused') RETURNING userid", [employee])).rows[0].userid);
    const user = { role: 'admin', userId };
    const type = (await db.pool.query("INSERT INTO banking.transaction_type(typecode,typename) VALUES('DEPOSIT','Manual alert test') RETURNING transactiontypeid")).rows[0].transactiontypeid;
    const model = (await db.pool.query("INSERT INTO banking.model_version(modelname,modeltype,status) VALUES('Test','Test','ACTIVE') RETURNING modelversionid")).rows[0].modelversionid;
    const seed = async (code, status, decision) => {
      const id = (await db.pool.query("INSERT INTO banking.bank_transaction(transactioncode,transactiontypeid,channel,amount,status) VALUES($1,$2,'System',1,$3) RETURNING transactionid", [code, type, status])).rows[0].transactionid;
      if (decision) await db.pool.query('INSERT INTO banking.risk_assessment(transactionid,modelversionid,rulescore,risklevel,modelprobability,decision) VALUES($1,$2,60,\'HIGH\',0.6,$3)', [id, model, decision]);
      return id;
    };
    await seed('MANUAL-OK', 'Pending', 'REVIEW');
    const calls = await Promise.all(Array.from({ length: 8 }, () => createManualFraudReview(db, user, { transactionCode: 'MANUAL-OK', reason: 'Verify documents' })));
    assert.equal(new Set(calls.map(row => row.reviewId)).size, 1);
    assert.equal(calls.filter(row => !row.reused).length, 1);
    assert.equal((await db.pool.query('SELECT count(*)::int n FROM banking.review_case')).rows[0].n, 1);
    assert.equal((await db.pool.query("SELECT count(*)::int n FROM banking.audit_log WHERE entitytype='REVIEW_CASE'")).rows[0].n, 1);
    const reviewId = calls[0].reviewId;
    await db.pool.query("UPDATE banking.review_case SET status='CLOSED',reviewedat=CURRENT_TIMESTAMP WHERE reviewcaseid=$1", [reviewId]);
    const replay = await createManualFraudReview(db, user, { transactionCode: 'MANUAL-OK', reason: 'Do not overwrite' });
    assert.equal(replay.status, 'CLOSED');
    assert.equal((await db.pool.query('SELECT reason FROM banking.review_case WHERE reviewcaseid=$1', [reviewId])).rows[0].reason, 'Verify documents');
    for (const [status, decision] of [['Failed', 'REVIEW'], ['Cancelled', 'BLOCK'], ['Pending', 'ALLOW'], ['Pending', null]]) {
      const code = `MANUAL-${status}-${decision}`;
      await seed(code, status, decision);
      await assert.rejects(() => createManualFraudReview(db, user, { transactionCode: code, reason: 'Check' }), error => error.getStatus() === 400);
    }
    await assert.rejects(() => createManualFraudReview(db, user, { transactionCode: 'MISSING', reason: 'Check' }), error => error.getStatus() === 404);
    const rollbackId = await seed('MANUAL-ROLLBACK', 'Pending', 'REVIEW');
    await assert.rejects(() => createManualFraudReview(db, { role: 'admin', userId: 2147483647 }, { transactionCode: 'MANUAL-ROLLBACK', reason: 'Check' }));
    assert.equal((await db.pool.query('SELECT count(*)::int n FROM banking.review_case WHERE transactionid=$1', [rollbackId])).rows[0].n, 0);
    assert.equal((await db.pool.query('SELECT count(*)::int n FROM banking.transaction_posting')).rows[0].n, 0);
    assert.equal((await db.pool.query('SELECT count(*)::int n FROM banking.event_outbox')).rows[0].n, 0);
    assert.equal((await db.pool.query("SELECT status FROM banking.bank_transaction WHERE transactioncode='MANUAL-OK'")).rows[0].status, 'Pending');
  } finally { await db.onModuleDestroy(); }
});
