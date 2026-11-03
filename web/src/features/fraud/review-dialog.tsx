"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui";
import { TransactionRecordResult } from "@/components/transaction-result";
import { bankService } from "@/services/bank.service";
import type { presentFraudReview } from "@/lib/fraud-data";

export function ReviewDialog({
  review,
}: {
  review: ReturnType<typeof presentFraudReview>;
}) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [attempt, setAttempt] = useState<{
    action: "APPROVE" | "REJECT";
    reason?: string;
  } | null>(null);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: { action: "APPROVE" | "REJECT"; reason?: string }) =>
      bankService.resolveReview(review.reviewId, input),
    onSuccess: () => {
      void client.invalidateQueries({
        predicate: (q) =>
          /transactions|accounts|overview|customer|branch-reports/.test(
            String(q.queryKey[0]),
          ),
      });
    },
  });
  const submit = (action: "APPROVE" | "REJECT") => {
    if (mutation.isPending || mutation.isSuccess || !confirmed) return;
    const input = attempt ?? { action, reason: reason.trim() || undefined };
    setAttempt(input);
    mutation.mutate(input);
  };
  return (
    <>
      <button
        className="d4-view-button"
        onClick={() => {
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
      >
        {mutation.isSuccess ? (
          <TransactionRecordResult
            transaction={mutation.data}
            account={review.account}
          />
        ) : (
          <>
            <dl className="divide-y rounded-xl bg-slate-50 px-4">
              {[
                ["Mã giao dịch", review.transaction],
                ["Khách hàng", review.customer],
                ["Chi tiết", review.detail],
                ["Mức độ rủi ro", review.risk],
                ["RuleScore", review.ruleScore],
                ["Xác suất ML", review.mlProbability],
                ["Quyết định", review.decision],
                ["Trạng thái review", review.status],
                ["Người xử lý", review.assignee],
              ].map(([label, value]) => (
                <div
                  className="flex justify-between gap-4 py-3 text-sm"
                  key={label}
                >
                  <dt className="shrink-0 text-slate-500">{label}</dt>
                  <dd className="break-words text-right font-semibold">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {review.pending && (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-slate-600">
                  Duyệt hồ sơ sẽ kiểm tra lại số dư và điều kiện tài khoản trước
                  khi hạch toán. Giao dịch vẫn có thể thất bại nếu không đủ điều
                  kiện.
                </p>
                <label className="block text-sm font-semibold">
                  Lý do xử lý
                  <textarea
                    aria-label="Lý do xử lý"
                    maxLength={255}
                    value={reason}
                    disabled={!!attempt || mutation.isPending}
                    onChange={(e) => setReason(e.target.value)}
                    className="mt-2 w-full rounded-xl border p-3 font-normal"
                  />
                </label>
                <label className="flex items-start gap-2 text-sm">
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
                  <p role="alert" className="text-sm text-red-600">
                    {mutation.error.message} Thông tin và quyết định đã gửi được
                    giữ nguyên khi thử lại. Đóng và mở lại hồ sơ để kiểm tra
                    trạng thái mới nhất.
                  </p>
                )}
                <div className="flex flex-wrap justify-end gap-3">
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
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
