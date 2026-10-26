import type { Role, Stat, Transaction } from "@/types";
import { apiRequest, toQuery } from "./api.client";

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

export interface TransferInput {
  sourceAccountId: number;
  destinationAccountId: number;
  amount: string;
  idempotencyKey: string;
  channel: "MobileBanking" | "InternetBanking";
  description?: string;
  otpAuthorizationToken: string;
}

export type TransferOtpContext = Pick<TransferInput,
  "sourceAccountId" | "destinationAccountId" | "amount" | "idempotencyKey" | "channel">;

export interface TransferDestination {
  accountId: number;
  accountNumber: string;
  accountName: string;
  currency: string;
  bankName: string;
}

export interface AdminOverviewData {
  generatedAt: string;
  kpis: Array<{ key: "customers"|"accounts"|"transactions"|"loans"|"risks"; label: string; value: number; currentPeriod: number; previousPeriod: number; changePercent: number }>;
  dailyTransactions: Array<{ date: string; count: number }>;
  transactionTypes: Array<{ code: string; label: string; count: number }>;
  transactionStatuses: Array<{ status: string; count: number }>;
  recentRisks: Array<{ transactionId: number; transactionCode: string; customer: string; amount: number; ruleScore: number; modelProbability: number; assessed_at: string; decision: "ALLOW"|"REVIEW"|"BLOCK" }>;
  pendingReviews: Array<{ transactionId: number; transactionCode: string; reviewId: number; customer: string; amount: number; ruleScore: number; modelProbability: number; created_at: string; decision: "ALLOW"|"REVIEW"|"BLOCK" }>;
  branches: Array<{ branchId: number; branchName: string; customers: number; accounts: number; transactions: number; loans: number; risks: number }>;
  recentActivities: Array<{ auditId: number; actor: string; description: string; created_at: string }>;
}

const statusVi: Record<ApiTransaction["status"], Transaction["status"]> = {
  Pending: "Đang xử lý", Success: "Thành công", Failed: "Thất bại", Cancelled: "Thất bại",
};

function presentTransaction(value: ApiTransaction): Transaction {
  return {
    id: value.transactioncode,
    customer: value.description || `KH ${value.initiatedbycustomerid ?? "-"}`,
    type: value.typecode === "TRANSFER" ? "Chuyển khoản" : value.typecode === "DEPOSIT" ? "Nhận tiền" : "Thanh toán",
    amount: Number(value.amount),
    time: new Date(value.transactiondate).toLocaleString("vi-VN"),
    status: statusVi[value.status],
    risk: value.risklevel === "HIGH" || value.risklevel === "CRITICAL" ? "Cao" : value.risklevel === "MEDIUM" ? "Trung bình" : "Thấp",
  };
}

async function dashboard(role: Role): Promise<{ stats: Stat[]; transactions: Transaction[] }> {
  if (role === "customer") {
    const value = await apiRequest<Record<string, unknown> & { recentTransactions?: ApiTransaction[] }>("/me/dashboard");
    const stats: Stat[] = [
      { label: "Tổng số dư", value: Number(value.totalBalance ?? 0).toLocaleString("vi-VN"), change: "Theo tài khoản hoạt động", tone: "blue" },
      { label: "Tài khoản", value: String(value.activeAccountCount ?? 0), change: "Đang hoạt động", tone: "green" },
      { label: "Khoản vay", value: String(value.activeLoanCount ?? 0), change: "Đang hiệu lực", tone: "orange" },
      { label: "Thông báo", value: String(value.unreadNotificationCount ?? 0), change: "Chưa gửi", tone: "red" },
    ];
    return { stats, transactions: (value.recentTransactions ?? []).map(presentTransaction) };
  }
  const [summary, recent] = await Promise.all([
    apiRequest<Record<string, number | string>>("/admin/dashboard"),
    apiRequest<PageResult<ApiTransaction>>("/transactions?page=1&pageSize=5"),
  ]);
  return {
    stats: [
      { label: "Khách hàng", value: String(summary.customers ?? 0), change: "Toàn hệ thống", tone: "blue" },
      { label: "Tài khoản hoạt động", value: String(summary.activeAccounts ?? 0), change: "Hiện tại", tone: "green" },
      { label: "Giao dịch hôm nay", value: String(summary.transactionsToday ?? 0), change: "Trong ngày", tone: "orange" },
      { label: "Review đang mở", value: String(summary.openReviews ?? 0), change: "Cần xử lý", tone: "red" },
    ],
    transactions: recent.items.map(presentTransaction),
  };
}

