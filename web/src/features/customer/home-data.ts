// Presentation fixtures only. Never used for posting, balances, or risk decisions.
export interface HomeTransaction {
  id: string;
  time: string;
  description: string;
  amount: number;
  direction: "in" | "out";
  kind: "transfer" | "bill" | "shopping" | "received";
}

const demoHome = {
  accounts: [
    { id: "payment", name: "Tài khoản thanh toán", number: "1023 4567 8910", balance: 18_650_000 },
    { id: "savings", name: "Tài khoản tiết kiệm", number: "1023 4567 8921", balance: 10_000_000 },
  ],
  activeCards: 2,
  savingsCount: 2,
  growth: 8,
  transactions: [
    { id: "DEMO-001", time: "16/09/2024 14:32", description: "Chuyển tiền đến NGUYEN VAN B", amount: 500_000, direction: "out", kind: "transfer" },
    { id: "DEMO-002", time: "15/09/2024 09:15", description: "Thanh toán hóa đơn điện", amount: 312_000, direction: "out", kind: "bill" },
    { id: "DEMO-003", time: "14/09/2024 20:41", description: "Nhận tiền từ LE THI C", amount: 1_000_000, direction: "in", kind: "received" },
    { id: "DEMO-004", time: "14/09/2024 10:12", description: "Mua sắm tại Shopee", amount: 250_000, direction: "out", kind: "shopping" },
    { id: "DEMO-005", time: "13/09/2024 18:05", description: "Chuyển tiền đến TRAN VAN D", amount: 1_200_000, direction: "out", kind: "transfer" },
  ] satisfies HomeTransaction[],
};

// Do not reuse the administrator's cross-customer transaction list here.
export function getCustomerHomeDemo(customerId: string) {
  return customerId === "102498" ? demoHome : {
    accounts: [], activeCards: 0, savingsCount: 0, growth: 0, transactions: [],
  };
}
