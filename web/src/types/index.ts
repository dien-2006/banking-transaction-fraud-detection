export type Role = "admin" | "employee" | "customer";
export type RiskDecision = "ALLOW" | "REVIEW" | "BLOCK";
export interface SessionUser {
  id: string;
  customerId?: number;
  userId?: number;
  employeeId?: number;
  deviceId?: number;
  branchId?: number;
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
  id: string;
  customer: string;
  type: string;
  amount: number;
  time: string;
  status: string;
  risk: string;
}
