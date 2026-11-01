/** Summarize the full authorized result set, independently of the visible page. */
export function summarizeLoans(rows: Record<string, unknown>[]) {
  const summary = { outstanding: 0, active: 0, pending: 0, overdue: 0 };
  const products = new Map<string, number>();
  for (const row of rows) {
    const amount = Number(row.outstandingamount ?? 0);
    if (!Number.isFinite(amount))
      throw new Error("Dư nợ khoản vay không hợp lệ.");
    summary.outstanding += amount;
    if (row.status === "Active") summary.active += 1;
    if (row.status === "Pending") summary.pending += 1;
    if (row.status === "Overdue") summary.overdue += 1;
    const name = String(row.loantypename ?? "Khác");
    products.set(name, (products.get(name) ?? 0) + amount);
  }
  return {
    ...summary,
    products: Array.from(products, ([name, amount]) => ({ name, amount })).sort(
      (a, b) => b.amount - a.amount,
    ),
  };
}
