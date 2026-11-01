export const accountRows = Array.from({ length: 24 }, (_, i) => ({
  accountid: i + 1,
  accountnumber: `100000000000${String(i + 1).padStart(4, "0")}`,
  customerid: 101,
  branchid: 3,
  branchcode: "CN003",
  branchname: "Chi nhánh kiểm thử",
  accounttypeid: 1,
  accounttypename: i % 3 ? "Thanh toán" : "Tiết kiệm",
  accountcategory: i === 23 ? "INTERNAL" : "CUSTOMER",
  currency: i === 22 ? "USD" : "VND",
  status: "Active",
  minbalance: "50000",
  balance: "125000000.25",
  availablebalance: "124950000.25",
  opendate: "2026-01-01",
}));
export const transactionRows = Array.from({ length: 205 }, (_, i) => ({
  transactionid: i + 1,
  transactioncode: `TX-${String(i + 1).padStart(8, "0")}`,
  initiatedbycustomerid: 101,
  typecode: i % 4 ? "TRANSFER" : "DEPOSIT",
  typename: i % 4 ? "Chuyển khoản" : "Nạp tiền",
  channel: "InternetBanking",
  amount: i === 204 ? "100.25" : "1250000.25",
  fee: "1000",
  currency: i === 204 ? "USD" : "VND",
  transactiondate: `2026-11-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z`,
  status: ["Success", "Pending", "Failed", "Cancelled"][i % 4],
  sourceaccountid: i % 3 === 0 ? 99 : 1,
  destinationaccountid: 2,
  description: `Giao dịch kiểm tra ${i + 1}`,
  rulescore: 65,
  risklevel: "HIGH",
  modelprobability: "0.65",
  decision: "REVIEW",
}));
export const loanRows = Array.from({ length: 8 }, (_, i) => ({
  loanid: i + 1,
  loancode: `LN-${i + 1}`,
  customerid: 101,
  branchid: 3,
  loantypename: ["Vay mua nhà", "Vay mua ô tô", "Vay tiêu dùng"][i % 3],
  principalamount: "500000000",
  outstandingamount: i % 3 === 2 ? "0" : "450000000",
  interestrate: "8.5",
  termmonths: 120,
  startdate: "2025-01-01",
  enddate: "2035-01-01",
  nextduedate: "2026-11-25",
  status: ["Active", "Overdue", "Paid", "Pending"][i % 4],
}));
export const cardRows = Array.from({ length: 12 }, (_, i) => ({
  cardid: i + 1,
  customerid: 101,
  accountid: 1 + (i % 2),
  maskedcardnumber: `************${String(i + 1).padStart(4, "0")}`,
  cardtype: ["Credit Visa", "Debit Mastercard", "Debit Napas", "Virtual"][
    i % 4
  ],
  issuedate: "2026-01-01",
  expirydate: "2030-12-31",
  dailylimit: "50000000",
  status: ["Active", "Blocked", "Expired", "Closed"][i % 4],
}));
export const customerRows = Array.from({ length: 24 }, (_, i) => ({
  customerid: i + 1,
  customercode: `C-${i + 1}`,
  fullname: `Khách hàng kiểm tra ${i + 1}`,
  dateofbirth: "1998-08-15",
  gender: "Female",
  phone: "0901234567",
  email: "customer@example.test",
  address: "Hà Nội",
  occupation: "Kỹ sư",
  customersegment: "RETAIL",
  status: i % 3 ? "Active" : "Inactive",
}));
export const branches = Array.from({ length: 12 }, (_, i) => ({
  branchid: i + 1,
  branchcode: `CN${String(i + 1).padStart(3, "0")}`,
  branchname: `Chi nhánh ${i + 1}`,
  address: "Đường Cầu Giấy",
  city: "Hà Nội",
  phone: "0901234567",
  status: "Active",
  employeecount: 12,
  customercount: 24,
  accountcount: 24,
}));
export const employees = customerRows.map((row, i) => ({
  ...row,
  employeeid: i + 1,
  employeecode: `NV${i + 1}`,
  branchid: 3,
  branchname: "Chi nhánh 3",
  rolename: "Giao dịch viên",
  hiredate: "2025-01-01",
}));
export const profile = {
  ...customerRows[0],
  fullname: "Nguyễn Minh Anh",
  customerid: 101,
  employeeid: 2,
  employeecode: "NV002",
  rolename: "Nhân viên ngân hàng",
  username: "registered-user",
  branchid: 3,
  branchname: "Chi nhánh 3",
  hiredate: "2025-01-01",
  customertype: "Individual",
};
export const overview = {
  generatedAt: "2026-11-01T10:00:00Z",
  activeAccounts: 24,
  kpis: ["customers", "accounts", "transactions", "loans", "risks"].map(
    (key, i) => ({
      key,
      label: [
        "Tổng khách hàng",
        "Tổng tài khoản",
        "Tổng giao dịch",
        "Tổng khoản vay",
        "Giao dịch rủi ro",
      ][i],
      value: 205,
      currentPeriod: 12,
      previousPeriod: 10,
      changePercent: 20,
    }),
  ),
  dailyTransactions: [
    { date: "2026-11-01", count: 12 },
    { date: "2026-11-02", count: 20 },
  ],
  transactionTypes: [{ code: "TRANSFER", label: "Chuyển khoản", count: 20 }],
  transactionStatuses: [{ status: "Success", count: 20 }],
  recentRisks: [
    {
      transactionId: 1,
      transactionCode: "TX-1",
      customer: "KH #101",
      amount: 10000,
      ruleScore: 65,
      modelProbability: 0.65,
      assessed_at: "2026-11-01T10:00:00Z",
      decision: "REVIEW",
    },
  ],
  pendingReviews: [
    {
      transactionId: 1,
      transactionCode: "TX-1",
      customer: "KH #101",
      amount: 10000,
      ruleScore: 65,
      modelProbability: 0.65,
      reviewId: 1,
      created_at: "2026-11-01T10:00:00Z",
      decision: "REVIEW",
    },
  ],
  branches: branches.map((row) => ({
    branchId: row.branchid,
    branchName: row.branchname,
    customers: 24,
    accounts: 24,
    transactions: 205,
    loans: 8,
    risks: 2,
  })),
  recentActivities: [
    {
      auditId: 1,
      actor: "Nhân viên kiểm tra",
      role: "Nhân viên",
      description: "Cập nhật thông tin",
      created_at: "2026-11-01T10:00:00Z",
    },
  ],
};
const page = (rows, url) => {
  const page = Number(url.searchParams.get("page") || 1),
    pageSize = Number(url.searchParams.get("pageSize") || 100);
  return {
    page,
    pageSize,
    total: rows.length,
    items: rows.slice((page - 1) * pageSize, page * pageSize),
  };
};
export function fixtureResponse(url, role) {
  const path = url.pathname.replace("/api/v1", "");
  if (path === "/me" || path === "/admin/profile") return profile;
  if (path === "/me/accounts")
    return accountRows.filter((row) => row.accountcategory === "CUSTOMER");
  if (path === "/me/cards") return cardRows;
  if (path === "/me/loans") return loanRows;
  if (/^\/me\/loans\/\d+\/schedule$/.test(path)) {
    const loanid = Number(path.split("/")[3]);
    return [1, 2, 3].map((n) => ({
      scheduleid: loanid * 10 + n,
      loanid,
      installmentno: n,
      duedate: `2026-${n === 3 ? "12" : "11"}-25`,
      principaldue: "10000000",
      interestdue: "500000",
      penaltydue: "0",
      status: n === 1 ? "Paid" : "Pending",
    }));
  }
  if (path === "/me/devices")
    return [
      {
        deviceid: 1,
        devicename: "Thiết bị kiểm tra",
        status: "Active",
        lastseenat: "2026-11-01T10:00:00Z",
      },
    ];
  if (path === "/me/notifications")
    return page(
      customerRows.map((_, i) => ({
        notificationoutboxid: i + 1,
        notificationtype: "TRANSACTION_COMPLETED",
        transactioncode: `TX-${i + 1}`,
        createdat: "2026-11-01T10:00:00Z",
      })),
      url,
    );
  if (path === "/admin/notifications")
    return page(
      customerRows.map((_, i) => ({
        id: `review-${i + 1}`,
        type: "fraud",
        title: "Giao dịch cần kiểm tra",
        detail: "Giao dịch đang chờ xử lý",
        severity: "HIGH",
        unread: true,
        createdat: "2026-11-01T10:00:00Z",
      })),
      url,
    );
  if (path === "/transactions") return page(transactionRows, url);
  if (path === "/admin/accounts") return page(accountRows, url);
  if (path === "/admin/cards") return page(cardRows, url);
  if (path === "/admin/loans") return page(loanRows, url);
  if (path === "/admin/customers") return page(customerRows, url);
  if (path === "/admin/employees") return page(employees, url);
  if (path === "/admin/branches") return page(branches, url);
  if (path === "/admin/fraud-reviews")
    return page(
      transactionRows
        .slice(0, 24)
        .map((row, i) => ({
          ...row,
          reviewcaseid: i + 1,
          reviewstatus: ["OPEN", "IN_REVIEW", "APPROVED", "REJECTED", "CLOSED"][
            i % 5
          ],
          reviewcreatedat: row.transactiondate,
          revieweruserid: i % 2 ? 1 : null,
        })),
      url,
    );
  if (path === "/admin/audit-logs")
    return page(
      customerRows.map((_, i) => ({
        auditid: i + 1,
        userid: 1,
        entitytype: "CUSTOMER",
        entityid: i + 1,
        action: "UPDATE",
        createdat: "2026-11-01T10:00:00Z",
        oldvalue: { email: "old@example.test" },
        newvalue: { email: "new@example.test" },
      })),
      url,
    );
  if (path === "/admin/reference-data")
    return {
      branches: branches.map((r) => ({ id: r.branchid, name: r.branchname })),
      roles: [{ id: 1, name: "Nhân viên" }],
      accountTypes: [{ id: 1, name: "Thanh toán" }],
      loanTypes: [{ id: 1, name: "Vay mua nhà" }],
    };
  if (path === "/admin/dashboard")
    return role === "employee"
      ? {
          ...overview,
          branches: overview.branches.filter((r) => r.branchId === 3),
        }
      : overview;
  if (path === "/admin/branch-dashboard")
    return {
      branch: branches[2],
      transactionCount: 205,
      successfulAmount: "50000000",
      riskyTransactionCount: 20,
      activeLoanCount: 5,
      openReviewCount: 3,
    };
  if (path === "/analytics")
    return [
      {
        full_date: "2026-11-01",
        channel_key: 1,
        transaction_type_key: 1,
        status: "Success",
        transaction_count: 20,
        total_amount: 50000000,
        total_fee: 2000,
        risk_level: "HIGH",
        decision: "REVIEW",
        assessment_count: 5,
        average_rule_score: 65,
        average_model_probability: 0.65,
        review_count: 5,
        average_resolution_seconds: 120,
        model_key: 1,
        model_name: "Model kiểm tra",
        model_type: "Classifier",
        label: "FRAUD",
        labeled_transactions: 3,
        average_probability: 0.65,
        login_count: 5,
        customer_count: 3,
        payment_channel: "Online",
        payment_count: 2,
        total_paid: 2000000,
        principal_paid: 1900000,
        interest_paid: 100000,
        penalty_fee: 0,
      },
    ];
  throw new Error(`No fixture for ${path}`);
}
