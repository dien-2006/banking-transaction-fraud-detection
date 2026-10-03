export type Role = "admin" | "employee" | "customer";
export type RiskDecision = "ALLOW" | "REVIEW" | "BLOCK";
export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  subtitle: string;
  username?: string;
  employeeCode?: string;
  gender?: string;
  dateOfBirth?: string;
  phone?: string;
  email?: string;
  branchCode?: string;
  branchName?: string;
  hireDate?: string;
  lastLogin?: string;
  createdAt?: string;
  status?: "Active" | "Inactive" | "Blocked";
}
export interface Transaction {
  id: string; customer: string; type: "Chuyển khoản" | "Thanh toán" | "Nhận tiền";
  amount: number; time: string; status: "Thành công" | "Đang xử lý" | "Thất bại";
  risk: "Thấp" | "Trung bình" | "Cao";
}
export interface Stat { label: string; value: string; change: string; tone: "red" | "blue" | "green" | "orange"; }
