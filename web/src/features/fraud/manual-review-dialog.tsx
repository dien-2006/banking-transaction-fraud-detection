"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui";
import { ApiError } from "@/services/api.client";
import { bankService } from "@/services/bank.service";

export function ManualReviewDialog({ onCreated }: { onCreated: (reviewId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [transactionCode, setTransactionCode] = useState("");
  const [reason, setReason] = useState("");
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: bankService.createFraudReview,
    retry: false,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["fraud-reviews-old-ui"] });
      void client.invalidateQueries({ queryKey: ["audit-logs"] });
    },
  });
  const uncertain = mutation.isError && (!(mutation.error instanceof ApiError) || mutation.error.status >= 500);
  const locked = mutation.isPending || uncertain;
  return <>
    <button className="btn-primary h-8" onClick={() => {
      mutation.reset(); setTransactionCode(""); setReason(""); setOpen(true);
    }}><Plus size={14} />Tạo cảnh báo thủ công</button>
    <Modal open={open} onOpenChange={(value) => { if (!mutation.isPending) setOpen(value); }}
      title="Tạo cảnh báo thủ công"
      description="Tạo hồ sơ cho giao dịch đang chờ xử lý có quyết định REVIEW. Mã cảnh báo được cấp tự động.">
      {mutation.isSuccess ? <div className="space-y-4">
        <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">
          {mutation.data.reused ? "Giao dịch đã có hồ sơ" : "Đã tạo cảnh báo"}: <strong>RVW{mutation.data.reviewId}</strong>.
          {mutation.data.reused && " Hệ thống giữ nguyên hồ sơ và lý do đã có."}
        </p>
        <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setOpen(false)}>Đóng</button>
          <button className="btn-primary" onClick={() => { setOpen(false); onCreated(mutation.data.reviewId); }}>Xem hồ sơ</button></div>
      </div> : <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        if (mutation.isPending) return;
        mutation.mutate(uncertain ? mutation.variables! : { transactionCode: transactionCode.trim(), reason: reason.trim() });
      }}>
        <label className="block text-sm font-semibold">Mã giao dịch *
          <input className="field mt-2 w-full" required maxLength={40} disabled={locked}
            value={transactionCode} onChange={(event) => setTransactionCode(event.target.value)}
            placeholder="Nhập chính xác mã giao dịch" /></label>
        <label className="block text-sm font-semibold">Lý do cảnh báo *
          <textarea className="field mt-2 min-h-28 w-full" required maxLength={255} disabled={locked}
            value={reason} onChange={(event) => setReason(event.target.value)}
            placeholder="Mô tả lý do cần kiểm tra giao dịch" /></label>
        <p className="text-xs text-slate-500">Hồ sơ đã tồn tại sẽ được dùng lại. Việc tạo cảnh báo không thay đổi số dư hoặc quyết định rủi ro.</p>
        {mutation.isError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-red-600">
          {uncertain ? "Chưa xác định được kết quả. Thử lại để kiểm tra hoặc nhận lại hồ sơ đã tạo." : mutation.error.message}
        </p>}
        <footer className="flex justify-end gap-2 border-t pt-4">
          <button type="button" className="btn-secondary" disabled={mutation.isPending} onClick={() => setOpen(false)}>Hủy</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending || (!uncertain && (!transactionCode.trim() || !reason.trim()))}>
            {mutation.isPending ? "Đang tạo…" : uncertain ? "Thử lại" : "Tạo cảnh báo"}</button>
        </footer>
      </form>}
    </Modal>
  </>;
}
