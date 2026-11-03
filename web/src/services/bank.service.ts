import type { Transaction } from "@/types";
import { isFinancialTransactionResult } from "@/lib/transaction-outcome";
import { ApiError, apiRequest, toQuery } from "./api.client";
import { presentTransaction } from "@/lib/staff-data";

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiTransaction {
  transactionid: number;
  transactioncode: string;
  typecode: string;
  typename: string;
  channel: string;
  amount: string;
  fee: string;
  currency: string;
  transactiondate: string;
  status: "Pending" | "Success" | "Failed" | "Cancelled";
  initiatedbycustomerid?: number;
  description?: string;
  sourceaccountid?: number;
  destinationaccountid?: number;
  rulescore?: number;
  risklevel?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  modelprobability?: string;
  decision?: "ALLOW" | "REVIEW" | "BLOCK";
  reviewcaseid?: number;
  reviewstatus?: string;
  cardid?: number;
}

export interface ApiAccount {
  accountid: number;
  accountnumber: string;
  branchid: number;
  branchcode: string;
  branchname: string;
  accounttypeid: number;
  accounttypename: string;
  minbalance: string;
  balance: string;
  availablebalance: string;
  currency: string;
  status: string;
  accountcategory: string;
  customerid?: number;
  holdertype?: string;
}

export interface ApiFraudReview extends ApiTransaction {
  reviewcaseid: number;
  reviewstatus: "OPEN" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "CLOSED";
  reviewcreatedat: string;
  reviewedat?: string | null;
  revieweruserid?: number | null;
}

export interface ApiCard {
  cardid: number;
  customerid: number;
  accountid: number;
  maskedcardnumber: string;
  issuedate: string;
  expirydate: string;
  cardtype: string;
  status: string;
  dailylimit: string | number;
}

export interface ApiLoan {
  loanid: number;
  loancode: string;
  loantypename: string;
  principalamount: string | number;
  outstandingamount: string | number;
  interestrate: string | number;
  termmonths: number;
  startdate: string;
  enddate: string;
  nextduedate?: string | null;
  status: string;
}

export interface TransferInput {
  sourceAccountId: number;
  destinationAccountId: number;
  amount: string;
  idempotencyKey: string;
  channel: "MobileBanking" | "InternetBanking";
  description?: string;
  otpAuthorizationToken: string;
}
export interface CounterTransferInput {
  customerId: number;
  sourceAccountId: number;
  destinationAccountId: number;
  amount: string;
  idempotencyKey: string;
  customerVerified: true;
  description?: string;
}
export interface CounterHolder {
  customerid: number;
  customercode: string;
  fullname: string;
  holdertype: string;
}
export interface MovementInput {
  type: "DEPOSIT" | "WITHDRAWAL";
  debitAccountId: number;
  creditAccountId: number;
  amount: string;
  transactionCode: string;
  channel: "Counter";
  description?: string;
}

export type TransferOtpContext = Pick<
  TransferInput,
  | "sourceAccountId"
  | "destinationAccountId"
  | "amount"
  | "idempotencyKey"
  | "channel"
  | "description"
>;

export interface TransferDestination {
  accountId: number;
  accountNumber: string;
  accountName: string;
  currency: string;
  bankName: string;
}

export interface AdminOverviewData {
  generatedAt: string;
  activeAccounts: number;
  kpis: Array<{
    key: "customers" | "accounts" | "transactions" | "loans" | "risks";
    label: string;
    value: number;
    currentPeriod: number;
    previousPeriod: number;
    changePercent: number;
  }>;
  dailyTransactions: Array<{ date: string; count: number }>;
  transactionTypes: Array<{ code: string; label: string; count: number }>;
  transactionStatuses: Array<{ status: string; count: number }>;
  recentRisks: Array<{
    transactionId: number;
    transactionCode: string;
    customer: string;
    amount: number;
    ruleScore: number;
    modelProbability: number;
    assessed_at: string;
    decision: "ALLOW" | "REVIEW" | "BLOCK";
  }>;
  pendingReviews: Array<{
    transactionId: number;
    transactionCode: string;
    reviewId: number;
    customer: string;
    amount: number;
    ruleScore: number;
    modelProbability: number;
    created_at: string;
    decision: "ALLOW" | "REVIEW" | "BLOCK";
  }>;
  branches: Array<{
    branchId: number;
    branchName: string;
    customers: number;
    accounts: number;
    transactions: number;
    loans: number;
    risks: number;
  }>;
  recentActivities: Array<{
    auditId: number;
    actor: string;
    role?: string;
    description: string;
    created_at: string;
  }>;
}

export interface CustomerNotification {
  notificationoutboxid: number;
  customerid?: number;
  transactionid?: number;
  transactioncode?: string;
  notificationtype: string;
  status: "PENDING" | "SENT" | "FAILED";
  createdat: string;
}

export interface EmployeeNotification {
  id: string;
  type: "fraud" | "loan" | "work" | "system";
  title: string;
  detail: string;
  createdat: string;
  severity: string;
  unread: boolean;
}

export interface LoanScheduleItem {
  scheduleid: number;
  loanid: number;
  installmentno: number;
  duedate: string;
  principaldue: string;
  interestdue: string;
  penaltydue: string;
  totaldue?: string;
  paidamount?: string;
  status: string;
}

function requireTransactionResult(row: ApiTransaction): ApiTransaction {
  if (!isFinancialTransactionResult(row))
    throw new ApiError(
      "Chưa nhận được kết quả giao dịch hợp lệ. Vui lòng kiểm tra lịch sử hoặc thử lại cùng lệnh.",
      502,
      "TRANSACTION_RESULT_UNKNOWN",
    );
  return row;
}

