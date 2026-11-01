"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useSessionUser } from "@/components/session-context";
import { Modal } from "@/components/ui";
import { loadAllPages } from "@/lib/paged-data";
import { formatCurrency, formatDateTime } from "@/lib/presentation";
import { TransactionResult } from "@/components/transaction-result";
import { useRecipientVerification } from "@/features/transfer/use-recipient-verification";
import {
  bankService,
  type CounterTransferInput,
} from "@/services/bank.service";
import { ApiError } from "@/services/api.client";

export function StaffTransferDialog({ onCreated }: { onCreated: () => void }) {
  const user = useSessionUser(),
    client = useQueryClient();
  const [open, setOpen] = useState(false),
    [sourceId, setSourceId] = useState(""),
    [customerId, setCustomerId] = useState(""),
    [recipient, setRecipient] = useState("");
  const [error, setError] = useState(""),
    [payload, setPayload] = useState<CounterTransferInput | null>(null),
    [sent, setSent] = useState(false);
  const accounts = useQuery({
    queryKey: ["counter-accounts", user.role, user.id, user.branchId],
    enabled: open,
    queryFn: () =>
      loadAllPages(
        bankService.accounts,
        (row) => `${row.accountid}:${row.customerid ?? ""}`,
      ),
  });
  const sources = [
    ...new Map(
      (accounts.data ?? [])
        .filter(
          (a) =>
            a.accountcategory === "CUSTOMER" &&
            a.status === "Active" &&
            a.currency === "VND" &&
            (user.role !== "employee" || a.branchid === user.branchId),
        )
        .map((a) => [a.accountid, a]),
    ).values(),
  ];
  const source = sources.find((a) => a.accountid === Number(sourceId));
  const holders = useQuery({
    queryKey: ["counter-holders", user.role, user.id, user.branchId, sourceId],
    enabled: open && !!source,
    queryFn: () => bankService.counterTransferHolders(Number(sourceId)),
  });
  const verification = useRecipientVerification(
    recipient.trim(),
    Number(sourceId),
    open && !!source && !payload,
  );
  const mutation = useMutation({
    mutationFn: bankService.counterTransfer,
    onSuccess: () => {
      onCreated();
      void client.invalidateQueries({
        predicate: (q) =>
          /accounts|overview|branch-reports/.test(String(q.queryKey[0])),
      });
    },
    onError: (caught) => {
      if (
        caught instanceof ApiError &&
        caught.status >= 400 &&
        caught.status < 500
      )
        setSent(false);
    },
  });
  const begin = () => {
    if (!sent && !mutation.isSuccess) {
      mutation.reset();
      setPayload(null);
      setError("");
    }
    if (mutation.isSuccess) {
      mutation.reset();
      setPayload(null);
      setSent(false);
      setError("");
      setRecipient("");
    }
    setOpen(true);
  };
  const prepare = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget),
      amount = String(form.get("amount") ?? "").trim();
    if (
      !source ||
      !holders.data?.some((h) => Number(h.customerid) === Number(customerId))
    )
      return setError("Chọn tài khoản nguồn và người yêu cầu hợp lệ.");
    if (
      !/^\d+$/.test(amount) ||
      !Number.isSafeInteger(Number(amount)) ||
      Number(amount) <= 0
    )
      return setError("Nhập số tiền nguyên VND lớn hơn 0.");
    if (
      !Number.isFinite(Number(source.availablebalance)) ||
      Number(amount) > Number(source.availablebalance)
    )
      return setError(
        "Số tiền vượt quá số dư khả dụng. Vui lòng kiểm tra lại.",
      );
    if (verification.status !== "verified" || !verification.destination)
      return setError("Cần xác minh tài khoản nhận trước khi tiếp tục.");
    setPayload({
      customerId: Number(customerId),
      sourceAccountId: source.accountid,
      destinationAccountId: verification.destination.accountId,
      amount,
      idempotencyKey: crypto.randomUUID(),
      customerVerified: true,
      description: String(form.get("description") ?? "").trim() || undefined,
    });
  };
  // Keep the verified name with the immutable confirmation snapshot.
  const [recipientName, setRecipientName] = useState("");
  return (
    <>
      <button className="btn-primary h-8" onClick={begin}>
        <ArrowRightLeft size={14} />
        Chuyển khoản tại quầy
      </button>
      <Modal
        open={open}
        onOpenChange={(value) => !mutation.isPending && setOpen(value)}
        title="Chuyển khoản tại quầy"
        description="Tài khoản nguồn trong phạm vi được cấp quyền; người nhận có thể thuộc chi nhánh D4 Bank khác."
      >
        {payload && mutation.isSuccess ? (
          <TransactionResult
            status={mutation.data.status}
            operation="Chuyển khoản tại quầy"
            amount={formatCurrency(mutation.data.amount ?? payload.amount)}
            reference={mutation.data.transactioncode}
            time={
              mutation.data.transactiondate
                ? formatDateTime(mutation.data.transactiondate)
                : undefined
            }
            details={[
              [
                "Tài khoản nguồn",
                source?.accountnumber ?? String(payload.sourceAccountId),
              ],
              ["Người nhận", recipientName],
              ["Tài khoản nhận", recipient.trim()],
              ["Nội dung", payload.description || "Không có"],
            ]}
            historyHref={`/${user.role}/transactions`}
            actions={
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setOpen(false)}
              >
                Đóng
              </button>
            }
          />
        ) : !payload ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              setRecipientName(verification.destination?.accountName ?? "");
              void prepare(event);
            }}
          >
            <label className="block text-sm font-semibold">
              Tài khoản nguồn
              <select
                aria-label="Tài khoản nguồn"
                className="field mt-1"
                value={sourceId}
                required
                onChange={(e) => {
                  setSourceId(e.target.value);
                  setCustomerId("");
                }}
              >
                <option value="">Chọn tài khoản nguồn</option>
                {sources.map((a) => (
                  <option key={a.accountid} value={a.accountid}>
                    {a.accountnumber} · Khả dụng{" "}
                    {formatCurrency(a.availablebalance)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Khách hàng yêu cầu
              <select
                aria-label="Khách hàng yêu cầu"
                className="field mt-1"
                value={customerId}
                required
                disabled={!holders.isSuccess}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Chọn người yêu cầu chuyển khoản</option>
                {holders.data?.map((h) => (
                  <option key={h.customerid} value={h.customerid}>
                    {h.fullname} · {h.customercode}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Tài khoản nhận
              <input
                aria-label="Tài khoản nhận"
                className="field mt-1"
                value={recipient}
                maxLength={30}
                required
                onChange={(e) => setRecipient(e.target.value)}
              />
            </label>
            <div
              className={
                verification.status === "error"
                  ? "text-sm text-red-600"
                  : "text-sm text-slate-600"
              }
              aria-live="polite"
            >
              {verification.status === "verified"
                ? `Người nhận: ${verification.message}`
                : verification.message}
              {verification.status === "error" && (
                <button
                  type="button"
                  className="ml-2 underline"
                  onClick={verification.retry}
                >
                  Thử lại
                </button>
              )}
            </div>
            <label className="block text-sm font-semibold">
              Số tiền (VND)
              <input
                aria-label="Số tiền (VND)"
                name="amount"
                className="field mt-1"
                inputMode="numeric"
                pattern="[0-9]+"
                required
              />
            </label>
            <label className="block text-sm font-semibold">
              Nội dung
              <input
                aria-label="Nội dung"
                name="description"
                className="field mt-1"
                maxLength={255}
              />
            </label>
            {accounts.isPending && (
              <p className="text-sm" role="status">
                Đang tải tài khoản…
              </p>
            )}
            {(accounts.isError || holders.isError) && (
              <p role="alert" className="text-sm text-red-600">
                Không thể tải tài khoản hoặc người yêu cầu.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    void accounts.refetch();
                    if (source) void holders.refetch();
                  }}
                >
                  Thử lại
                </button>
              </p>
            )}
            {accounts.isSuccess && !sources.length && (
              <p className="text-sm text-slate-500">
                Chưa có tài khoản nguồn VND đang hoạt động trong phạm vi được
                cấp quyền.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <footer className="flex justify-end border-t pt-4">
              <button
                className="btn-primary"
                disabled={
                  !accounts.isSuccess ||
                  !holders.isSuccess ||
                  verification.status !== "verified"
                }
              >
                Kiểm tra lệnh chuyển
              </button>
            </footer>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!mutation.isPending && !mutation.isSuccess) {
                setSent(true);
                mutation.mutate(payload);
              }
            }}
          >
            {mutation.isError && (
              <TransactionResult
                error={mutation.error}
                operation="Chuyển khoản tại quầy"
                amount={formatCurrency(payload.amount)}
                details={[
                  ["Mã yêu cầu", payload.idempotencyKey],
                  [
                    "Tài khoản nguồn",
                    source?.accountnumber ?? String(payload.sourceAccountId),
                  ],
                  ["Người nhận", recipientName],
                  ["Tài khoản nhận", recipient.trim()],
                ]}
              />
            )}
            {!mutation.isError && (
              <dl className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
                <div>
                  <dt className="text-slate-500">Người yêu cầu</dt>
                  <dd className="font-bold">
                    {holders.data?.find(
                      (h) => Number(h.customerid) === payload.customerId,
                    )?.fullname ?? `Khách hàng #${payload.customerId}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Tài khoản nguồn</dt>
                  <dd className="font-bold">{source?.accountnumber}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Người nhận</dt>
                  <dd className="font-bold">
                    {recipientName} · {recipient.trim()}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Số tiền</dt>
                  <dd className="font-bold text-coral">
                    {formatCurrency(payload.amount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Nội dung</dt>
                  <dd className="break-words">
                    {payload.description || "Không có"}
                  </dd>
                </div>
              </dl>
            )}
            {!mutation.isSuccess && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  required
                  disabled={mutation.isPending}
                  className="mt-1"
                />
                Tôi đã xác minh danh tính, quyền sử dụng tài khoản và yêu cầu
                chuyển khoản của khách hàng tại quầy.
              </label>
            )}
            <p className="text-xs text-slate-500">
              Lệnh được kiểm soát rủi ro trước khi hạch toán. Lệnh chờ kiểm tra
              chưa được coi là chuyển tiền thành công.
            </p>
            <footer className="flex justify-end gap-2 border-t pt-4">
              {!sent && !mutation.isSuccess && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setPayload(null);
                    mutation.reset();
                  }}
                >
                  Chỉnh sửa
                </button>
              )}
              <button
                type="button"
                className="btn-secondary"
                disabled={mutation.isPending}
                onClick={() => setOpen(false)}
              >
                Đóng
              </button>
              {!mutation.isSuccess && (
                <button className="btn-primary" disabled={mutation.isPending}>
                  {mutation.isPending
                    ? "Đang gửi…"
                    : sent
                      ? "Thử lại cùng lệnh"
                      : "Xác nhận chuyển khoản"}
                </button>
              )}
            </footer>
          </form>
        )}
      </Modal>
    </>
  );
}
