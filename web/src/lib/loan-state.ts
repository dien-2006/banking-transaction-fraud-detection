import { recordStatus } from "./record-status";

/** A pending loan can already have an authorized disbursement awaiting risk review. */
export function loanState(row: Record<string, unknown>) {
  const status = String(row.status ?? "");
  const disbursement = row.disbursement as Record<string, unknown> | null | undefined;
  const reviewId = disbursement?.reviewcaseid;
  const review = status === "Pending" && disbursement?.status === "Pending" &&
    disbursement?.decision === "REVIEW";
  let label = recordStatus(status, "loan").label;
  if (status === "Pending" && disbursement) {
    if (review) label = "Chờ xác nhận giải ngân";
    else if (disbursement.status === "Pending") label = "Đang giải ngân";
    else if (disbursement.status === "Failed") label = "Giải ngân thất bại";
    else if (disbursement.status === "Cancelled") label = "Giải ngân bị từ chối";
    else if (disbursement.status === "Success") label = "Cần đối soát giải ngân";
  }
  return { label, tone: recordStatus(status, "loan").tone,
    reviewId: review && /^[1-9]\d*$/.test(String(reviewId)) ? String(reviewId) : "" };
}
