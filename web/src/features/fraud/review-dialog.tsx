"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui";
import { TransactionRecordResult } from "@/components/transaction-result";
import { RecordStatus } from "@/components/record-status";
import { bankService } from "@/services/bank.service";
import type { presentFraudReview } from "@/lib/fraud-data";
import "./review-dialog.css";

export function ReviewDialog({
  review,
  autoOpen = false,
}: {
  review: ReturnType<typeof presentFraudReview>;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [attempt, setAttempt] = useState<{
    action: "APPROVE" | "REJECT";
    reason?: string;
  } | null>(null);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: { action: "APPROVE" | "REJECT"; reason?: string }) => {
      if (!review.canResolve || review.reviewId == null) {
        throw new Error("Cảnh báo này không có hồ sơ review được phép xử lý.");
      }
      return bankService.resolveReview(review.reviewId, input);
    },
    onSuccess: () => {
      void client.invalidateQueries({
        predicate: (q) =>
          /transactions|accounts|overview|customer/.test(
            String(q.queryKey[0]),
          ),
      });
    },
  });
  const submit = (action: "APPROVE" | "REJECT") => {
    if (mutation.isPending || mutation.isSuccess || !confirmed || !review.canResolve) return;
    const input = attempt ?? { action, reason: reason.trim() || undefined };
    setAttempt(input);
    mutation.mutate(input);
  };
  return (
    <>
      <button
        className="d4-view-button"
        onClick={() => {
          mutation.reset();
          setAttempt(null);
          setReason("");
          setConfirmed(false);
          setOpen(true);
          void client.invalidateQueries({ queryKey: ["fraud-reviews-old-ui"] });
        }}
      >
        Xem
      </button>
      <Modal
        open={open}
        onOpenChange={(value) => {
          if (!mutation.isPending) {
            setOpen(value);
            if (!value)
              void client.invalidateQueries({
                queryKey: ["fraud-reviews-old-ui"],
              });
          }
        }}
        title={`Chi tiết cảnh báo ${review.id}`}
        className={`fraud-review-dialog${mutation.isSuccess ? " fraud-review-result-dialog" : ""}`}
      >
        {mutation.isSuccess ? (
          <div className="review-dialog-scroll">
            <TransactionRecordResult
              transaction={mutation.data}
              account={review.account}
              staffDetails={[["Khách hàng", review.customer], ["Mã khách hàng", review.customerCode], ...(attempt ? [[
                attempt.action === "REJECT" ? "Lý do từ chối" : "Lý do phê duyệt",
                attempt.reason || "Không ghi nhận lý do xử lý.",
              ] as const] : [])]}
            />
          </div>
        ) : (
          <>
            <div className="review-dialog-scroll review-dialog-grid">
            <section className="review-detail-section">
            <h3>Thông tin giao dịch</h3>
            <dl className="review-info-grid">
              {[
                ["Mã giao dịch", review.transaction],
                ["Khách hàng", review.customer],
                ["Mã khách hàng", review.customerCode],
                ["Tài khoản", review.account],
                ["Thời gian", review.time],
                ["Trạng thái cảnh báo", review.status],
                ["Người xử lý", review.assignee],
              ].map(([label, value]) => (
                <div
                  className="review-info-item"
                  key={label}
                >
                  <dt>{label}</dt>
                  <dd>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="review-transaction-status">
              <span>Trạng thái giao dịch</span>
              <RecordStatus status={review.transactionStatus} />
            </div>
            <div className="review-description"><h4>Nội dung giao dịch</h4><p>{review.detail}</p></div>
            </section>
            <section className="review-detail-section review-risk-section">
              <div className="review-risk-heading"><h3>Đánh giá rủi ro</h3><span>{review.risk}</span></div>
              <dl className="review-risk-metrics">
                {[["RuleScore", review.ruleScore], ["Xác suất ML", review.mlProbability], ["Quyết định", review.decision]].map(([label, value]) => (
                  <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                ))}
              </dl>
            {!review.hasReview && <section className="review-resolution-summary" aria-label="Thông tin cảnh báo Risk">
              <h4>{review.blocked ? "Giao dịch đã bị chặn bởi Risk" : "Chưa có hồ sơ review"}</h4>
              <p>{review.blocked
                ? "BLOCK không tạo hồ sơ chờ phê duyệt. Không được ghi nợ/ghi có giao dịch này; cảnh báo chỉ dùng để tra cứu và đối soát."
                : "Giao dịch có quyết định REVIEW nhưng chưa có hồ sơ xử lý. Cần kiểm tra hoặc tạo hồ sơ thủ công khi giao dịch còn Pending."}</p>
            </section>}
            {review.hasReview && (!review.pending || review.reviewReason) && (
              <section className="review-resolution-summary" aria-label="Thông tin xử lý hồ sơ">
                <h4>{review.reviewStatus === "REJECTED" ? "Lý do từ chối" : review.reviewStatus === "APPROVED" ? "Lý do phê duyệt" : "Ghi chú xử lý"}</h4>
                <p>{review.reviewReason || "Không ghi nhận lý do xử lý."}</p>
                <small>Thời gian xử lý: {review.reviewedAt}</small>
              </section>
            )}
            {review.canResolve && (
              <div className="review-resolution">
                <p className="review-processing-note">
                  Duyệt hồ sơ sẽ kiểm tra lại số dư và điều kiện tài khoản trước
                  khi hạch toán. Giao dịch vẫn có thể thất bại nếu không đủ điều
                  kiện.
                </p>
                <label className="review-reason-label">
                  Lý do xử lý
                  <textarea
                    aria-label="Lý do xử lý"
                    maxLength={255}
                    rows={3}
                    value={reason}
                    disabled={!!attempt || mutation.isPending}
                    onChange={(e) => setReason(e.target.value)}
                    className="review-reason-input"
                  />
                </label>
              </div>
            )}
            </section>
            </div>
            {review.canResolve && (
              <footer className="review-dialog-footer">
                <label className="review-confirmation">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={mutation.isPending}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  Tôi đã kiểm tra thông tin và xác nhận quyết định xử lý hồ sơ
                  này.
                </label>
                {mutation.isError && (
                  <p role="alert" className="review-action-error">
                    {mutation.error.message} Thông tin và quyết định đã gửi được
                    giữ nguyên khi thử lại. Đóng và mở lại hồ sơ để kiểm tra
                    trạng thái mới nhất.
                  </p>
                )}
                <div className="review-action-buttons">
                  {(!attempt || attempt.action === "REJECT") && (
                    <button
                      className="btn-secondary"
                      disabled={!confirmed || mutation.isPending}
                      onClick={() => submit("REJECT")}
                    >
                      {mutation.isPending
                        ? "Đang xử lý…"
                        : attempt
                          ? "Thử lại từ chối"
                          : "Từ chối giao dịch"}
                    </button>
                  )}
                  {(!attempt || attempt.action === "APPROVE") && (
                    <button
                      className="btn-primary"
                      disabled={!confirmed || mutation.isPending}
                      onClick={() => submit("APPROVE")}
                    >
                      {mutation.isPending
                        ? "Đang xử lý…"
                        : attempt
                          ? "Thử lại phê duyệt"
                          : "Duyệt giao dịch"}
                    </button>
                  )}
                </div>
              </footer>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
