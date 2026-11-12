"use client";
import {
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Copy,
  Download,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ApiError } from "@/services/api.client";
import { transactionPresentation } from "@/lib/transaction-outcome";
import { transactionReceiptPng } from "@/lib/transaction-image";
import { Modal } from "./ui";
import "./transaction-result.css";
import type { ApiTransaction } from "@/services/bank.service";
import { formatCurrency, formatDateTime } from "@/lib/presentation";

export interface TransactionResultProps {
  status?: string;
  decision?: string;
  error?: unknown;
  operation?: string;
  amount?: string;
  reference?: string;
  time?: string;
  details?: ReadonlyArray<readonly [string, string]>;
  historyHref?: string;
  actions?: ReactNode;
}

export function TransactionResult({
  status,
  decision,
  error,
  operation = "Giao dịch",
  amount,
  reference,
  time,
  details = [],
  historyHref,
  actions,
}: TransactionResultProps) {
  const [feedback, setFeedback] = useState("");
  const [downloading, setDownloading] = useState(false);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
    root.current
      ?.querySelector(".d4-result-heading")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [status, decision, error, reference]);
  const { outcome: state, ...view } = transactionPresentation(
      status,
      decision,
      error instanceof ApiError ? error.status : undefined,
    );
  const Icon =
    state === "success"
      ? CheckCircle2
      : state === "pending"
        ? Clock3
        : state === "unknown"
          ? CircleHelp
          : state === "rejected"
            ? ShieldAlert
            : XCircle;
  const fields = [
    ...(reference ? [["Mã giao dịch", reference] as const] : []),
    ...(time ? [["Thời gian", time] as const] : []),
    ...details,
    ["Trạng thái", view.label] as const,
  ];
  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    setFeedback("");
    try {
      const blob = await transactionReceiptPng({
        operation, outcome: state, ...view, amount, fields,
        reason: error == null ? undefined : error instanceof Error ? error.message : String(error),
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `D4Bank-${(reference ?? "giao-dich").replace(/[^\w-]/g, "_")}.png`;
      document.body.appendChild(anchor);
      try {
        anchor.click();
        setFeedback("Đã tạo ảnh biên nhận giao dịch.");
      } finally {
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      setFeedback("Không thể tải ảnh giao dịch. Vui lòng thử lại.");
    } finally {
      setDownloading(false);
    }
  };
  return (
    <section
      className="d4-transaction-result"
      ref={root}
      tabIndex={-1}
      data-outcome={state}
      aria-label="Kết quả giao dịch"
    >
      <div
        className="d4-result-heading"
        role={state === "failed" || state === "rejected" ? "alert" : "status"}
        aria-live="polite"
      >
        <span className="d4-result-symbol">
          <Icon size={34} />
        </span>
        <small>D4 BANK · {operation}</small>
        <h2>{view.title}</h2>
        <p>{view.message}</p>
        {amount && <strong>{amount}</strong>}
        <span className="d4-result-badge">
          {state === "success" && <Check size={13} />} {view.label}
        </span>
      </div>
      {error != null && (
        <p className="d4-result-reason">
          {error instanceof Error ? error.message : String(error)}
        </p>
      )}
      <dl>
        {fields.map(([key, value], index) => (
          <div key={`${key}-${index}`}>
            <dt>{key}</dt>
            <dd>{value || "Chưa cập nhật"}</dd>
          </div>
        ))}
      </dl>
      {(reference || historyHref || actions) && (
        <footer>
          {reference && (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(reference);
                    setFeedback("Đã sao chép mã giao dịch.");
                  } catch {
                    setFeedback(
                      "Không thể sao chép. Bạn có thể sao chép mã thủ công.",
                    );
                  }
                }}
              >
                <Copy size={15} />
                Sao chép mã
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={download}
                disabled={downloading}
                aria-busy={downloading}
              >
                <Download size={15} />
                {downloading ? "Đang tạo ảnh…" : "Tải ảnh giao dịch"}
              </button>
            </>
          )}
          {historyHref && (
            <Link className="btn-primary" href={historyHref}>
              Xem lịch sử
            </Link>
          )}
          {actions}
        </footer>
      )}
      {feedback && (
        <p className="d4-result-feedback" role="status">
          {feedback}
        </p>
      )}
    </section>
  );
}

export function TransactionResultButton(props: TransactionResultProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="d4-view-button" onClick={() => setOpen(true)}>
        Xem
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Chi tiết giao dịch"
        description="Trạng thái và thông tin thực tế của giao dịch."
      >
        <TransactionResult {...props} />
      </Modal>
    </>
  );
}

export function TransactionRecordResult({
  transaction,
  account,
  accountLabel = "Tài khoản",
  hidden = false,
  staffDetails = [],
}: {
  transaction: ApiTransaction;
  account: string;
  accountLabel?: string;
  hidden?: boolean;
  staffDetails?: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <TransactionResult
      status={transaction.status}
      decision={transaction.decision}
      operation={transaction.typename || "Giao dịch"}
      amount={
        hidden
          ? "••••••"
          : formatCurrency(transaction.amount, transaction.currency)
      }
      reference={transaction.transactioncode}
      time={formatDateTime(transaction.transactiondate)}
      details={[
        [accountLabel, hidden ? "••••••" : account],
        [
          "Nội dung",
          transaction.description || transaction.typename || "Không có",
        ],
        [
          "Phí",
          hidden
            ? "••••••"
            : formatCurrency(transaction.fee ?? "0", transaction.currency),
        ],
        ...staffDetails,
      ]}
    />
  );
}

export function TransactionRecordButton(
  props: Parameters<typeof TransactionRecordResult>[0],
) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="d4-view-button" onClick={() => setOpen(true)}>
        Xem
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Chi tiết giao dịch"
        description="Trạng thái và thông tin thực tế của giao dịch."
      >
        <TransactionRecordResult {...props} />
      </Modal>
    </>
  );
}