export const bankService = {
  adminOverview: () => apiRequest<AdminOverviewData>("/admin/dashboard"),
  listTransactions(
    params: Record<string, string | number | null | undefined> = {},
  ) {
    return apiRequest<PageResult<ApiTransaction>>(
      `/transactions${toQuery(params)}`,
    );
  },
  customerProfile: () => apiRequest<Record<string, unknown>>("/me"),
  customerAccounts: () => apiRequest<ApiAccount[]>("/me/accounts"),
  customerCards: () => apiRequest<ApiCard[]>("/me/cards"),
  customerLoans: () => apiRequest<ApiLoan[]>("/me/loans"),
  customerNotifications: (page = 1, pageSize = 20) =>
    apiRequest<PageResult<CustomerNotification>>(
      `/me/notifications${toQuery({ page, pageSize })}`,
    ),
  employeeProfile: () => apiRequest<Record<string, unknown>>("/admin/profile"),
  employeeNotifications: (page = 1, pageSize = 100) =>
    apiRequest<PageResult<EmployeeNotification>>(
      `/admin/notifications${toQuery({ page, pageSize })}`,
    ),
  loanSchedule: (loanId: number) =>
    apiRequest<LoanScheduleItem[]>(`/me/loans/${loanId}/schedule`),
  customerDevices: () => apiRequest<Record<string, unknown>[]>("/me/devices"),
  changePassword(oldPassword: string, newPassword: string) {
    return apiRequest<void>("/me/password", {
      method: "POST",
      body: JSON.stringify({ oldPassword, newPassword }),
    });
  },
  changeCardPin(cardId: number, oldPin: string, newPin: string) {
    return apiRequest<void>(`/me/cards/${cardId}/pin`, {
      method: "POST",
      body: JSON.stringify({ oldPin, newPin }),
    });
  },
  customers: (params: Record<string, string | number | undefined> = {}) =>
    apiRequest<PageResult<Record<string, unknown>>>(
      `/admin/customers${toQuery(params)}`,
    ),
  employees: (params: Record<string, string | number | undefined> = {}) =>
    apiRequest<PageResult<Record<string, unknown>>>(
      `/admin/employees${toQuery(params)}`,
    ),
  accounts: (params: Record<string, string | number | undefined> = {}) =>
    apiRequest<PageResult<ApiAccount>>(`/admin/accounts${toQuery(params)}`),
  branches: (params: Record<string, string | number | undefined> = {}) =>
    apiRequest<PageResult<Record<string, unknown>>>(
      `/admin/branches${toQuery(params)}`,
    ),
  cards: (params: Record<string, string | number | undefined> = {}) =>
    apiRequest<PageResult<Record<string, unknown>>>(
      `/admin/cards${toQuery(params)}`,
    ),
  loans: (params: Record<string, string | number | undefined> = {}) =>
    apiRequest<PageResult<Record<string, unknown>>>(
      `/admin/loans${toQuery(params)}`,
    ),
  fraudCases: (params: Record<string, string | number | undefined> = {}) =>
    apiRequest<PageResult<ApiFraudReview>>(
      `/admin/fraud-reviews${toQuery(params)}`,
    ),
  auditLogs: (params: Record<string, string | number | undefined> = {}) =>
    apiRequest<PageResult<Record<string, unknown>>>(
      `/admin/audit-logs${toQuery(params)}`,
    ),
  referenceData: () =>
    apiRequest<Record<string, unknown[]>>("/admin/reference-data"),
  resolveDestination(accountNumber: string) {
    return apiRequest<TransferDestination | null>(
      `/transactions/destinations/${encodeURIComponent(accountNumber)}`,
    );
  },
  requestTransferOtp(input: TransferOtpContext) {
    return apiRequest<{
      challengeId: string;
      expiresIn: number;
      destinationMasked: string;
    }>("/security/otp/request", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  verifyTransferOtp(
    input: TransferOtpContext & { challengeId: string; code: string },
  ) {
    return apiRequest<{ authorizationToken: string; expiresIn: number }>(
      "/security/otp/verify",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  },
  async transfer(input: TransferInput): Promise<Transaction> {
    const result = await apiRequest<ApiTransaction>("/transactions/transfers", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return presentTransaction(requireTransactionResult(result));
  },
  counterTransferHolders(accountId: number) {
    return apiRequest<CounterHolder[]>(
      `/transactions/counter-transfers/sources/${accountId}/holders`,
    );
  },
  counterTransfer(input: CounterTransferInput) {
    return apiRequest<ApiTransaction>("/transactions/counter-transfers", {
      method: "POST",
      body: JSON.stringify(input),
    }).then(requireTransactionResult);
  },
  resolveReview(
    id: number,
    input: { action: "APPROVE" | "REJECT"; reason?: string },
  ) {
    return apiRequest<ApiTransaction>(`/transactions/reviews/${id}`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then(requireTransactionResult);
  },
  createMovement(input: MovementInput) {
    return apiRequest<ApiTransaction>("/transactions/account-movements", {
      method: "POST",
      body: JSON.stringify(input),
    }).then(requireTransactionResult);
  },
  managementCreate(
    resource:
      "branches" | "customers" | "employees" | "accounts" | "cards" | "loans",
    body: Record<string, unknown>,
  ) {
    return apiRequest<Record<string, unknown>>(`/management/${resource}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
};
