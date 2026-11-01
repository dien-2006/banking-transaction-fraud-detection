"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useSessionUser } from "@/components/session-context";
import { Modal } from "@/components/ui";
import { formatVnd } from "@/lib/customer-data";
import { loadAllPages } from "@/lib/paged-data";
import { TransactionResult } from "@/components/transaction-result";
import { formatDateTime } from "@/lib/presentation";
import { ApiError } from "@/services/api.client";
import { bankService, type MovementInput } from "@/services/bank.service";

const newCode = () => `CTR-${crypto.randomUUID()}`;
export function StaffMovementDialog({ onCreated }: { onCreated: () => void }) {
  const user = useSessionUser(),
    client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"DEPOSIT" | "WITHDRAWAL">("DEPOSIT");
  const [code, setCode] = useState("");
  const [attempt, setAttempt] = useState<MovementInput | null>(null);
  const [error, setError] = useState("");
  const accounts = useQuery({
    queryKey: ["movement-accounts", user.role, user.id, user.branchId],
    queryFn: () => loadAllPages(bankService.accounts, (row) => row.accountid),
    enabled: open,
  });
  const allowed = (accounts.data ?? []).filter(
    (account) =>
      account.status === "Active" &&
      (user.role !== "employee" ||
        (user.branchId != null && account.branchid === user.branchId)),
  );
  const customerAccounts = allowed.filter(
    (account) => account.accountcategory === "CUSTOMER",
  );
  const internalAccounts = allowed.filter(
    (account) => account.accountcategory === "INTERNAL",
  );
  const mutation = useMutation({
    mutationFn: bankService.createMovement,
    onSuccess: () => {
      onCreated();
      void client.invalidateQueries({
        predicate: (query) =>
          /accounts|overview/.test(String(query.queryKey[0])),
      });
    },
    onError: (caught) => {
      if (
        caught instanceof ApiError &&
        caught.status >= 400 &&
        caught.status < 500
      ) {
        setAttempt(null);
        setCode(newCode());
      }
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending || mutation.isSuccess) return;
    setError("");
    if (attempt) {
      mutation.mutate(attempt);
      return;
    }
    const form = new FormData(event.currentTarget);
    const customer = customerAccounts.find(
      (account) => account.accountid === Number(form.get("customerAccountId")),
    );
    const internal = internalAccounts.find(
      (account) => account.accountid === Number(form.get("internalAccountId")),
    );
    const amount = String(form.get("amount") ?? "").trim();
    if (!customer || !internal)
      return setError(
        "Vui lòng chọn hai tài khoản đang hoạt động trong phạm vi được cấp quyền.",
      );
    if (
      !/^\d+$/.test(amount) ||
      !Number.isSafeInteger(Number(amount)) ||
      Number(amount) <= 0
    )
      return setError("Số tiền phải là số nguyên VND lớn hơn 0.");
    if (customer.currency !== "VND" || internal.currency !== "VND")
      return setError("Giao dịch tại quầy hiện chỉ hỗ trợ tài khoản VND.");
    const debit = type === "DEPOSIT" ? internal : customer;
    if (!Number.isFinite(Number(debit.availablebalance)))
      return setError(
        "Không thể xác định số dư khả dụng. Vui lòng tải lại tài khoản.",
      );
    if (Number(amount) > Number(debit.availablebalance))
      return setError("Số tiền vượt quá số dư khả dụng của tài khoản ghi nợ.");
    const input: MovementInput = {
      type,
      debitAccountId: debit.accountid,
      creditAccountId:
        type === "DEPOSIT" ? customer.accountid : internal.accountid,
      amount,
      transactionCode: code,
      channel: "Counter",
      description: String(form.get("description") ?? "").trim() || undefined,
    };
    setAttempt(input);
    mutation.mutate(input);
  };
  const locked = mutation.isPending || attempt !== null;
  return (
    <>
      <button
        className="btn-primary h-8"
        onClick={() => {
          if (attempt && mutation.isError) {
            setOpen(true);
            return;
          }
          mutation.reset();
          setAttempt(null);
          setError("");
          setCode(newCode());
          setType("DEPOSIT");
          setOpen(true);
        }}
      >
        <ArrowLeftRight size={14} />
        Tạo giao dịch
      </button>
      <Modal
        open={open}
        onOpenChange={(value) => !mutation.isPending && setOpen(value)}
        title="Tạo giao dịch tại quầy"
        description="Nạp hoặc rút tiền giữa tài khoản khách hàng và tài khoản nội bộ trong phạm vi được cấp quyền."
      >
        {mutation.isSuccess ? (
          <TransactionResult
            status={mutation.data.status}
            operation={
              type === "DEPOSIT" ? "Nạp tiền tại quầy" : "Rút tiền tại quầy"
            }
            amount={formatVnd(mutation.data.amount ?? attempt?.amount ?? "0")}
            reference={mutation.data.transactioncode}
            time={
              mutation.data.transactiondate
                ? formatDateTime(mutation.data.transactiondate)
                : undefined
            }
            details={[
              ["Tài khoản ghi nợ", String(attempt?.debitAccountId ?? "—")],
              ["Tài khoản ghi có", String(attempt?.creditAccountId ?? "—")],
              ["Nội dung", attempt?.description || "Không có"],
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
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <fieldset
              hidden={mutation.isError}
              disabled={locked}
              className={mutation.isError ? "hidden" : "grid gap-4 sm:grid-cols-2"}
            >
              <label className="text-sm font-semibold">
                Loại giao dịch
                <select
                  className="field mt-1"
                  value={type}
                  onChange={(event) =>
                    setType(event.target.value as typeof type)
                  }
                >
                  <option value="DEPOSIT">Nạp tiền</option>
                  <option value="WITHDRAWAL">Rút tiền</option>
                </select>
              </label>
              <label className="text-sm font-semibold">
                Số tiền (VND)
                <input
                  name="amount"
                  className="field mt-1"
                  inputMode="numeric"
                  pattern="[0-9]+"
                  required
                />
              </label>
              <label className="text-sm font-semibold sm:col-span-2">
                Tài khoản khách hàng
                <select
                  name="customerAccountId"
                  className="field mt-1"
                  required
                  defaultValue=""
                >
                  <option value="">Chọn tài khoản khách hàng</option>
                  {customerAccounts.map((account) => (
                    <option key={account.accountid} value={account.accountid}>
                      {account.accountnumber} · Khả dụng{" "}
                      {formatVnd(account.availablebalance)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold sm:col-span-2">
                Tài khoản nội bộ
                <select
                  name="internalAccountId"
                  className="field mt-1"
                  required
                  defaultValue=""
                >
                  <option value="">Chọn tài khoản nội bộ</option>
                  {internalAccounts.map((account) => (
                    <option key={account.accountid} value={account.accountid}>
                      {account.accountnumber} · {account.branchname} · Khả dụng{" "}
                      {formatVnd(account.availablebalance)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold sm:col-span-2">
                Nội dung
                <input
                  name="description"
                  maxLength={255}
                  className="field mt-1"
                />
              </label>
            </fieldset>
            <p className="text-xs text-slate-500">Mã yêu cầu: {code}</p>
            {accounts.isPending && (
              <p className="text-sm" aria-busy="true">
                Đang tải tài khoản…
              </p>
            )}
            {accounts.isError && (
              <p className="text-sm text-red-600" role="alert">
                Không thể tải tài khoản.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => void accounts.refetch()}
                >
                  Thử lại
                </button>
              </p>
            )}
            {accounts.isSuccess &&
              (!customerAccounts.length || !internalAccounts.length) && (
                <p className="text-sm text-amber-700">
                  Chưa có đủ tài khoản khách hàng và tài khoản nội bộ đang hoạt
                  động để tạo giao dịch.
                </p>
              )}
            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            {mutation.isError && (
              <TransactionResult
                error={mutation.error}
                operation={
                  type === "DEPOSIT" ? "Nạp tiền tại quầy" : "Rút tiền tại quầy"
                }
                amount={attempt ? formatVnd(attempt.amount) : undefined}
                details={
                  attempt
                    ? [
                        ["Mã yêu cầu", attempt.transactionCode],
                        ["Tài khoản ghi nợ", String(attempt.debitAccountId)],
                        ["Tài khoản ghi có", String(attempt.creditAccountId)],
                      ]
                    : []
                }
              />
            )}
            <footer className="flex justify-end gap-3 border-t pt-4">
              {mutation.isError && !attempt && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => mutation.reset()}
                >
                  Chỉnh sửa thông tin
                </button>
              )}
              <button
                type="button"
                className="btn-secondary"
                disabled={mutation.isPending}
                onClick={() => setOpen(false)}
              >
                {mutation.isSuccess ? "Đóng" : "Hủy"}
              </button>
              {!mutation.isSuccess && (
                <button
                  className="btn-primary"
                  disabled={
                    mutation.isPending ||
                    !accounts.isSuccess ||
                    !customerAccounts.length ||
                    !internalAccounts.length
                  }
                >
                  {mutation.isPending
                    ? "Đang gửi…"
                    : attempt
                      ? "Thử lại cùng giao dịch"
                      : "Xác nhận giao dịch"}
                </button>
              )}
            </footer>
          </form>
        )}
      </Modal>
    </>
  );
}
