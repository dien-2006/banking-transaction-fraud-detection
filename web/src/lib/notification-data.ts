const labels: Record<string, [string, string]> = {
  TRANSACTION_COMPLETED: [
    "Giao dịch thành công",
    "Giao dịch đã được hoàn tất.",
  ],
  TRANSACTION_FAILED: ["Giao dịch thất bại", "Giao dịch không thể hoàn tất."],
  TRANSACTION_BLOCKED: [
    "Giao dịch bị chặn",
    "Hệ thống kiểm soát rủi ro đã chặn giao dịch.",
  ],
  TRANSACTION_UNDER_REVIEW: [
    "Giao dịch đang được kiểm tra",
    "Giao dịch đang chờ nhân viên kiểm tra.",
  ],
  TRANSACTION_REJECTED: [
    "Giao dịch bị từ chối",
    "Nhân viên đã từ chối giao dịch sau khi kiểm tra.",
  ],
};
export function notificationText(type: unknown): [string, string] {
  const code = String(type ?? "");
  return (
    labels[code] ?? [
      "Thông báo D4 Bank",
      code.replaceAll("_", " ") || "Cập nhật từ D4 Bank",
    ]
  );
}

/** IDs are emitted by list_employee_notifications; never parse human-readable text. */
export function staffNotificationHref(
  item: { id: string; type: string },
  role: "admin" | "employee",
): string | null {
  const review = item.type === "fraud" && /^review-([1-9]\d*)$/.exec(item.id);
  if (review) return `/${role}/fraud?reviewId=${review[1]}`;
  const loan = item.type === "loan" && /^loan-([1-9]\d*)$/.exec(item.id);
  if (loan) return `/${role}/loans?loanId=${loan[1]}`;
  return null;
}
