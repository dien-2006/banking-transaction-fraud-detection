import assert from "node:assert/strict";
import test from "node:test";
import { moduleUrl } from "./module-loader.mjs";

const { loadAllPages } = await import(await moduleUrl("paged-data"));
const { presentTransaction, transactionSummary, isVerified } = await import(
  await moduleUrl("staff-data")
);
const { summarizeLoans } = await import(await moduleUrl("loan-summary"));
const { customerLoanOverview, installmentRemaining, loanProgress, loanTerm } =
  await import(await moduleUrl("customer-loans"));
const { accountBalanceSummary, accountActivity } = await import(
  await moduleUrl("account-analytics")
);
const { transferredToday, validateTransferDestination } = await import(
  await moduleUrl("transfer-data")
);
const {
  emptyHistoryFilters,
  filterCustomerHistory,
  historyDay,
  summarizeCustomerHistory,
  historyChartBuckets,
  frequentCustomerTransactions,
  historyAccountLabel,
} = await import(await moduleUrl("customer-history"));
const transaction = {
  transactionid: 1,
  transactioncode: "TX-1",
  typecode: "WITHDRAWAL",
  typename: "Withdrawal",
  amount: "1000",
  transactiondate: "2026-10-31T10:00:00Z",
  status: "Cancelled",
  risklevel: null,
};
const {
  customerProfileFields,
  customerProfileType,
  profileInitials,
  profileDeviceTime,
} = await import(await moduleUrl("customer-profile"));
test("profile presents registered identity without inventing absent contact details or verification", () => {
  const profile = {
    fullname: "Nguyễn Minh Anh",
    customercode: "C0001",
    dateofbirth: "1998-08-15T00:00:00Z",
    gender: "Female",
    email: null,
    nationalid: "123456789012",
    address: "Hà Nội",
  };
  const fields = new Map(
    customerProfileFields(profile).map(([key, , value]) => [key, value]),
  );
  assert.equal(fields.get("dateofbirth"), "15/08/1998");
  assert.equal(fields.get("gender"), "Nữ");
  assert.equal(fields.get("email"), "Chưa cập nhật");
  assert.equal(fields.get("nationalid"), "•••• •••• 9012");
  assert.doesNotMatch(JSON.stringify([...fields]), /123456789012/);
  assert.equal(
    new Map(
      customerProfileFields({}).map(([key, , value]) => [key, value]),
    ).get("nationalid"),
    "Không hiển thị trên web",
  );
  assert.equal(profileInitials(profile.fullname), "NA");
  assert.equal(profileInitials(null), "?");
  assert.equal(customerProfileType("Business"), "Khách hàng doanh nghiệp");
  assert.equal(customerProfileType(null), "Khách hàng D4 Bank");
});
test("registered device timestamps use Vietnam time and handle missing values", () => {
  assert.match(profileDeviceTime("2026-10-31T17:30:00Z"), /1\/11\/2026/);
  assert.match(profileDeviceTime("2026-10-31T17:30:00Z"), /00:30:00/);
  assert.equal(profileDeviceTime(null), "Chưa cập nhật");
  assert.equal(profileDeviceTime("invalid"), "Chưa cập nhật");
});
const {
  customerCardKind,
  customerCardMask,
  filterCustomerCards,
  linkedCardTransactions,
} = await import(await moduleUrl("customer-cards"));