export const bankService = {
  dashboard,
  adminOverview: () => apiRequest<AdminOverviewData>("/admin/dashboard"),
  listTransactions(params: Record<string, string | number | null | undefined> = {}) {
    return apiRequest<PageResult<ApiTransaction>>(`/transactions${toQuery(params)}`);
  },
  transactionDetail(id:number){return apiRequest<{transaction:ApiTransaction;postings:Record<string,unknown>[]}>(`/transactions/${id}`);},
  async transactions(query = ""): Promise<Transaction[]> {
    const result = await this.listTransactions({ page: 1, pageSize: 100 });
    const lowered = query.toLocaleLowerCase("vi");
    return result.items.map(presentTransaction).filter((item) => Object.values(item).join(" ").toLocaleLowerCase("vi").includes(lowered));
  },
  customerProfile: () => apiRequest<Record<string, unknown>>("/me"),
  customerAccounts: () => apiRequest<ApiAccount[]>("/me/accounts"),
  customerCards: () => apiRequest<Record<string, unknown>[]>("/me/cards"),
  customerLoans: () => apiRequest<Record<string, unknown>[]>("/me/loans"),
  customerNotifications: (page = 1, pageSize = 20) => apiRequest<PageResult<Record<string, unknown>>>(`/me/notifications${toQuery({ page, pageSize })}`),
  loanSchedule: (loanId: number) => apiRequest<Record<string, unknown>[]>(`/me/loans/${loanId}/schedule`),
  customerDevices: () => apiRequest<Record<string,unknown>[]>("/me/devices"),
  changePassword(oldPassword:string,newPassword:string){return apiRequest<void>("/me/password",{method:"POST",body:JSON.stringify({oldPassword,newPassword})});},
  changeCardPin(cardId:number,oldPin:string,newPin:string){return apiRequest<void>(`/me/cards/${cardId}/pin`,{method:"POST",body:JSON.stringify({oldPin,newPin})});},
  changeDeviceStatus(deviceId:number,status:"Active"|"Blocked"|"Removed",trusted?:boolean){return apiRequest<Record<string,unknown>>(`/me/devices/${deviceId}`,{method:"PATCH",body:JSON.stringify({status,trusted})});},
  customers: (params: Record<string, string | number | undefined> = {}) => apiRequest<PageResult<Record<string, unknown>>>(`/admin/customers${toQuery(params)}`),
  employees: (params: Record<string, string | number | undefined> = {}) => apiRequest<PageResult<Record<string, unknown>>>(`/admin/employees${toQuery(params)}`),
  accounts: (params: Record<string, string | number | undefined> = {}) => apiRequest<PageResult<ApiAccount>>(`/admin/accounts${toQuery(params)}`),
  branches: (params: Record<string, string | number | undefined> = {}) => apiRequest<PageResult<Record<string, unknown>>>(`/admin/branches${toQuery(params)}`),
  cards: (params: Record<string, string | number | undefined> = {}) => apiRequest<PageResult<Record<string, unknown>>>(`/admin/cards${toQuery(params)}`),
  loans: (params: Record<string, string | number | undefined> = {}) => apiRequest<PageResult<Record<string, unknown>>>(`/admin/loans${toQuery(params)}`),
  fraudCases: (params: Record<string, string | number | undefined> = {}) => apiRequest<PageResult<ApiTransaction>>(`/admin/fraud-reviews${toQuery(params)}`),
  auditLogs: (params: Record<string, string | number | undefined> = {}) => apiRequest<PageResult<Record<string, unknown>>>(`/admin/audit-logs${toQuery(params)}`),
  referenceData: () => apiRequest<Record<string, unknown[]>>("/admin/reference-data"),
  resolveDestination(accountNumber: string) {
    return apiRequest<TransferDestination | null>(`/transactions/destinations/${encodeURIComponent(accountNumber)}`);
  },
  requestTransferOtp(input: TransferOtpContext) {
    return apiRequest<{ challengeId: string; expiresIn: number; destinationMasked: string }>("/security/otp/request", {
      method: "POST", body: JSON.stringify(input),
    });
  },
  verifyTransferOtp(input: TransferOtpContext & { challengeId: string; code: string }) {
    return apiRequest<{ authorizationToken: string; expiresIn: number }>("/security/otp/verify", {
      method: "POST", body: JSON.stringify(input),
    });
  },
  async transfer(input: TransferInput): Promise<Transaction> {
    const result = await apiRequest<ApiTransaction>("/transactions/transfers", { method: "POST", body: JSON.stringify(input) });
    return presentTransaction(result);
  },
  createMovement(input:{type:"DEPOSIT"|"WITHDRAWAL"|"OPENING_BALANCE";debitAccountId:number;creditAccountId:number;amount:string;transactionCode:string;channel:"Counter"|"ATM"|"MobileBanking"|"InternetBanking"|"System";description?:string}){
    return apiRequest<ApiTransaction>("/transactions/account-movements",{method:"POST",body:JSON.stringify(input)});
  },
  payLoan(input:{loanId:number;scheduleId:number;sourceAccountId:number;internalCreditAccountId:number;amount:string;transactionCode:string}){
    return apiRequest<ApiTransaction>("/transactions/loan-payments",{method:"POST",body:JSON.stringify(input)});
  },
  resolveReview(reviewId: number, action: "APPROVE" | "REJECT", reason?: string) {
    return apiRequest<ApiTransaction>(`/transactions/reviews/${reviewId}`, {
      method: "POST", body: JSON.stringify({ action, reason }),
    });
  },
  managementCreate(resource: "branches"|"customers"|"employees"|"accounts"|"cards"|"loans", body:Record<string,unknown>) {
    return apiRequest<Record<string,unknown>>(`/management/${resource}`, {method:"POST",body:JSON.stringify(body)});
  },
  managementStatus(resource:"branches"|"customers"|"employees"|"accounts"|"cards",id:number,status:string,reason?:string){
    return apiRequest<Record<string,unknown>>(`/management/${resource}/${id}/status`,{method:"PATCH",body:JSON.stringify({status,reason})});
  },
  registerLogin(kind:"customers"|"employees",id:number,username:string,password:string){
    return apiRequest<Record<string,unknown>>(`/management/${kind}/${id}/login`,{method:"POST",body:JSON.stringify({username,password})});
  },
  approveLoan(id:number){return apiRequest<Record<string,unknown>>(`/management/loans/${id}/approve`,{method:"POST"});},
  reverseTransaction(id:number,transactionCode:string,reason:string){return apiRequest<ApiTransaction>(`/transactions/${id}/reversal`,{method:"POST",body:JSON.stringify({transactionCode,reason})});},
  labelTransaction(id:number,label:"FRAUD"|"LEGITIMATE"|"UNKNOWN",note?:string){return apiRequest<Record<string,unknown>>(`/management/transactions/${id}/fraud-label`,{method:"POST",body:JSON.stringify({label,note})});},
};
