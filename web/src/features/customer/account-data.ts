import type { HomeTransaction } from "./home-data";

export interface CustomerAccount {
  id: string;
  number: string;
  name: string;
  owner: string;
  description: string;
  type: "Thanh toán" | "Tiết kiệm" | "Thẻ";
  balance: number;
  status: "Đang hoạt động";
}

const demoAccounts: CustomerAccount[] = [
  { id: "payment", number: "1023 4567 8910", name: "Tài khoản thanh toán", owner: "Nguyễn Minh Anh", description: "Nguyễn Minh Anh", type: "Thanh toán", balance: 18_650_000, status: "Đang hoạt động" },
  { id: "savings", number: "1023 4567 8921", name: "Tài khoản tiết kiệm", owner: "Nguyễn Minh Anh", description: "Kỳ hạn 6 tháng", type: "Tiết kiệm", balance: 10_000_000, status: "Đang hoạt động" },
  { id: "card", number: "1023 4567 8932", name: "Tài khoản thẻ", owner: "Nguyễn Minh Anh", description: "Thẻ ghi nợ nội địa", type: "Thẻ", balance: 0, status: "Đang hoạt động" },
];

const demoAccountTransactions: HomeTransaction[] = [
  { id: "ACC-DEMO-001", time: "16/09/2026 14:32", description: "Chuyển tiền đến NGUYEN VAN B", amount: 500_000, direction: "out", kind: "transfer" },
  { id: "ACC-DEMO-002", time: "15/09/2026 09:15", description: "Thanh toán hóa đơn điện", amount: 312_000, direction: "out", kind: "bill" },
  { id: "ACC-DEMO-003", time: "14/09/2026 20:41", description: "Nhận tiền từ LE THI C", amount: 1_000_000, direction: "in", kind: "received" },
  { id: "ACC-DEMO-004", time: "14/09/2026 10:12", description: "Mua sắm tại Shopee", amount: 250_000, direction: "out", kind: "shopping" },
  { id: "ACC-DEMO-005", time: "13/09/2026 18:05", description: "Nạp tiền vào tài khoản", amount: 2_000_000, direction: "in", kind: "received" },
];

export function getCustomerAccountsDemo(customerId: string) {
  return customerId === "102498"
    ? { accounts: demoAccounts, transactions: demoAccountTransactions }
    : { accounts: [], transactions: [] };
}
