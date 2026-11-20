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
  failureCode?:string|null;
  failureReason?:string;
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
  reviewreason?: string | null;
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

export interface CustomerProductCatalog {
  branches: Array<{id:number;name:string;acceptingLoans:boolean}>;
  accountTypes: Array<{id:number;name:string;minBalance:string|number}>;
  loanTypes: Array<{id:number;name:string;maxAmount:string|number;interestRate:string|number;maxTermMonths:number}>;
  card: {cardType:string;types:Array<{value:string;label:string}>;dailyLimit:string;validityYears:number};
}
export type CustomerProductKind = "accounts"|"cards"|"loans";

export interface LoanPaymentOptions {
  loanId:number;status:string;ready:boolean;unavailableReason:string|null;
  funded?:boolean;disbursement?:ApiTransaction|null;receivingAccountNumber?:string|null;
  schedules:Array<{scheduleId:number;installmentNo:number;dueDate:string;status:string;principal:string;interest:string;penalty:string;total:string;pendingPayment:boolean}>;
}
export interface LoanDisbursementOptions {
  unavailableCode?:string|null;
  loanId:number;status:string;ready:boolean;unavailableReason:string|null;
  accounts:Array<{accountId:number;accountNumber:string}>;disbursement:ApiTransaction|null;
}
export interface LoanDecisionInput {
  decision:"APPROVE"|"REJECT";reason:string;destinationAccountId?:number;requestKey?:string;
}
export interface LoanDecisionResult {resolvedExistingDisbursement?:boolean;loanid:number;status:string;disbursement?:ApiTransaction}
export interface LoanPaymentInput {
  loanId:number;scheduleId:number;sourceAccountId:number;amount:string;transactionCode:string;
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
    changePercent: number | null;
  }>;
  dailyTransactions: Array<{ date: string; count: number }>;
  transactionTypes: Array<{ code: string; label: string; count: number }>;
  transactionStatuses: Array<{ status: string; count: number }>;
  recentRisks: Array<{
    transactionId: number;
    transactionCode: string;
    customer: string;
    customerCode?: string | null;
    amount: number;
    ruleScore: number | null;
    modelProbability: number | null;
    assessed_at: string;
    decision: "ALLOW" | "REVIEW" | "BLOCK";
  }>;
  pendingReviews: Array<{
    transactionId: number;
    transactionCode: string;
    reviewId: number;
    customer: string;
    customerCode?: string | null;
    amount: number;
    ruleScore: number | null;
    modelProbability: number | null;
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
    action?: string;
    entitytype?: string;
    entityid?: string;
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

export interface CustomerTransactionDetail {
  transaction:ApiTransaction;
  postings:unknown[];
  transfer:{sourceAccountNumber:string|null;sourceAccountName:string|null;destinationAccountNumber:string|null;destinationAccountName:string|null}|null;
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

function requireTransactionResult(row: unknown): ApiTransaction {
  if (!isFinancialTransactionResult(row))
    throw new ApiError(
      "Chưa nhận được kết quả giao dịch hợp lệ. Vui lòng kiểm tra lịch sử hoặc thử lại cùng lệnh.",
      502,
      "TRANSACTION_RESULT_UNKNOWN",
    );
  return row as ApiTransaction;
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
  customerRecipients: () => apiRequest<TransferDestination[]>("/me/recipients"),
  customerProductCatalog: () => apiRequest<CustomerProductCatalog>("/me/products/catalog"),
  createCustomerProduct: (kind:CustomerProductKind, data:Record<string,unknown>) =>
    apiRequest<Record<string,unknown>>(`/me/products/${kind}`, {method:"POST",body:JSON.stringify(data)}),
  loanDisbursementOptions: (id:number) => apiRequest<LoanDisbursementOptions>(`/management/loans/${id}/disbursement-options`),
  decideLoan: async (id:number, data:LoanDecisionInput) => {
    const result=await apiRequest<LoanDecisionResult>(`/management/loans/${id}/decision`, {method:"POST",body:JSON.stringify(data)});
    if(Number(result.loanid)!==id)throw new ApiError("Kết quả khoản vay không khớp. Vui lòng kiểm tra lại hồ sơ.",502);
    if(data.decision==="APPROVE") {
      const transaction=requireTransactionResult(result.disbursement);
      if((transaction.transactioncode!==`LD-${data.requestKey}`&&result.resolvedExistingDisbursement!==true)||transaction.typecode!=="DEPOSIT"||Number(transaction.destinationaccountid)!==data.destinationAccountId)
        throw new ApiError("Chưa nhận được kết quả giải ngân khớp với lệnh đã gửi. Vui lòng kiểm tra hồ sơ hoặc thử lại đúng lệnh.",502);
    }
    return result;
  },
  customerCards: () => apiRequest<ApiCard[]>("/me/cards"),
  revealCardNumber: (id:number,password:string,signal?:AbortSignal) => apiRequest<{cardId:number;cardNumber:string;expiresIn:number}>(`/me/cards/${id}/reveal-number`,{method:"POST",body:JSON.stringify({password}),signal,cache:"no-store"}),
  customerLoans: () => apiRequest<ApiLoan[]>("/me/loans"),
  loanPaymentOptions: (id:number) => apiRequest<LoanPaymentOptions>(`/me/loans/${id}/payment-options`),
  payLoan: async (data:LoanPaymentInput) => {
    const result=requireTransactionResult(await apiRequest<ApiTransaction>("/transactions/loan-payments",{method:"POST",body:JSON.stringify(data)}));
    if(result.typecode!=="LOAN_PAYMENT"||result.transactioncode!==data.transactionCode||result.currency!=="VND")
      throw new ApiError("Chưa nhận được kết quả trả nợ khớp với lệnh đã gửi. Vui lòng kiểm tra lịch sử hoặc thử lại đúng lệnh.",502,"LOAN_PAYMENT_RESULT_UNKNOWN");
    return result;
  },
  customerNotifications: (page = 1, pageSize = 20) =>
    apiRequest<PageResult<CustomerNotification>>(
      `/me/notifications${toQuery({ page, pageSize })}`,
    ),
  customerTransaction: async (id:number) => {
    const detail=await apiRequest<CustomerTransactionDetail|null>(`/me/transactions/${id}`);
    if(!detail)throw new ApiError("Không tìm thấy giao dịch hoặc bạn không có quyền xem giao dịch này.",404);
    if(Number(detail.transaction?.transactionid)!==id)throw new ApiError("Thông tin giao dịch trả về không khớp với thông báo. Vui lòng thử lại.",502);
    return {...detail,transaction:requireTransactionResult(detail.transaction)};
  },
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
  customers: (params: Record<string, string | number | undefined> = {}, signal?: AbortSignal) =>
    apiRequest<PageResult<Record<string, unknown>>>(
      `/admin/customers${toQuery(params)}`,
      { signal, timeoutMs: 15_000 },
    ),
  employees: (params: Record<string, string | number | undefined> = {}) =>
    apiRequest<PageResult<Record<string, unknown>>>(
      `/admin/employees${toQuery(params)}`,
    ),
  accounts: (params: Record<string, string | number | undefined> = {}) =>
    apiRequest<PageResult<ApiAccount>>(`/admin/accounts${toQuery(params)}`),
  branches: (params: Record<string, string | number | undefined> = {}, signal?: AbortSignal) =>
    apiRequest<PageResult<Record<string, unknown>>>(
      `/admin/branches${toQuery(params)}`,
      { signal, timeoutMs: 15_000 },
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
  createFraudReview: (input: { transactionCode: string; reason: string }) =>
    apiRequest<{ reviewId: string; status: string; reused: boolean }>("/admin/fraud-reviews", {
      method: "POST",
      body: JSON.stringify(input),
    }),
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
      resendAfter?: number;
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
  managementCustomerAccounts: (customerId: number) => apiRequest<Array<{
    accountid: number | string; accountnumber: string; branchid: number; branchname: string; accounttypename: string;
  }>>(`/management/customers/${customerId}/accounts`),
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
