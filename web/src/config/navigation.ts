import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  CircleUserRound,
  CreditCard,
  FileClock,
  HandCoins,
  House,
  Landmark,
  LayoutDashboard,
  ListChecks,
  ShieldAlert,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";
import type { Role } from "@/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const navigation: Record<Role, NavItem[]> = {
  admin: [
    ["Tổng quan", "/admin", LayoutDashboard],
    ["Chi nhánh", "/admin/branches", Building2],
    ["Nhân viên", "/admin/employees", BriefcaseBusiness],
    ["Khách hàng", "/admin/customers", Users],
    ["Tài khoản", "/admin/accounts", Landmark],
    ["Giao dịch", "/admin/transactions", ListChecks],
    ["Khoản vay", "/admin/loans", HandCoins],
    ["Thẻ", "/admin/cards", CreditCard],
    ["Fraud & Review", "/admin/fraud", ShieldAlert],
    ["D4 Insights", "/admin/insights", Sparkles],
    ["Nhật ký hoạt động", "/admin/audit-logs", FileClock],
  ].map(([label, href, icon]) => ({ label, href, icon })) as NavItem[],
  employee: [
    ["Tổng quan", "/employee", LayoutDashboard],
    ["Khách hàng", "/employee/customers", Users],
    ["Tài khoản", "/employee/accounts", Landmark],
    ["Giao dịch", "/employee/transactions", ListChecks],
    ["Khoản vay", "/employee/loans", HandCoins],
    ["Thẻ", "/employee/cards", CreditCard],
    ["Fraud & Review", "/employee/fraud", ShieldAlert],
    ["Thông báo", "/employee/notifications", Bell],
    ["Báo cáo chi nhánh", "/employee/reports", Sparkles],
    ["Hồ sơ cá nhân", "/employee/profile", CircleUserRound],
  ].map(([label, href, icon]) => ({ label, href, icon })) as NavItem[],
  customer: [
    ["Trang chủ", "/customer", House],
    ["Tài khoản của tôi", "/customer/accounts", WalletCards],
    ["Chuyển tiền", "/customer/transfer", HandCoins],
    ["Lịch sử giao dịch", "/customer/transactions", ListChecks],
    ["Khoản vay của tôi", "/customer/loans", Landmark],
    ["Thẻ của tôi", "/customer/cards", CreditCard],
    ["Thông báo", "/customer/notifications", Bell],
    ["Hồ sơ cá nhân", "/customer/profile", CircleUserRound],
  ].map(([label, href, icon]) => ({ label, href, icon })) as NavItem[],
};

export const roleLabels: Record<Role, string> = {
  admin: "Quản trị hệ thống",
  employee: "Nhân viên ngân hàng",
  customer: "Khách hàng D4 Bank",
};
export function isRole(value: string): value is Role {
  return value === "admin" || value === "employee" || value === "customer";
}
