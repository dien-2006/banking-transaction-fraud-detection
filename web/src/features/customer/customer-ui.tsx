"use client";
import { RecordStatus } from "@/components/record-status";
import { TransactionRecordResult } from "@/components/transaction-result";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode, type Ref } from "react";
import { Modal } from "@/components/ui";
import { transactionView } from "@/lib/customer-data";
import type { ApiAccount, ApiTransaction } from "@/services/bank.service";
import "./customer-ui.css";

export function CustomerHero({
  title,
  description,
  icon: Icon = Wallet,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  return (
    <header className="customer-page-hero">
      <div>
        <nav aria-label="Đường dẫn">
          <Link href="/customer">Trang chủ</Link>
          <ChevronRight size={13} />
          <span>{title}</span>
        </nav>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <span className="customer-hero-symbol" aria-hidden="true">
        <Icon />
      </span>
    </header>
  );
}
export function CustomerPanel({
  title,
  action,
  children,
  className = "",
  panelRef,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  panelRef?: Ref<HTMLElement>;
}) {
  return (
    <section ref={panelRef} className={`customer-box ${className}`}>
      <header>
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}
export function CustomerMetric({
  label,
  value,
  caption,
  icon: Icon = Wallet,
}: {
  label: string;
  value: ReactNode;
  caption?: string;
  icon?: LucideIcon;
}) {
  return (
    <article className="customer-metric">
      <i>
        <Icon size={21} />
      </i>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {caption && <small>{caption}</small>}
      </div>
    </article>
  );
}
export function CustomerStatus({ status }: { status: string }) {
  return <RecordStatus status={status} />;
}
export function CustomerEmpty({
  children = "Chưa có dữ liệu.",
  error = false,
  retry,
}: {
  children?: ReactNode;
  error?: boolean;
  retry?: () => void;
}) {
  return (
    <div
      className={`customer-empty-state ${error ? "error" : ""}`}
      role={error ? "alert" : undefined}
    >
      <ShieldCheck size={28} />
      <p>{children}</p>
      {retry && (
        <button className="customer-button secondary" onClick={retry}>
          <RefreshCw size={15} />
          Thử lại
        </button>
      )}
    </div>
  );
}
export function CustomerLoading() {
  return (
    <div className="customer-empty-state" aria-busy="true">
      <RefreshCw className="animate-spin" />
      <p>Đang tải dữ liệu của bạn…</p>
    </div>
  );
}
export function CustomerPager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <footer className="customer-pagination d4-list-pagination">
      <span>
        {total
          ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}`
          : "0"}{" "}
        / {total} bản ghi
      </span>
      <nav aria-label="Phân trang">
        <button
          aria-label="Trang trước"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <b>
          {page}/{pages}
        </b>
        <button
          aria-label="Trang sau"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </nav>
    </footer>
  );
}
export function CustomerTransactionTable({
  transactions,
  accounts,
  hidden = false,
  compact = false,
  accountOverview = false,
}: {
  transactions: ApiTransaction[];
  accounts: ApiAccount[];
  hidden?: boolean;
  compact?: boolean;
  accountOverview?: boolean;
}) {
  const [selected, setSelected] = useState<ApiTransaction | null>(null);
  const condensed = compact || accountOverview;
  return (
    <>
      <div
        className="customer-data-scroll"
        tabIndex={0}
        role="region"
        aria-label="Danh sách giao dịch"
      >
        <table
          className={`customer-data-table${compact ? " customer-home-transactions" : ""}`}
        >
          <thead>
            <tr>
              {[
                condensed ? "Thời gian" : "Thời gian / Mã giao dịch",
                "Nội dung",
                ...(compact ? [] : ["Tài khoản"]),
                "Số tiền",
                "Trạng thái",
                condensed ? "Thao tác" : "",
              ].map((label, index) => (
                <th key={index} scope="col">
                  {label || <span className="sr-only">Chi tiết</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map((item) => {
              const view = transactionView(item, accounts);
              const Icon =
                view.direction === "in"
                  ? ArrowDownLeft
                  : view.direction === "out"
                    ? ArrowUpRight
                    : ArrowRight;
              return (
                <tr key={item.transactionid}>
                  <td>
                    {condensed ? (
                      <span
                        className={`customer-home-tx-time ${item.status === "Success" && view.direction === "in" ? "incoming" : ""}`}
                      >
                        <i>
                          <Icon size={14} />
                        </i>
                        <time>{view.time}</time>
                      </span>
                    ) : (
                      <>
                        <time>{view.time}</time>
                        <small
                          className="customer-transaction-code"
                          title={item.transactioncode}
                        >
                          {item.transactioncode}
                        </small>
                      </>
                    )}
                  </td>
                  <td>
                    <span className="customer-cell-copy">
                      <Icon size={16} />
                      <span>
                        {view.description}
                        {!condensed && <small>{view.type}</small>}
                      </span>
                    </span>
                  </td>
                  {!compact && <td>{hidden ? "••••••" : view.account}</td>}
                  <td
                    className={`customer-amount ${item.status === "Success" ? view.direction : "unknown"}`}
                  >
                    {hidden ? "••••••" : view.amountText}
                  </td>
                  <td>
                    <CustomerStatus status={item.status} />
                  </td>
                  <td>
                    <button
                      className={`customer-text-button${compact ? " customer-home-view" : ""}`}
                      onClick={() => setSelected(item)}
                      aria-label={`${condensed ? "Xem chi tiết" : "Chi tiết"} ${item.transactioncode}`}
                    >
                      Xem
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!transactions.length && (
        <CustomerEmpty>Không có giao dịch phù hợp.</CustomerEmpty>
      )}
      <Modal
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        title="Chi tiết giao dịch"
        description="Thông tin giao dịch của tài khoản đang đăng nhập."
      >
        {selected && (
          <TransactionRecordResult
            transaction={selected}
            account={transactionView(selected, accounts).account}
            hidden={hidden}
          />
        )}
      </Modal>
    </>
  );
}
