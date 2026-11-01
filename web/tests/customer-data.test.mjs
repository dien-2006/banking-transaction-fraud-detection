import assert from "node:assert/strict";
import test from "node:test";
import { moduleUrl } from "./module-loader.mjs";

const {
  accountKind,
  customerDate,
  customerStatuses,
  customerTransactionsCsv,
  loadCustomerTransactions,
  transactionView,
} = await import(await moduleUrl("customer-data"));

const accounts = [
  { accountid: 11, accountnumber: "OWN-11", accounttypename: "Thanh toán" },
  { accountid: 12, accountnumber: "OWN-12", accounttypename: "Tiết kiệm" },
];
const transaction = {
  transactionid: 1,
  transactioncode: "TX-1",
  typecode: "TRANSFER",
  typename: "Transfer",
  amount: "7000",
  fee: "0",
  transactiondate: "2026-10-31T10:00:00",
  status: "Success",
  sourceaccountid: 11,
  destinationaccountid: 22,
};

test("classifies a CUSTOMER savings account by its product, preserves bank statuses", () => {
  assert.equal(
    accountKind({ accountcategory: "CUSTOMER", accounttypename: "Tiết kiệm" }),
    "Tiết kiệm",
  );
  assert.equal(
    accountKind({
      accountcategory: "CUSTOMER",
      accounttypename: "Savings Account",
    }),
    "Tiết kiệm",
  );
  assert.equal(customerStatuses.Frozen, "Tạm phong tỏa");
  assert.equal(customerDate("1995-02-17T00:00:00.000Z"), "17/02/1995");
});
test("distinguishes outgoing, incoming, internal and unknown transactions", () => {
  assert.equal(transactionView(transaction, accounts).direction, "out");
  assert.equal(
    transactionView(
      { ...transaction, sourceaccountid: 22, destinationaccountid: 11 },
      accounts,
    ).direction,
    "in",
  );
  assert.equal(
    transactionView({ ...transaction, destinationaccountid: 12 }, accounts)
      .direction,
    "internal",
  );
  assert.equal(
    transactionView(
      { ...transaction, sourceaccountid: null, destinationaccountid: null },
      accounts,
    ).direction,
    "unknown",
  );
});
test("failed/pending transactions never appear as credited or debited money", () => {
  assert.match(transactionView(transaction, accounts).amountText, /^−/);
  assert.match(
    transactionView(
      { ...transaction, sourceaccountid: 22, destinationaccountid: 11 },
      accounts,
    ).amountText,
    /^\+/,
  );
  for (const status of ["Failed", "Cancelled", "Pending"])
    assert.doesNotMatch(
      transactionView({ ...transaction, status }, accounts).amountText,
      /^[+−-]/,
    );
});
test("CSV preserves actual status, account and escapes quotes/formulas", () => {
  const csv = customerTransactionsCsv(
    [{ ...transaction, status: "Failed", description: '=HYPERLINK("unsafe")' }],
    accounts,
  );
  assert.match(csv, /Thất bại/);
  assert.doesNotMatch(csv, /Thành công/);
  assert.match(csv, /OWN-11/);
  assert.match(csv, /'=HYPERLINK\(""unsafe""\)/);
});
test("history table and CSV preserve foreign currency with posted direction signs", () => {
  const row = { ...transaction, currency: "USD", amount: "100" };
  const text = transactionView(row, accounts).amountText;
  assert.match(text, /^−/);
  assert.doesNotMatch(text, /₫|đ/);
  assert.match(text, /USD|US\$|\$/);
  assert.doesNotMatch(customerTransactionsCsv([row], accounts), /₫/);
  assert.match(
    customerTransactionsCsv(
      [{ ...row, transactiondate: "2026-10-31T17:00:00Z" }],
      accounts,
    ),
    /1\/11\/2026/,
  );
});
test("history search can use all authorized API pages rather than only page one", async () => {
  const rows = Array.from({ length: 205 }, (_, i) => ({
    ...transaction,
    transactionid: i + 1,
  }));
  const calls = [];
  const result = await loadCustomerTransactions(async ({ page, pageSize }) => {
    calls.push(page);
    return {
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      pageSize,
      page,
    };
  });
  assert.equal(result.length, 205);
  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal(result[0].transactionid, 205);
});
test("detects history changed during pagination instead of reporting incomplete totals", async () => {
  await assert.rejects(
    loadCustomerTransactions(async ({ page, pageSize }) => ({
      items:
        page === 1
          ? Array.from({ length: 100 }, (_, i) => ({
              ...transaction,
              transactionid: i,
            }))
          : [],
      total: 101,
      pageSize,
      page,
    })),
    /Danh sách vừa thay đổi/,
  );
});
