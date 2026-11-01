export type AnalyticsDataset =
  "transactions" | "risk" | "reviews" | "models" | "logins" | "loans";
export type AnalyticsRow = Record<string, unknown>;
export type AnalyticsState = {
  rows: AnalyticsRow[];
  loading: boolean;
  error: string | null;
  truncated: boolean;
};
export type InsightsData = Record<AnalyticsDataset, AnalyticsState>;
export const analyticsDatasets: Record<AnalyticsDataset, string> = {
  transactions: "Giao dịch",
  risk: "Đánh giá rủi ro",
  reviews: "Hiệu suất review",
  models: "Thống kê model theo nhãn",
  logins: "Đăng nhập",
  loans: "Thanh toán khoản vay",
};

export function analyticsDay(value: unknown): string {
  const text = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}
export function filterAnalyticsRows(
  rows: AnalyticsRow[],
  from: string,
  to: string,
): AnalyticsRow[] {
  if (!from && !to) return rows;
  return rows.filter((row) => {
    const day = analyticsDay(row.full_date);
    return day && (!from || day >= from) && (!to || day <= to);
  });
}
export function sumMetric(rows: AnalyticsRow[], field: string): number {
  return rows.reduce((sum, row) => {
    const value = Number(row[field]);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}
export function groupMetric(
  rows: AnalyticsRow[],
  group: string,
  metric: string,
) {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const key = String(row[group] ?? "Chưa xác định");
    const value = Number(row[metric]);
    if (Number.isFinite(value)) sums.set(key, (sums.get(key) ?? 0) + value);
  }
  return Array.from(sums, ([name, value]) => ({ name, value })).sort(
    (a, b) => b.value - a.value || a.name.localeCompare(b.name),
  );
}
export function dailyMetrics(rows: AnalyticsRow[], metrics: string[]) {
  const sums = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const day = analyticsDay(row.full_date);
    if (!day) continue;
    const value =
      sums.get(day) ?? Object.fromEntries(metrics.map((metric) => [metric, 0]));
    for (const metric of metrics) {
      const numeric = Number(row[metric]);
      if (Number.isFinite(numeric)) value[metric] += numeric;
    }
    sums.set(day, value);
  }
  return Array.from(sums, ([day, values]) => ({ day, ...values })).sort(
    (a, b) => a.day.localeCompare(b.day),
  );
}
export function analyticsCsv(rows: AnalyticsRow[], columns: string[]): string {
  const quote = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return (
    "\ufeff" +
    [
      columns.map(quote).join(","),
      ...rows.map((row) => columns.map((key) => quote(row[key])).join(",")),
    ].join("\r\n")
  );
}
