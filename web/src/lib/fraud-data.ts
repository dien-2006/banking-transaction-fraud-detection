import { loadAllPages } from "./paged-data";
import { dateKey, formatCurrency, formatDate, formatDateTime, formatTime } from "./presentation";
import { transactionTypes } from "./customer-data";
import type { ApiFraudReview, PageResult } from "@/services/bank.service";

export const riskLabels: Record<string, string> = {
  CRITICAL: "Rất cao",
  HIGH: "Cao",
  MEDIUM: "Trung bình",
  LOW: "Thấp",
};
export const reviewLabels: Record<string, string> = {
  OPEN: "Chờ thẩm định",
  IN_REVIEW: "Đang thẩm định",
  APPROVED: "Đã phê duyệt",
  REJECTED: "Đã từ chối",
  CLOSED: "Đã đóng",
};

export function presentFraudReview(row: ApiFraudReview) {
  const hasReview = row.reviewcaseid != null && Number(row.reviewcaseid) > 0;
  const blocked = row.decision === "BLOCK";
  const pending = hasReview && (row.reviewstatus === "OPEN" || row.reviewstatus === "IN_REVIEW");
  const needsReconciliation = (pending && (row.status !== "Pending" || row.decision !== "REVIEW"))
    || (row.reviewstatus === "REJECTED" && row.status === "Success")
    || (blocked && row.status === "Success")
    || (!hasReview && row.decision === "REVIEW");
  const timestamp = row.reviewcreatedat || row.alert_at || row.transactiondate;
  const amount = formatCurrency(row.amount, row.currency || "VND");
  const probability =
    row.modelprobability == null
      ? "Chưa đánh giá"
      : `${(Number(row.modelprobability) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
  return {
    id: hasReview ? `RVW${row.reviewcaseid}` : `RSK${row.transactionid}`,
    reviewId: hasReview ? row.reviewcaseid : null,
    hasReview,
    blocked,
    transaction: row.transactioncode,
    transactionStatus: row.status,
    time: formatDateTime(timestamp, "—"),
    date: formatDate(dateKey(timestamp), "—"),
    clock: formatTime(timestamp, "—"),
    customer:
      row.initiatedbycustomerid == null
        ? "—"
        : "Chưa tra được tên",
    customerId: row.initiatedbycustomerid == null ? null : String(row.initiatedbycustomerid),
    customerCode: "—",
    accountId: row.sourceaccountid == null ? null : String(row.sourceaccountid),
    account: row.sourceaccountid == null ? "—" : `ID tài khoản: ${row.sourceaccountid}`,
    type: transactionTypes[row.typecode] || row.typename || row.typecode || "—",
    detail: `${row.transactioncode} · ${amount}${row.description ? ` · ${row.description}` : ""}`,
    risk: riskLabels[row.risklevel ?? ""] ?? "Chưa đánh giá",
    status: hasReview
      ? (reviewLabels[row.reviewstatus ?? ""] ?? row.reviewstatus ?? "Chưa ghi nhận")
      : blocked ? "Bị chặn (BLOCK)" : "Chưa có hồ sơ review",
    reviewStatus: row.reviewstatus,
    reviewReason: row.reviewreason?.trim() || null,
    reviewedAt: formatDateTime(row.reviewedat, "Chưa ghi nhận"),
    assignee:
      !hasReview ? "Không áp dụng" : row.revieweruserid == null
        ? "Chưa phân công"
        : `ID người xử lý: ${row.revieweruserid}`,
    ruleScore: row.rulescore == null ? "Chưa đánh giá" : String(row.rulescore),
    mlProbability: probability,
    decision: row.decision ?? "Chưa đánh giá",
    pending,
    canResolve: hasReview && pending && row.status === "Pending" && row.decision === "REVIEW",
    needsReconciliation,
    createdAt: timestamp,
  };
}

export async function loadFraudReviews(
  loadPage: (params: {
    page: number;
    pageSize: number;
  }) => Promise<PageResult<ApiFraudReview>>,
) {
  return (await loadAllPages(loadPage, (row) => row.reviewcaseid != null
    ? `review:${row.reviewcaseid}` : `transaction:${row.transactionid}`)).map(presentFraudReview);
}
