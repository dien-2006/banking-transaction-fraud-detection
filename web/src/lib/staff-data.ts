import { formatCurrency, formatDateTime } from "./presentation";
import type { ApiTransaction } from "@/services/bank.service";
import { customerStatuses, transactionTypes } from "./customer-data";

export const transactionStatusLabels = customerStatuses;
export const transactionTypeLabels = transactionTypes;
export const transactionRiskLabels: Record<string, string> = {
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  CRITICAL: "Rất cao",
};
export function presentTransaction(row: ApiTransaction) {
  return {
    id: row.transactioncode,
    customer:
      row.initiatedbycustomerid == null
        ? "—"
        : `KH #${row.initiatedbycustomerid}`,
    description:
      row.description || transactionTypeLabels[row.typecode] || row.typename,
    type: transactionTypeLabels[row.typecode] || row.typename || row.typecode,
    amount: Number(row.amount),
    currency: row.currency,
    amountText: formatCurrency(row.amount, row.currency),
    time: formatDateTime(row.transactiondate, "—"),
    status: transactionStatusLabels[row.status] || row.status,
    risk: transactionRiskLabels[row.risklevel ?? ""] || "Chưa đánh giá",
  };
}
export function transactionSummary(rows: ApiTransaction[]) {
  const groups = new Map<string, number>();
  for (const row of rows) {
    const label =
      transactionTypeLabels[row.typecode] || row.typename || row.typecode;
    groups.set(label, (groups.get(label) ?? 0) + 1);
  }
  return {
    total: rows.length,
    success: rows.filter((row) => row.status === "Success").length,
    pending: rows.filter((row) => row.status === "Pending").length,
    risky: rows.filter(
      (row) => row.risklevel === "HIGH" || row.risklevel === "CRITICAL",
    ).length,
    groups: Array.from(groups, ([label, count]) => ({ label, count })).sort(
      (a, b) => b.count - a.count,
    ),
  };
}
export function isVerified(value: unknown): boolean {
  return ["true", "verified", "approved", "đã xác minh"].includes(
    String(value).trim().toLocaleLowerCase("vi"),
  );
}
