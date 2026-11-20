const assert = require("node:assert/strict");
const test = require("node:test");
const { CounterTransferService } = require("../dist/http/counter-transfer");
const { DatabaseService } = require("../dist/database/database.service");
const user = {
  role: "employee",
  actorType: "employee",
  userId: 1,
  employeeId: 2,
  branchId: 3,
};
const input = {
  customerId: 101,
  sourceAccountId: 10,
  destinationAccountId: 20,
  amount: "1000",
  idempotencyKey: "d34f23da-1174-4a0b-b645-59843307aadd",
  customerVerified: true,
  description: "Theo yêu cầu khách hàng",
};
function fixture(options = {}) {
  const calls = [];
  const client = {
    query: async (sql, args) => {
      calls.push({ sql, args });
      let rows = [];
      if (sql.includes("counter-actor"))
        rows = options.inactive
          ? []
          : [
              {
                branchid: options.actorBranch ?? 3,
                rolename: options.admin ? "Admin" : "Giao dịch viên",
              },
            ];
      else if (sql.includes("counter-existing"))
        rows = options.existing ? [options.existing] : [];
      else if (sql.includes("counter-source"))
        rows = options.noOwner ? [] : [{ branchid: options.sourceBranch ?? 3 }];
      else if (sql.includes("counter-destination"))
        rows = options.badDestination ? [] : [{ accountid: 20 }];
      else if(sql.includes('business-actor')) rows=[{employeeid:2,branchid:3,rolename:'Giao dịch viên'}];
      else if(sql.includes('business-accounts')) rows=[{accountid:10,branchid:3,accountcategory:'CUSTOMER',currency:'VND'},{accountid:20,branchid:3,accountcategory:'CUSTOMER',currency:'VND'}];
      else if(sql.includes('FROM banking.account_holder WHERE accountid=')) rows=[{ok:1}];
      else if(sql.includes('SELECT transactiontypeid')) rows=[{transactiontypeid:1}];
      else if(sql.includes('business-create')) rows=[{transactionid:77}];
      else if(sql.includes('business-policy')) rows=[{modelversionid:42}];
      else if(sql.includes('banking_api.post_balanced_transaction')) {
        if(options.failCore)throw new Error('financial rollback');
        rows=[{status:options.status??'Success'}];
      } else if (sql.includes('banking_api.transaction_result')) rows=[{result:{transactionid:77,status:options.status??'Success'}}];
      return { rows };
    },
  };
  const db = {
    prepareRisk: async (_client, name, args) => { calls.push({ inference: name, args }); },
    pool: { query: client.query },
    transaction: async (context, fn) => {
      calls.push({ context });
      return fn(client);
    },
  };
  return { service: new CounterTransferService(db), calls };
}
test("counter transfers reject customer role, unverified request and invalid source scope", async () => {
  for (const [actor, dto, options] of [
    [{ ...user, role: "customer" }, input, {}],
    [user, { ...input, customerVerified: false }, {}],
    [{ ...user, branchId: null }, input, {}],
    [user, input, { inactive: true }],
    [user, input, { sourceBranch: 9 }],
    [user, input, { actorBranch: 9 }],
    [user, input, { noOwner: true }],
    [user, input, { badDestination: true }],
  ]) {
    const { service, calls } = fixture(options);
    await assert.rejects(service.create(actor, dto));
    assert.equal(
      calls.some((c) => c.sql?.includes("banking_api.create_transfer")),
      false,
    );
  }
  for (const amount of ["0", "-1", "1e3", "1.001", "NaN"])
    await assert.rejects(fixture().service.create(user, { ...input, amount }));
  await assert.rejects(
    fixture().service.create(user, { ...input, destinationAccountId: 10 }),
  );
});
test("counter transfers skip Risk/ML, preserve core financial status and audit the employee", async () => {
  for (const status of ["Success", "Failed"]) {
    const { service, calls } = fixture({ status });
    const result = await service.create(user, input, "127.0.0.1");
    assert.equal(result.status, status);
    assert.deepEqual(calls[0].context, { userId: 1, ipAddress: "127.0.0.1", risk: true });
    assert.ok(calls.findIndex(c=>c.sql?.includes('risk-customer:')) < calls.findIndex(c=>c.sql?.includes('hashtextextended($1, 0)')));
    assert.equal(calls.some(c=>c.inference),false);
    const core=calls.find(c=>c.sql?.includes('banking_api.post_balanced_transaction'));
    assert.deepEqual(core.args,[77,10,20,'1000',101,true]);
    const audit = calls.find((c) =>
      c.sql?.includes("COUNTER_TRANSFER_REQUEST"),
    );
    assert.equal(audit.args[0], 1);
    assert.equal(JSON.parse(audit.args[2]).employeeId, 2);
    assert.equal(
      calls.some((c) => /UPDATE banking.bank_transaction/.test(c.sql ?? "")),
      false,
    );
  }
});
test("same request returns prior result, changed payload conflicts and different branch cannot replay", async () => {
  const prior = {
    transactionid: 77,
    customerid: 101,
    sourceaccountid: 10,
    destinationaccountid: 20,
    amount: "1000.00",
    description: input.description,
    channel: "Counter",
    branchid: 3,
  };
  const good = fixture({ existing: prior });
  await good.service.create(user, input);
  assert.equal(
    good.calls.some(
      (c) =>
        c.sql?.includes("banking_api.create_transfer") ||
        c.sql?.includes("INSERT INTO"),
    ),
    false,
  );
  for (const patch of [
    { amount: "1001" },
    { destinationAccountId: 21 },
    { customerId: 102 },
    { description: "changed" },
  ])
    await assert.rejects(
      fixture({ existing: prior }).service.create(user, { ...input, ...patch }),
      (e) => e.getStatus() === 409,
    );
  await assert.rejects(
    fixture({ existing: { ...prior, branchid: 9 } }).service.create(
      user,
      input,
    ),
    (e) => e.getStatus() === 403,
  );
});
test("transaction wrapper rolls back core/audit failures before returning, and releases connection", async () => {
  for (const failure of ["core", "audit", null]) {
    const calls = [],
      client = {
        query: async (sql) => {
          calls.push(sql);
          return { rows: [] };
        },
        release: () => calls.push("RELEASE"),
      };
    const db = {
      pool: { connect: async () => client },
      ensureCryptoCompatibility: async () => {},
      setContext: async () => {},
    };
    const work = async (c) => {
      await c.query("core");
      if (failure === "core") throw new Error("core");
      await c.query("audit");
      if (failure === "audit") throw new Error("audit");
      return { status: "Pending" };
    };
    if (failure)
      await assert.rejects(
        DatabaseService.prototype.transaction.call(db, {}, work),
      );
    else
      assert.deepEqual(
        await DatabaseService.prototype.transaction.call(db, {}, work),
        { status: "Pending" },
      );
    assert.equal(calls.at(-1), "RELEASE");
    assert.equal(calls.includes("COMMIT"), !failure);
    assert.equal(calls.includes("ROLLBACK"), !!failure);
  }
});
test("holder lookup is restricted to staff and passes employee branch as query parameter", async () => {
  const { service, calls } = fixture();
  await service.holders(user, 10);
  assert.deepEqual(calls.at(-1).args, [10, 3]);
  await assert.rejects(service.holders({ ...user, role: "customer" }, 10));
});
