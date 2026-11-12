require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { ConfigService } = require('@nestjs/config');
const { DatabaseService } = require('../dist/database/database.service');
const { ManagementController } = require('../dist/http/management.controller');
const { AdminController } = require('../dist/http/admin.controller');
const { assertResourceBranch } = require('../dist/security/branch-access');

test('customer listing forwards the authenticated staff identity to its DB transaction', async () => {
  let context;
  const controller = new AdminController({ function: async (_name, _args, ctx) => { context = ctx; return {}; } });
  await controller.customers({ role: 'employee', branchId: 3, userId: 48 }, {});
  assert.deepEqual(context, { userId: 48 });
});

test('creator sees an unassigned customer, other staff cannot, and branch assignment takes precedence', {
  skip: !process.env.CUSTOMER_CODE_TEST_URL,
}, async () => {
  const url = new URL(process.env.CUSTOMER_CODE_TEST_URL);
  assert.match(url.pathname, /^\/d4_/);
  const db = new DatabaseService(new ConfigService({ POSTGRES_HOST: url.hostname,
    POSTGRES_INTERNAL_PORT: Number(url.port), POSTGRES_DB: url.pathname.slice(1),
    POSTGRES_USER: url.username, POSTGRES_PASSWORD: 'isolated-test' }));
  try {
    const actors = [];
    const role = (await db.pool.query("INSERT INTO banking.role(rolename) VALUES('Visibility test') RETURNING roleid")).rows[0].roleid;
    for (let i = 0; i < 2; i++) {
      const branch = (await db.pool.query(`INSERT INTO banking.branch(branchcode,branchname,address,city,opendate)
        VALUES($1,'Test','Test','Test',CURRENT_DATE) RETURNING branchid`, ['VIS-' + i])).rows[0].branchid;
      const employee = (await db.pool.query(`INSERT INTO banking.employee(employeecode,branchid,roleid,fullname,phone,email,hiredate,salary)
        VALUES($1,$2,$3,'Test',$4,$5,CURRENT_DATE,0) RETURNING employeeid`,
        ['VIS-' + i, branch, role, '090000000' + i, 'vis' + i + '@example.invalid'])).rows[0].employeeid;
      const user = (await db.pool.query(`INSERT INTO banking."system_user"(employeeid,username,passwordhash)
        VALUES($1,$2,'unused-test-hash') RETURNING userid`, [employee, 'VIS-' + i])).rows[0].userid;
      actors.push({ role: 'employee', userId: user, employeeId: employee, branchId: branch });
    }
    const management = new ManagementController(db), listings = new AdminController(db);
    const data = { name: 'New visibility customer', gender: 'Other', birthDate: '1995-01-01',
      phone: '0900000000', email: 'visibility@example.invalid', address: 'Test', occupation: 'Test',
      customerType: 'Individual', segment: 'Standard' };
    const mine = await management.createCustomer({ ...data, nationalId: 'VIS-MINE' }, actors[0], {});
    const other = await management.createCustomer({ ...data, nationalId: 'VIS-OTHER' }, actors[1], {});
    const ids = async actor => (await listings.customers(actor, {})).items.map(row => Number(row.customerid));
    assert.ok((await ids(actors[0])).includes(mine.customerid));
    assert.ok(!(await ids(actors[0])).includes(other.customerid));
    assert.ok(!(await ids(actors[1])).includes(mine.customerid));
    const admin = { ...actors[0], role: 'admin' };
    assert.ok((await ids(admin)).includes(mine.customerid));
    assert.ok((await ids(admin)).includes(other.customerid));
    await assertResourceBranch(db, actors[0], 'customer', mine.customerid);
    await assert.rejects(() => assertResourceBranch(db, actors[1], 'customer', mine.customerid));
    const type = (await db.pool.query("INSERT INTO banking.account_type(typename) VALUES('Visibility type') RETURNING accounttypeid")).rows[0].accounttypeid;
    await management.openAccount({ accountNumber: 'VIS-ACCOUNT', branchId: actors[1].branchId,
      accountTypeId: type, category: 'CUSTOMER', customerId: mine.customerid }, actors[1], {});
    assert.ok(!(await ids(actors[0])).includes(mine.customerid));
    assert.ok((await ids(actors[1])).includes(mine.customerid));
    assert.ok((await ids(admin)).includes(mine.customerid));
    const inBranch = await listings.customers(admin, { branchId: String(actors[1].branchId) });
    assert.ok(inBranch.items.some(row => Number(row.customerid) === mine.customerid));
    await assert.rejects(() => assertResourceBranch(db, actors[0], 'customer', mine.customerid));
    await assertResourceBranch(db, actors[1], 'customer', mine.customerid);
  } finally { await db.onModuleDestroy(); }
});
