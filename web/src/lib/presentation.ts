export const BANK_TIME_ZONE = "Asia/Ho_Chi_Minh";
function bankDate(value: string | number | Date): Date {
  if (value instanceof Date) return value;
  const text =
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)
      ? value.replace(" ", "T") + "+07:00"
      : value;
  return new Date(text);
}
export function dateKey(value: string | number | Date): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value;
  const date = bankDate(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("sv-SE", { timeZone: BANK_TIME_ZONE });
}
export function formatDateTime(
  value: unknown,
  fallback = "Chưa cập nhật",
): string {
  if (value == null || value === "") return fallback;
  const date = bankDate(String(value));
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleString("vi-VN", { timeZone: BANK_TIME_ZONE });
}
export function formatTime(value: unknown, fallback = "Chưa cập nhật"): string {
  if (value == null || value === "") return fallback;
  const date = bankDate(String(value));
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleTimeString("vi-VN", {
        timeZone: BANK_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
      });
}
export function formatDate(value: unknown, fallback = "Chưa cập nhật"): string {
  if (value == null || value === "") return fallback;
  const date = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(String(value));
  return date ? `${date[3]}/${date[2]}/${date[1]}` : fallback;
}
export function formatCurrency(
  value: string | number,
  currency = "VND",
): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  if (currency === "VND")
    return amount.toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + " ₫";
  try {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("vi-VN")} ${currency}`;
  }
}