test("customer card classification does not infer credit from a network name", () => {
  assert.equal(customerCardKind({ cardtype: "Visa" }), "other");
  assert.equal(customerCardKind({ cardtype: "Credit Visa" }), "credit");
  assert.equal(customerCardKind({ cardtype: "Thẻ ghi nợ nội địa" }), "debit");
  assert.equal(customerCardKind({ cardtype: "Virtual Debit" }), "virtual");
  assert.equal(customerCardKind({ cardtype: "Thẻ ảo" }), "virtual");
  assert.equal(customerCardKind({ cardtype: "Sản phẩm mới" }), "other");
});
test("card numbers always stay masked and search respects type/status without changing source totals", () => {
  const cards = [
    {
      cardid: 1,
      maskedcardnumber: "4111111111111234",
      cardtype: "Credit",
      status: "Active",
    },
    {
      cardid: 2,
      maskedcardnumber: "************5678",
      cardtype: "Debit Napas",
      status: "Blocked",
    },
  ];
  assert.equal(customerCardMask(cards[0]), "•••• •••• •••• 1234");
  assert.doesNotMatch(customerCardMask(cards[0]), /411111/);
  assert.equal(
    customerCardMask({ maskedcardnumber: "unavailable" }),
    "•••• •••• •••• ••••",
  );
  assert.deepEqual(
    filterCustomerCards(cards, "credit", "Active", "1234").map(
      (card) => card.cardid,
    ),
    [1],
  );
  assert.deepEqual(
    filterCustomerCards(cards, "debit", "Blocked", "napas").map(
      (card) => card.cardid,
    ),
    [2],
  );
  assert.deepEqual(filterCustomerCards(cards, "debit", "Active", ""), []);
  assert.equal(cards.length, 2);
});
test("linked account activity is deduplicated and unrelated transfers are excluded", () => {
  const cards = [
    { cardid: 1, accountid: 11 },
    { cardid: 2, accountid: 11 },
    { cardid: 3, accountid: 12 },
  ];
  const rows = [
    {
      ...transaction,
      transactionid: 1,
      sourceaccountid: 11,
      destinationaccountid: 12,
    },
    {
      ...transaction,
      transactionid: 2,
      sourceaccountid: 99,
      destinationaccountid: 11,
    },
    {
      ...transaction,
      transactionid: 3,
      sourceaccountid: 90,
      destinationaccountid: 91,
    },
  ];
  assert.deepEqual(
    linkedCardTransactions(rows, cards).map((row) => row.transactionid),
    [1, 2],
  );
  assert.deepEqual(linkedCardTransactions(rows, []), []);
});

test("customer loan overview reconciles full schedules independently of card pagination", () => {
  const loan = {
    loanid: 1,
    status: "Active",
    principalamount: "1000000",
    outstandingamount: "1100000",
  };
  const active = {
    ...loan,
    loanid: 2,
    status: "Overdue",
    outstandingamount: "2000000",
  };
  const loans = [
    loan,
    active,
    { ...loan, loanid: 3, status: "Paid", outstandingamount: "0" },
    { ...loan, loanid: 4, status: "Pending" },
    { ...loan, loanid: 5, status: "Cancelled" },
  ];
  const row = {
    scheduleid: 1,
    loanid: 1,
    installmentno: 1,
    duedate: "2026-11-20",
    status: "Pending",
    principaldue: "500000",
    interestdue: "50000",
    penaltydue: "0",
  };
  const schedules = new Map([
    [
      1,
      [
        row,
        { ...row, scheduleid: 2, installmentno: 2, duedate: "2026-12-20" },
        { ...row, scheduleid: 3, installmentno: 3, status: "Paid" },
      ],
    ],
    [
      2,
      [
        {
          ...row,
          scheduleid: 4,
          loanid: 2,
          status: "Overdue",
          duedate: "2026-11-01",
          penaltydue: "10000",
        },
      ],
    ],
  ]);
  const summary = customerLoanOverview(loans, schedules, "2026-11-15");
  assert.equal(summary.outstanding, 3100000);
  assert.equal(summary.total, 5);
  assert.equal(summary.active, 2);
  assert.equal(summary.pending, 1);
  assert.equal(summary.overdue, 1);
  assert.equal(summary.monthlyAmount, 1110000);
  assert.equal(summary.nextDate, "2026-11-01");
  assert.deepEqual(
    summary.upcoming.map((row) => row.scheduleid),
    [4, 1, 2],
  );
  assert.equal(
    customerLoanOverview(loans, new Map([[1, schedules.get(1)]]), "2026-11-15")
      .monthlyAmount,
    null,
  );
  assert.deepEqual(
    customerLoanOverview(loans, new Map([[1, schedules.get(1)]]), "2026-11-15")
      .upcoming,
    [],
  );
  assert.equal(
    customerLoanOverview([], new Map(), "2026-11-15").monthlyAmount,
    0,
  );
});

test("partial installments never invent remaining money and progress counts completed installments", () => {
  const loan = {
    status: "Active",
    principalamount: "1000000",
    outstandingamount: "1100000",
  };
  const row = {
    status: "Partial",
    principaldue: "100000",
    interestdue: "10000",
    penaltydue: "1000",
  };
  assert.equal(installmentRemaining(row), null);
  assert.equal(installmentRemaining({ ...row, paidamount: "10000" }), 101000);
  assert.equal(installmentRemaining({ ...row, status: "Paid" }), 0);
  assert.equal(
    loanProgress(loan, [row, { ...row, status: "Paid" }]).percent,
    50,
  );
  assert.equal(loanProgress({ ...loan, status: "Paid" }).percent, 100);
  assert.equal(loanProgress({ ...loan, status: "Pending" }, [row]), null);
  assert.equal(loanProgress(loan, []), null);
  assert.equal(loanTerm(240), "20 năm");
  assert.equal(loanTerm(18), "1 năm 6 tháng");
  const summary = customerLoanOverview(
    [{ ...loan, loanid: 1 }],
    new Map([[1, [{ ...row, duedate: "2026-11-02", loanid: 1 }]]]),
    "2026-11-01",
  );
  assert.equal(summary.monthlyAmount, null);
  assert.equal(summary.complete, true);
});

