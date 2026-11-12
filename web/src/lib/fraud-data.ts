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
  const pending = row.reviewstatus === "OPEN" || row.reviewstatus === "IN_REVIEW";
  const needsReconciliation = (pending && (row.status !== "Pending" || row.decision !== "REVIEW"))
    || (row.reviewstatus === "REJECTED" && row.status === "Success");
  const timestamp = row.reviewcreatedat || row.transactiondate;
  const amount = formatCurrency(row.amount, row.currency || "VND");
  const probability =
    row.modelprobability == null
      ? "Chưa đánh giá"
      : `${(Number(row.modelprobability) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
  return {
    id: `RVW${row.reviewcaseid}`,
    reviewId: row.reviewcaseid,
    transaction: row.transactioncode,
    transactionStatus: row.status,
    time: formatDateTime(timestamp, "—"),
    date: formatDate(dateKey(timestamp), "—"),
    clock: formatTime(timestamp, "—"),
    customer:
      row.initiatedbycustomerid == null
        ? "—"
        : `KH #${row.initiatedbycustomerid}`,
    account: row.sourceaccountid == null ? "—" : `TK #${row.sourceaccountid}`,
    type: transactionTypes[row.typecode] || row.typename || row.typecode || "—",
    detail: `${row.transactioncode} · ${amount}${row.description ? ` · ${row.description}` : ""}`,
    risk: riskLabels[row.risklevel ?? ""] ?? "Chưa đánh giá",
    status: reviewLabels[row.reviewstatus] ?? row.reviewstatus,
    reviewStatus: row.reviewstatus,
    reviewReason: row.reviewreason?.trim() || null,
    reviewedAt: formatDateTime(row.reviewedat, "Chưa ghi nhận"),
    assignee:
      row.revieweruserid == null
        ? "Chưa phân công"
        : `User #${row.revieweruserid}`,
    ruleScore: row.rulescore == null ? "Chưa đánh giá" : String(row.rulescore),
    mlProbability: probability,
    decision: row.decision ?? "Chưa đánh giá",
    pending,
    canResolve: pending && row.status === "Pending" && row.decision === "REVIEW",
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
  return (await loadAllPages(loadPage, (row) => row.reviewcaseid)).map(
    presentFraudReview,
  );
}
