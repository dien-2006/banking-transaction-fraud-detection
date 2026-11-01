"use client";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  ReceiptText,
  RotateCcw,
  Wallet,
} from "lucide-react";
import {
  formatVnd,
  formatCurrency,
  transactionView,
} from "@/lib/customer-data";
import {
  historyAccountLabel,
  historyChartBuckets,
  historyDate,
  historyDay,
  historyTime,
  type HistoryDay,
  frequentCustomerTransactions,
  summarizeCustomerHistory,
} from "@/lib/customer-history";
import type { ApiAccount, ApiTransaction } from "@/services/bank.service";
import { CustomerStatus } from "./customer-ui";

const compactMoney = new Intl.NumberFormat("vi-VN", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const historyTypeIcon = (type: string) =>
  type === "TRANSFER"
    ? ArrowUpRight
    : type === "REVERSAL"
      ? RotateCcw
      : type === "DEPOSIT"
        ? ArrowDownLeft
        : type === "WITHDRAWAL"
          ? Wallet
          : ReceiptText;

export function HistoryTable({
  rows,
  accounts,
  onView,
}: {
  rows: ApiTransaction[];
  accounts: ApiAccount[];
  onView: (row: ApiTransaction) => void;
}) {
  return (
    <div
      className="customer-data-scroll history-table-scroll"
      role="region"
      aria-label="Danh sách giao dịch"
      tabIndex={0}
    >
      <table className="customer-data-table history-table">
        <colgroup>
          {Array.from({ length: 8 }, (_, i) => (
            <col key={i} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {[
              "Thời gian",
              "Mã giao dịch",
              "Nội dung",
              "Loại giao dịch",
              "Tài khoản",
              "Số tiền",
              "Trạng thái",
              "Thao tác",
            ].map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const view = transactionView(row, accounts),
              TypeIcon = historyTypeIcon(row.typecode),
              DirectionIcon =
                view.direction === "in"
                  ? ArrowDownLeft
                  : view.direction === "out"
                    ? ArrowUpRight
                    : ArrowRight,
              flow = row.status === "Success" ? view.direction : "unknown";
            return (
              <tr key={row.transactionid}>
                <td>
                  <span className={`history-date ${flow}`}>
                    <i>
                      <DirectionIcon size={14} />
                    </i>
                    <time dateTime={row.transactiondate}>
                      <span>{historyDate(row.transactiondate)}</span>
                      <small>{historyTime(row.transactiondate)}</small>
                    </time>
                  </span>
                </td>
                <td title={row.transactioncode}>
                  <span className="history-code">{row.transactioncode}</span>
                </td>
                <td title={view.description}>{view.description}</td>
                <td>
                  <span className="history-type">
                    <i>
                      <TypeIcon size={14} />
                    </i>
                    <span>{view.type}</span>
                  </span>
                </td>
                <td title={historyAccountLabel(row, accounts)}>
                  {historyAccountLabel(row, accounts)}
                </td>
                <td
                  className={`customer-amount ${flow}`}
                  title={view.amountText}
                >
                  {view.amountText}
                </td>
                <td>
                  <CustomerStatus status={row.status} />
                </td>
                <td>
                  <button
                    type="button"
                    className="history-view"
                    aria-label={`Xem giao dịch ${row.transactioncode}`}
                    onClick={() => onView(row)}
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
  );
}
function HistoryChart({ days }: { days: HistoryDay[] }) {
  const rows = historyChartBuckets(days),
    max = Math.max(1, ...rows.flatMap((row) => [row.incoming, row.outgoing]));
  return (
    <div className="history-chart">
      <div className="history-chart-legend">
        <span>
          <i />
          Chi
        </span>
        <span>
          <i />
          Nhận
        </span>
      </div>
      {rows.length ? (
        <div
          className="history-chart-plot"
          role="img"
          aria-label="Giá trị chi và nhận VND theo khoảng ngày"
        >
          <div className="history-chart-axis">
            <span>{compactMoney.format(max)}</span>
            <span>{compactMoney.format(max / 2)}</span>
            <span>0</span>
          </div>
          <div
            className="history-chart-columns"
            style={{
              gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`,
            }}
          >
            {rows.map((row) => (
              <div
                key={row.from}
                className="history-chart-column"
                title={`${historyDate(row.from)} – ${historyDate(row.to)}: Chi ${formatVnd(row.outgoing)}; Nhận ${formatVnd(row.incoming)}`}
              >
                <div className="history-chart-bars">
                  <i style={{ height: `${(row.outgoing / max) * 100}%` }} />
                  <i style={{ height: `${(row.incoming / max) * 100}%` }} />
                </div>
                <span>{row.from.slice(5).split("-").reverse().join("/")}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="history-sidebar-empty">
          Chưa có thu/chi thành công trong kỳ.
        </p>
      )}
      <small>
        {days.length > 7
          ? "Gộp theo khoảng ngày trong kỳ"
          : "Theo ngày phát sinh trong kỳ"}
      </small>
    </div>
  );
}
export function HistorySummary({
  rows,
  accounts,
  month,
  months,
  onMonth,
}: {
  rows: ApiTransaction[];
  accounts: ApiAccount[];
  month: string;
  months: string[];
  onMonth: (value: string) => void;
}) {
  const scope = month
    ? rows.filter(
        (row) => historyDay(row.transactiondate).slice(0, 7) === month,
      )
    : rows;
  const summary = summarizeCustomerHistory(scope, accounts);
  return (
    <section className="customer-box history-summary">
      <header>
        <h2>Tổng quan giao dịch</h2>
        <select
          aria-label="Kỳ thống kê"
          value={month}
          onChange={(e) => onMonth(e.target.value)}
        >
          <option value="">Theo bộ lọc</option>
          {months.map((value) => (
            <option key={value} value={value}>
              Tháng {value.slice(5)}/{value.slice(0, 4)}
            </option>
          ))}
        </select>
      </header>
      <div className="history-summary-total">
        <i>
          <ReceiptText size={22} />
        </i>
        <div>
          <span>Tổng số giao dịch</span>
          <b>{summary.total.toLocaleString("vi-VN")}</b>
          <small>{summary.pending} đang xử lý</small>
        </div>
      </div>
      <div className="history-summary-money">
        <div>
          <span>Tổng tiền chi</span>
          <b>{formatVnd(summary.outgoing)}</b>
        </div>
        <div>
          <span>Tổng tiền nhận</span>
          <b>{formatVnd(summary.incoming)}</b>
        </div>
      </div>
      <HistoryChart days={summary.days} />
      <p className="history-summary-note">
        Chỉ cộng giá trị giao dịch VND thành công. Chuyển giữa tài khoản của bạn
        không tính vào thu/chi.
      </p>
    </section>
  );
}
export function HistoryFrequent({
  rows,
  onChoose,
  onShowAll,
}: {
  rows: ApiTransaction[];
  onChoose: (description: string, type: string) => void;
  onShowAll: () => void;
}) {
  const groups = frequentCustomerTransactions(rows);
  return (
    <section className="customer-box history-frequent">
      <header>
        <h2>Giao dịch thường gặp</h2>
        <button type="button" onClick={onShowAll}>
          Xem tất cả <ArrowRight size={14} />
        </button>
      </header>
      <div>
        {groups.map((group) => {
          const Icon = historyTypeIcon(group.type);
          return (
            <button
              type="button"
              key={group.key}
              onClick={() => onChoose(group.description, group.type)}
              title={group.description}
            >
              <i>
                <Icon size={21} />
              </i>
              <span>
                <b>{group.description}</b>
                <small>
                  {group.count} lần · Tổng{" "}
                  {formatCurrency(group.total, group.currency)}
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          );
        })}
        {!groups.length && (
          <p className="history-sidebar-empty">
            Chưa có giao dịch thành công để thống kê.
          </p>
        )}
      </div>
    </section>
  );
}