test("history filters include Vietnam boundary dates, exact amount bands and account directions", () => {
  const base = {
    ...transaction,
    currency: "VND",
    status: "Success",
    sourceaccountid: 11,
    destinationaccountid: 99,
  };
  const rows = [999999, 1000000, 9999999, 10000000, 49999999, 50000000].map(
    (amount, i) => ({
      ...base,
      transactionid: i + 1,
      transactioncode: `CHECK-${i + 1}`,
      amount: String(amount),
      transactiondate: "2026-10-31T17:00:00Z",
    }),
  );
  rows.push({ ...rows[1], transactionid: 7, currency: "USD" });
  const filter = (changes) =>
    filterCustomerHistory(rows, { ...emptyHistoryFilters, ...changes }).map(
      (row) => row.transactionid,
    );
  assert.equal(historyDay(rows[0].transactiondate), "2026-11-01");
  assert.deepEqual(
    filter({ from: "2026-11-01", to: "2026-11-01", amount: "under1m" }),
    [1],
  );
  assert.deepEqual(filter({ amount: "1m-10m" }), [2, 3]);
  assert.deepEqual(filter({ amount: "10m-50m" }), [4, 5]);
  assert.deepEqual(filter({ amount: "50m-plus" }), [6]);
  assert.deepEqual(filter({ to: "2026-10-31" }), []);
  assert.deepEqual(filter({ from: "2026-11-02", to: "2026-11-01" }), []);
  assert.deepEqual(
    filter({
      account: "99",
      search: "check-6",
      status: "Success",
      type: "WITHDRAWAL",
    }),
    [6],
  );
  assert.deepEqual(filter({ account: "500" }), []);
});

test("history totals count every record but only posted VND external flows contribute money", () => {
  const base = {
    ...transaction,
    currency: "VND",
    amount: "1000",
    status: "Success",
    sourceaccountid: 11,
    destinationaccountid: 99,
  };
  const accounts = [
    { accountid: 11, accountnumber: "0123456789" },
    { accountid: 12, accountnumber: "1123456000" },
  ];
  const rows = [
    base,
    { ...base, sourceaccountid: 99, destinationaccountid: 11, amount: "2000" },
    ...["Pending", "Failed", "Cancelled"].map((status) => ({
      ...base,
      status,
      amount: "999999999",
    })),
    { ...base, destinationaccountid: 12 },
    { ...base, currency: "USD" },
    { ...base, sourceaccountid: null, destinationaccountid: null },
  ];
  const summary = summarizeCustomerHistory(rows, accounts);
  assert.equal(summary.total, 8);
  assert.equal(summary.pending, 1);
  assert.equal(summary.outgoing, 1000);
  assert.equal(summary.incoming, 2000);
  assert.deepEqual(summary.days, [
    { day: "2026-10-31", incoming: 2000, outgoing: 1000 },
  ]);
  assert.equal(historyAccountLabel(base, accounts), "•••• 6789");
  assert.equal(
    historyAccountLabel({ ...base, destinationaccountid: 12 }, accounts),
    "•••• 6789 → •••• 6000",
  );
  assert.equal(
    historyAccountLabel({ ...base, sourceaccountid: null }, accounts),
    "—",
  );
});

test("history chart preserves all daily amounts and frequent groups never sum different currencies", () => {
  const days = Array.from({ length: 31 }, (_, i) => ({
    day: `2026-10-${String(i + 1).padStart(2, "0")}`,
    incoming: i,
    outgoing: i * 2,
  }));
  const buckets = historyChartBuckets(days);
  assert.ok(buckets.length <= 7);
  assert.equal(buckets[0].from, "2026-10-01");
  assert.equal(buckets.at(-1).to, "2026-10-31");
  assert.equal(
    buckets.reduce((sum, row) => sum + row.incoming, 0),
    465,
  );
  assert.equal(
    buckets.reduce((sum, row) => sum + row.outgoing, 0),
    930,
  );
  assert.deepEqual(historyChartBuckets([]), []);
  const base = {
    ...transaction,
    status: "Success",
    description: "Chuyển tiền",
    currency: "VND",
    amount: "1000",
  };
  const groups = frequentCustomerTransactions([
    base,
    base,
    { ...base, status: "Pending" },
    { ...base, currency: "USD", amount: "5" },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].currency, "VND");
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].total, 2000);
  assert.equal(groups[1].total, 5);
});

