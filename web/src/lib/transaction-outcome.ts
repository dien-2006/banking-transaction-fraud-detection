export type TransactionOutcome =
  "success" | "failed" | "pending" | "cancelled" | "rejected" | "unknown";

export function transactionOutcome(
  status?: string,
  errorStatus?: number,
): TransactionOutcome {
  if (status === "Success" || status === "Thành công") return "success";
  if (status === "Failed" || status === "Thất bại") return "failed";
  if (status === "Pending" || status === "Đang xử lý") return "pending";
  if (status === "Cancelled" || status === "Đã hủy") return "cancelled";
  if (errorStatus && errorStatus >= 400 && errorStatus < 500) return "rejected";
  return "unknown";
}

export const outcomePresentation = {
  success: {
    label: "Thành công",
    title: "Giao dịch thành công",
    message:
      "Giao dịch đã được hạch toán thành công. Bạn có thể lưu thông tin và kiểm tra lại trong lịch sử.",
  },
  failed: {
    label: "Thất bại",
    title: "Giao dịch không thành công",
    message:
      "Hệ thống ghi nhận giao dịch thất bại. Kiểm tra chi tiết và lịch sử tài khoản trước khi thực hiện lệnh khác.",
  },
  pending: {
    label: "Đang xử lý",
    title: "Giao dịch đang chờ xử lý",
    message:
      "Đang chờ kiểm tra, tiền chưa được hạch toán. Theo dõi trạng thái trong lịch sử; không gửi thêm một lệnh mới cho cùng yêu cầu.",
  },
  cancelled: {
    label: "Đã hủy",
    title: "Giao dịch đã bị hủy",
    message:
      "Giao dịch không được hoàn tất. Kiểm tra thông tin và trạng thái tài khoản trong lịch sử giao dịch.",
  },
  rejected: {
    label: "Yêu cầu bị từ chối",
    title: "Yêu cầu chưa được chấp nhận",
    message:
      "Hệ thống đã từ chối yêu cầu này. Xem lý do bên dưới và kiểm tra thông tin trước khi thử lại.",
  },
  unknown: {
    label: "Chưa xác định",
    title: "Chưa xác định được kết quả giao dịch",
    message:
      "Chưa nhận được kết quả cuối cùng. Kiểm tra lịch sử hoặc thử lại đúng lệnh đã gửi; không tạo lệnh mới khi chưa xác định được kết quả.",
  },
} satisfies Record<
  TransactionOutcome,
  { label: string; title: string; message: string }
>;

/** A 200 response alone is not proof that a financial transaction completed. */
export function isFinancialTransactionResult(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(Number(row.transactionid)) &&
    Number(row.transactionid) > 0 &&
    typeof row.transactioncode === "string" &&
    !!row.transactioncode.trim() &&
    ["Success", "Failed", "Pending", "Cancelled"].includes(
      String(row.status),
    ) &&
    (typeof row.amount === "string" || typeof row.amount === "number") &&
    Number.isFinite(Number(row.amount)) &&
    Number(row.amount) > 0
  );
}
