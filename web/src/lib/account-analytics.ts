import { dateKey } from "./presentation";
import type { ApiAccount, ApiTransaction } from "@/services/bank.service";
import { accountKind, transactionView } from "./customer-data";

export function accountBalanceSummary(accounts: ApiAccount[]) {
  const active = accounts.filter(
    (row) => row.status === "Active" && row.currency === "VND",
  );
  const groups = (["Thanh toán", "Tiết kiệm", "Thẻ"] as const).map((type) => {
    const items = active.filter((row) => accountKind(row) === type);
    return {
      type,
      count: items.length,
      balance: items.reduce((sum, row) => sum + Number(row.balance), 0),
    };
  });
  return {
    groups,
    count: active.length,
    total: groups.reduce((sum, group) => sum + group.balance, 0),
  };
}

/** Successful VND inflows/outflows; transfers between owned accounts have no net flow. */
export function accountActivity(
  transactions: ApiTransaction[],
  accounts: ApiAccount[],
) {
  const days = new Map<
    string,
    { day: string; incoming: number; outgoing: number }
  >();
  for (const transaction of transactions) {
    if (transaction.status !== "Success" || transaction.currency !== "VND")
      continue;
    const { direction } = transactionView(transaction, accounts);
    if (direction !== "in" && direction !== "out") continue;
    const day = dateKey(transaction.transactiondate);
    const row = days.get(day) ?? { day, incoming: 0, outgoing: 0 };
    if (direction === "in") row.incoming += Number(transaction.amount);
    else row.outgoing += Number(transaction.amount);
    days.set(day, row);
  }
  return [...days.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-7);
}