test("reads every page, honoring the server page size", async () => {
  const rows = Array.from({ length: 205 }, (_, id) => ({ id }));
  const calls = [];
  const actual = await loadAllPages(
    async ({ page }) => {
      calls.push(page);
      return {
        page,
        pageSize: 40,
        total: rows.length,
        items: rows.slice((page - 1) * 40, page * 40),
      };
    },
    (row) => row.id,
  );
  assert.deepEqual(actual, rows);
  assert.deepEqual(
    calls.sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6],
  );
});
test("rejects overlaps and changing totals instead of presenting partial statistics", async () => {
  const rows = Array.from({ length: 100 }, (_, id) => ({ id }));
  await assert.rejects(
    loadAllPages(
      async ({ page }) => ({
        page,
        pageSize: 100,
        total: 101,
        items: page === 1 ? rows : [{ id: 0 }],
      }),
      (row) => row.id,
    ),
    /Danh sách vừa thay đổi/,
  );
  await assert.rejects(
    loadAllPages(
      async ({ page }) => ({
        page,
        pageSize: 100,
        total: page === 1 ? 101 : 102,
        items: page === 1 ? rows : [{ id: 100 }],
      }),
      (row) => row.id,
    ),
    /Danh sách vừa thay đổi/,
  );
});
test("empty result is valid; malformed pagination and empty IDs are rejected", async () => {
  assert.deepEqual(
    await loadAllPages(
      async () => ({ page: 1, pageSize: 100, total: 0, items: [] }),
      (row) => row.id,
    ),
    [],
  );
  await assert.rejects(
    loadAllPages(
      async () => ({ page: 1, pageSize: 0, total: 1, items: [] }),
      (row) => row.id,
    ),
    /không hợp lệ/,
  );
  await assert.rejects(
    loadAllPages(
      async () => ({ page: 1, pageSize: 100, total: 1, items: [{ id: "" }] }),
      (row) => row.id,
    ),
    /Danh sách vừa thay đổi/,
  );
});
test("preserves cancellation, withdrawal, unassessed risk and unknown type labels", () => {
  const view = presentTransaction(transaction);
  assert.equal(view.status, "Đã hủy");
  assert.equal(view.type, "Rút tiền");
  assert.equal(view.risk, "Chưa đánh giá");
  assert.equal(view.customer, "—");
  assert.equal(
    presentTransaction({
      ...transaction,
      typecode: "FUTURE",
      typename: "Future type",
    }).type,
    "Future type",
  );
  assert.equal(
    presentTransaction({ ...transaction, risklevel: "CRITICAL" }).risk,
    "Rất cao",
  );
});
test("summary includes all records and high/critical risks", () => {
  const rows = [
    transaction,
    { ...transaction, transactionid: 2, status: "Success", risklevel: "HIGH" },
    {
      ...transaction,
      transactionid: 3,
      status: "Pending",
      risklevel: "CRITICAL",
      typecode: "TRANSFER",
    },
  ];
  assert.deepEqual(transactionSummary(rows), {
    total: 3,
    success: 1,
    pending: 1,
    risky: 2,
    groups: [
      { label: "Rút tiền", count: 2 },
      { label: "Chuyển khoản", count: 1 },
    ],
  });
  assert.equal(transactionSummary(rows).total, 3);
});
test("KYC requires an explicit positive value", () => {
  for (const value of [true, "Verified", "APPROVED", "Đã xác minh"])
    assert.equal(isVerified(value), true);
  for (const value of [
    false,
    null,
    undefined,
    "Unverified",
    "Not verified",
    "Chưa xác minh",
    "",
  ])
    assert.equal(isVerified(value), false);
});
test("loan summary counts all statuses and reconciles product balances", () => {
  const summary = summarizeLoans([
    { status: "Active", outstandingamount: "1000", loantypename: "Tiêu dùng" },
    { status: "Pending", outstandingamount: "2000", loantypename: "Tiêu dùng" },
    { status: "Overdue", outstandingamount: "3000", loantypename: "Nhà ở" },
  ]);
  assert.equal(summary.outstanding, 6000);
  assert.equal(summary.active, 1);
  assert.equal(summary.pending, 1);
  assert.equal(summary.overdue, 1);
  assert.equal(
    summary.products.reduce((sum, row) => sum + row.amount, 0),
    summary.outstanding,
  );
  assert.throws(
    () => summarizeLoans([{ outstandingamount: "invalid" }]),
    /không hợp lệ/,
  );
});
test("customer balance composition excludes frozen balances and foreign currencies", () => {
  const summary = accountBalanceSummary([
    {
      accountid: 1,
      accounttypename: "Thanh toán",
      status: "Active",
      currency: "VND",
      balance: "18650000",
    },
    {
      accountid: 2,
      accounttypename: "Tiết kiệm",
      status: "Active",
      currency: "VND",
      balance: "10000000",
    },
    {
      accountid: 3,
      accounttypename: "Thẻ",
      status: "Active",
      currency: "VND",
      balance: "0",
    },
    {
      accountid: 4,
      accounttypename: "Thanh toán",
      status: "Frozen",
      currency: "VND",
      balance: "90000000",
    },
    {
      accountid: 5,
      accounttypename: "Thanh toán",
      status: "Active",
      currency: "USD",
      balance: "100",
    },
  ]);
  assert.equal(summary.total, 28650000);
  assert.equal(summary.count, 3);
  assert.deepEqual(
    summary.groups.map((row) => row.balance),
    [18650000, 10000000, 0],
  );
});
test("customer activity counts only posted external VND flows", () => {
  const accounts = [{ accountid: 1 }, { accountid: 2 }];
  const base = {
    transactiondate: "2026-10-31T10:00:00Z",
    amount: "1000",
    currency: "VND",
    status: "Success",
  };
  const rows = accountActivity(
    [
      { ...base, sourceaccountid: 99, destinationaccountid: 1 },
      { ...base, sourceaccountid: 1, destinationaccountid: 99, amount: "400" },
      { ...base, sourceaccountid: 1, destinationaccountid: 2 },
      {
        ...base,
        sourceaccountid: 99,
        destinationaccountid: 1,
        status: "Pending",
      },
      {
        ...base,
        sourceaccountid: 99,
        destinationaccountid: 1,
        status: "Cancelled",
      },
      {
        ...base,
        sourceaccountid: 99,
        destinationaccountid: 1,
        currency: "USD",
      },
    ],
    accounts,
  );
  assert.deepEqual(rows, [
    { day: "2026-10-31", incoming: 1000, outgoing: 400 },
  ]);
});
test("daily transferred amount follows the Vietnam day and selected source", () => {
  const row = {
    sourceaccountid: 11,
    typecode: "TRANSFER",
    currency: "VND",
    status: "Success",
    amount: "1000",
    transactiondate: "2026-10-31T17:01:00Z",
  };
  const rows = [
    row,
    { ...row, transactiondate: "2026-10-31T16:59:00Z" },
    { ...row, status: "Pending" },
    { ...row, status: "Cancelled" },
    { ...row, currency: "USD" },
    { ...row, sourceaccountid: 12 },
    { ...row, typecode: "WITHDRAWAL" },
  ];
  assert.equal(
    transferredToday(rows, 11, new Date("2026-11-01T01:00:00Z")),
    1000,
  );
  assert.equal(
    transferredToday(rows, 11, new Date("2026-10-31T16:59:00Z")),
    1000,
  );
});
test("recipient verification preserves the API identity and rejects invalid destinations", () => {
  const recipient = {
    accountId: 99,
    accountNumber: "DEMO-0099",
    accountName: "Nguyễn Văn An",
    bankName: "D4 Bank",
    currency: "VND",
  };
  assert.equal(validateTransferDestination(recipient, 11), recipient);
  assert.throws(() => validateTransferDestination(null, 11), /Không tìm thấy/);
  assert.throws(
    () => validateTransferDestination({ ...recipient, accountName: " " }, 11),
    /Không tìm thấy/,
  );
  assert.throws(
    () => validateTransferDestination({ ...recipient, accountId: 11 }, 11),
    /khác tài khoản nguồn/,
  );
  assert.throws(
    () => validateTransferDestination({ ...recipient, currency: "USD" }, 11),
    /chỉ hỗ trợ tài khoản VND/,
  );
});
