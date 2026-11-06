"use client";
import { RecordStatus } from "@/components/record-status";
import { CarFront, House, Wallet } from "lucide-react";
import { customerDate, formatVnd } from "@/lib/customer-data";
import {
  installmentRemaining,
  installmentTotal,
  loanProgress,
  loanTerm,
} from "@/lib/customer-loans";
import type { ApiLoan, LoanScheduleItem } from "@/services/bank.service";
import { CustomerEmpty, CustomerLoading, CustomerStatus } from "./customer-ui";

export const loanIcon = (name: string) =>
  /nhà|home|mortgage/i.test(name)
    ? House
    : /ô tô|oto|auto|car/i.test(name)
      ? CarFront
      : Wallet;
export const loanMoney = (value: string | number, hidden: boolean) =>
  hidden ? "••••••" : formatVnd(value);
function LoanStatus({ status }: { status: string }) {
  return <RecordStatus status={status} domain="loan" />;
}
export function LoanRecord({
  loan,
  schedule,
  error,
  hidden,
  onView,
}: {
  loan: ApiLoan;
  schedule?: LoanScheduleItem[];
  error: boolean;
  hidden: boolean;
  onView: () => void;
}) {
  const Icon = loanIcon(loan.loantypename);
  const progress = loanProgress(loan, schedule);
  const next = schedule
    ?.filter((row) => row.status !== "Paid")
    .sort((a, b) => a.duedate.localeCompare(b.duedate))[0];
  const remaining = next ? installmentRemaining(next) : null;
  const inactive = loan.status === "Pending" || loan.status === "Cancelled";
  return (
    <article className="loans-record" data-status={loan.status}>
      <header>
        <i className="loans-record-icon">
          <Icon size={25} />
        </i>
        <div className="loans-record-name">
          <h3 title={loan.loantypename}>{loan.loantypename}</h3>
          <small>{loan.loancode}</small>
        </div>
        <LoanStatus status={loan.status} />
        <button
          type="button"
          className="loans-view"
          aria-label={`Xem chi tiết ${loan.loancode}`}
          onClick={onView}
        >
          Xem chi tiết
        </button>
      </header>
      <dl className="loans-record-values">
        <div>
          <dt>Số tiền vay</dt>
          <dd>{loanMoney(loan.principalamount, hidden)}</dd>
        </div>
        <div>
          <dt>Dư nợ theo lịch</dt>
          <dd>
            {inactive
              ? loan.status === "Pending"
                ? "Chờ phê duyệt"
                : "—"
              : loanMoney(loan.outstandingamount, hidden)}
          </dd>
        </div>
        <div>
          <dt>Lãi suất</dt>
          <dd>{Number(loan.interestrate).toLocaleString("vi-VN")}%/năm</dd>
        </div>
        <div>
          <dt>Kỳ hạn</dt>
          <dd>{loanTerm(loan.termmonths)}</dd>
        </div>
        <div className="loans-next-due">
          <dt>
            {loan.status === "Paid" ? "Tình trạng" : "Kỳ đến hạn gần nhất"}
          </dt>
          <dd>
            {loan.status === "Paid" ? (
              "Đã tất toán"
            ) : inactive ? (
              "Chưa có lịch trả nợ"
            ) : (
              <>
                <span>{customerDate(next?.duedate || loan.nextduedate)}</span>
                <strong>
                  {next
                    ? remaining === null
                      ? "Cần đối soát"
                      : loanMoney(remaining, hidden)
                    : error
                      ? "Chưa tải được số tiền"
                      : schedule
                        ? "Chưa có kỳ thanh toán"
                        : "Đang tải số tiền…"}
                </strong>
              </>
            )}
          </dd>
        </div>
      </dl>
      <footer className="loans-progress">
        {progress ? (
          <>
            <div
              role="progressbar"
              aria-label={`Số kỳ đã hoàn tất ${loan.loancode}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
            >
              <span style={{ width: `${progress.percent}%` }} />
            </div>
            <small>
              {loan.status === "Paid"
                ? "Đã tất toán"
                : `Hoàn tất ${progress.paid}/${progress.total} kỳ (${progress.percent}%)`}
            </small>
          </>
        ) : (
          <small>
            {inactive
              ? loan.status === "Pending"
                ? "Lịch trả nợ được lập sau khi khoản vay được duyệt."
                : "Khoản vay đã hủy."
              : error
                ? "Chưa tải được lịch trả nợ. Mở chi tiết để thử lại."
                : schedule
                  ? "Chưa có lịch trả nợ."
                  : "Đang tải tiến độ thanh toán…"}
          </small>
        )}
      </footer>
    </article>
  );
}

export function LoanScheduleDetails({
  loan,
  rows,
  pending,
  error,
  hidden,
  retry,
}: {
  loan: ApiLoan;
  rows?: LoanScheduleItem[];
  pending: boolean;
  error: boolean;
  hidden: boolean;
  retry: () => void;
}) {
  return (
    <>
      <dl className="customer-record loans-detail-record">
        {[
          ["Mã khoản vay", loan.loancode],
          ["Số tiền vay", loanMoney(loan.principalamount, hidden)],
          [
            "Dư nợ theo lịch",
            ["Pending", "Cancelled"].includes(loan.status)
              ? "—"
              : loanMoney(loan.outstandingamount, hidden),
          ],
          [
            "Lãi suất",
            `${Number(loan.interestrate).toLocaleString("vi-VN")}%/năm`,
          ],
          ["Kỳ hạn", loanTerm(loan.termmonths)],
          ["Ngày bắt đầu", customerDate(loan.startdate)],
          ["Kết thúc hợp đồng", customerDate(loan.enddate)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div>
          <dt>Trạng thái</dt>
          <dd>
            <LoanStatus status={loan.status} />
          </dd>
        </div>
      </dl>
      <h3 className="loans-schedule-title">Lịch trả nợ</h3>
      {error ? (
        <CustomerEmpty error retry={retry}>
          Không thể tải lịch trả nợ.
        </CustomerEmpty>
      ) : pending ? (
        <CustomerLoading />
      ) : !rows?.length ? (
        <CustomerEmpty>
          Chưa có lịch thanh toán cho khoản vay này.
        </CustomerEmpty>
      ) : (
        <>
          <div
            className="loans-schedule-scroll"
            role="region"
            tabIndex={0}
            aria-label="Lịch trả nợ"
          >
            <table className="loans-schedule-table">
              <thead>
                <tr>
                  {[
                    "Kỳ / Ngày đến hạn",
                    "Gốc + lãi + phí",
                    "Còn theo lịch",
                    "Trạng thái",
                  ].map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.scheduleid}>
                    <td>
                      Kỳ {row.installmentno}
                      <small>{customerDate(row.duedate)}</small>
                    </td>
                    <td>{loanMoney(installmentTotal(row), hidden)}</td>
                    <td>
                      {installmentRemaining(row) === null
                        ? "Cần đối soát"
                        : loanMoney(installmentRemaining(row)!, hidden)}
                    </td>
                    <td>
                      {row.status === "Pending" ? (
                        <span className="customer-state waiting">
                          Chưa thanh toán
                        </span>
                      ) : (
                        <CustomerStatus status={row.status} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="loans-detail-note">
            Dư nợ theo lịch gồm gốc, lãi và phí của các kỳ chưa tất toán. Kỳ đã
            thanh toán một phần cần đối soát nếu chưa có số tiền đã trả.
          </p>
        </>
      )}
    </>
  );
}
