export type RecordDomain =
  "general" | "account" | "card" | "loan" | "transaction";
export const recordStatusLabels: Record<string, string> = {
  Active: "Đang hoạt động",
  Frozen: "Tạm phong tỏa",
  Closed: "Đã đóng",
  Inactive: "Ngừng hoạt động",
  Blocked: "Đã khóa",
  Expired: "Hết hạn",
  Success: "Thành công",
  Pending: "Đang xử lý",
  Failed: "Thất bại",
  Cancelled: "Đã hủy",
  Paid: "Đã thanh toán",
  Partial: "Thanh toán một phần",
  Overdue: "Quá hạn",
};
export const loanStatusLabels: Record<string, string> = {
  Active: "Đang trả nợ",
  Pending: "Chờ phê duyệt",
  Paid: "Đã tất toán",
  Overdue: "Quá hạn",
  Cancelled: "Đã hủy",
};
export function recordStatus(status: string, domain: RecordDomain = "general") {
  const tone = ["Active", "Success", "Paid"].includes(status)
    ? "good"
    : ["Failed", "Cancelled", "Blocked", "Expired", "Overdue"].includes(status)
      ? "bad"
      : ["Pending", "Partial", "Frozen"].includes(status)
        ? "waiting"
        : "neutral";
  return {
    label:
      (domain === "loan" ? loanStatusLabels[status] : undefined) ??
      recordStatusLabels[status] ??
      (status || "Chưa cập nhật"),
    tone,
  };
}
