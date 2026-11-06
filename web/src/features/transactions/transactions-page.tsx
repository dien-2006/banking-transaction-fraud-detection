"use client";
import { RecordStatus } from "@/components/record-status";
import {
  amountRanges,
  emptyHistoryFilters,
  filterCustomerHistory,
  type HistoryFilters,
} from "@/lib/customer-history";
import { DistributionChart } from "@/components/distribution-chart";

import {
  ArrowLeftRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Filter,
  Search,
} from "lucide-react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ListPagination,
  useListPagination,
} from "@/components/list-pagination";
import { TransactionRecordButton } from "@/components/transaction-result";
import { bankService } from "@/services/bank.service";
import { useSessionUser } from "@/components/session-context";
import { loadAllPages } from "@/lib/paged-data";
import {
  presentTransaction,
  transactionSummary,
  transactionTypeLabels,
} from "@/lib/staff-data";
import { StaffTransferDialog } from "./staff-transfer-dialog";
import { StaffMovementDialog } from "./staff-movement-dialog";
export function TransactionsPage() {
  const user = useSessionUser();
  const [filters, setFilters] = useState<HistoryFilters>({
    ...emptyHistoryFilters,
  });
  const { search: q, status, type } = filters;
  const setFilter = (key: keyof HistoryFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    pagination.setPage(1);
  };
  const setQ = (value: string) => setFilter("search", value);
  const setStatus = (value: string) => setFilter("status", value);
  const setType = (value: string) => setFilter("type", value);
  const accountsQuery = useQuery({
    queryKey: ["staff-accounts", user.role, user.id, user.branchId],
    queryFn: () => loadAllPages(bankService.accounts, (row) => row.accountid),
  });
  const dateError = !!(filters.from && filters.to && filters.from > filters.to);
  const transactionsQuery = useQuery({
    refetchInterval: 15_000,
    queryKey: ["staff-transactions", user.role, user.id, user.branchId],
    queryFn: () =>
      loadAllPages(bankService.listTransactions, (row) => row.transactionid),
  });
  const transactions = useMemo(
    () =>
      [...(transactionsQuery.data ?? [])].sort(
        (a, b) =>
          Date.parse(b.transactiondate) - Date.parse(a.transactiondate) ||
          b.transactionid - a.transactionid,
      ),
    [transactionsQuery.data],
  );
  const summary = useMemo(
    () => transactionSummary(transactions),
    [transactions],
  );
  const data = useMemo(
    () =>
      filterCustomerHistory(transactions, { ...filters, search: "" })
        .filter((row) => {
          const view = presentTransaction(row);
          return `${view.id} ${view.customer} ${view.description} ${view.type}`
            .toLocaleLowerCase("vi")
            .includes(q.trim().toLocaleLowerCase("vi"));
        })
        .map((row) => ({ ...presentTransaction(row), raw: row })),
    [filters, q, transactions],
  );
  const pagination = useListPagination(data, { fitViewportOnly: true });
  const reset = () => {
    setFilters({ ...emptyHistoryFilters });
    pagination.setPage(1);
  };
  const value = (count: number) =>
    transactionsQuery.isSuccess ? count.toLocaleString("vi-VN") : "—";
  const cards = [
    [ArrowLeftRight, "Tổng giao dịch", value(summary.total)],
    [CheckCircle2, "Giao dịch thành công", value(summary.success)],
    [Clock3, "Đang xử lý", value(summary.pending)],
    [CircleAlert, "Giao dịch rủi ro", value(summary.risky)],
  ] as const;
  return (
    <div className="staff-data-page customers-page-content flex flex-col gap-2.5 text-navy">
      <section className="relative h-60 overflow-hidden rounded-xl border border-red-100">
        <Image
          src="/transactions-hero.png"
          alt="Quản lý giao dịch"
          fill
          priority
          className="object-contain"
        />
      </section>
      <section className="grid grid-cols-4 gap-3">
        {cards.map(([I, l, v]) => (
          <article className="card flex items-center gap-3 p-3" key={l}>
            <span className="grid size-11 place-items-center rounded-full bg-[#ffe9ec] text-coral">
              <I size={21} />
            </span>
            <div>
              <p className="text-xs">{l}</p>
              <b className="text-2xl">{v}</b>
              <small className="block text-[9px] text-emerald-500">
                Toàn bộ phạm vi được cấp quyền
              </small>
            </div>
          </article>
        ))}
      </section>
      <section className="d4-page-toolbar card flex h-12 justify-between px-3">
        <div className="flex h-full items-center border-b-2 border-coral px-2 text-xs text-coral">
          Danh sách giao dịch
        </div>
        <div className="flex items-center gap-2">
          <StaffTransferDialog
            onCreated={() => void transactionsQuery.refetch()}
          />
          <StaffMovementDialog
            onCreated={() => void transactionsQuery.refetch()}
          />
        </div>
      </section>
      <section className="grid min-h-0 flex-1 grid-cols-[1.9fr_.7fr] gap-3">
        <article
          ref={pagination.panelRef}
          className="card flex min-h-0 flex-col p-3"
        >
          <div className="d4-transaction-filters">
            <label className="relative">
              <Search
                className="absolute left-3 top-2.5 text-slate-400"
                size={15}
              />
              <input
                className="h-9 w-full rounded-lg border pl-9 text-[10px]"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  pagination.setPage(1);
                }}
                placeholder="Tìm mã giao dịch, khách hàng..."
              />
            </label>
            <select
              className="h-9 rounded-lg border px-2 text-[10px]"
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                pagination.setPage(1);
              }}
              aria-label="Loại giao dịch"
            >
              <option value="">Tất cả loại</option>
              {Object.entries(transactionTypeLabels).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-lg border px-2 text-[10px]"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                pagination.setPage(1);
              }}
              aria-label="Trạng thái giao dịch"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="Success">Thành công</option>
              <option value="Pending">Đang xử lý</option>
              <option value="Failed">Thất bại</option>
              <option value="Cancelled">Đã hủy</option>
            </select>
            <button
              onClick={reset}
              className="border border-coral text-[10px] text-coral"
            >
              <Filter className="inline" size={13} /> Đặt lại
            </button>
            <label>
              Từ ngày
              <input
                type="date"
                aria-label="Từ ngày"
                value={filters.from}
                onChange={(event) => setFilter("from", event.target.value)}
              />
            </label>
            <label>
              Đến ngày
              <input
                type="date"
                aria-label="Đến ngày"
                value={filters.to}
                onChange={(event) => setFilter("to", event.target.value)}
              />
            </label>
            <label>
              Tài khoản
              <select
                aria-label="Tài khoản"
                value={filters.account}
                onChange={(event) => setFilter("account", event.target.value)}
              >
                <option value="">
                  {accountsQuery.isError
                    ? "Không tải được tài khoản"
                    : "Tất cả tài khoản"}
                </option>
                {(accountsQuery.data ?? []).map((account) => (
                  <option key={account.accountid} value={account.accountid}>
                    {account.accountnumber}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Số tiền (VND)
              <select
                aria-label="Khoảng số tiền"
                value={filters.amount}
                onChange={(event) => setFilter("amount", event.target.value)}
              >
                {amountRanges.map((range) => (
                  <option key={range.value} value={range.value}>
                    {range.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {dateError && (
            <p role="alert" className="my-2 text-xs text-red-600">
              Ngày kết thúc phải từ ngày bắt đầu trở đi.
            </p>
          )}
          <div className="staff-table-scroll">
            <table className="mt-3 w-full table-fixed text-left text-[10px]">
              <thead className="bg-slate-50">
                <tr>
                  {[
                    "Mã giao dịch",
                    "Khách hàng",
                    "Loại giao dịch",
                    "Số tiền",
                    "Thời gian",
                    "Trạng thái",
                    "Thao tác",
                  ].map((x) => (
                    <th className="p-2" key={x}>
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactionsQuery.isPending && (
                  <tr>
                    <td colSpan={7} className="p-3 text-center">
                      Đang tải giao dịch…
                    </td>
                  </tr>
                )}
                {transactionsQuery.isError && (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-3 text-center text-red-600"
                      role="alert"
                    >
                      Không thể tải giao dịch.{" "}
                      <button
                        className="underline"
                        onClick={() => void transactionsQuery.refetch()}
                      >
                        Thử lại
                      </button>
                    </td>
                  </tr>
                )}
                {transactionsQuery.isSuccess && !data.length && (
                  <tr>
                    <td colSpan={7} className="p-3 text-center text-slate-500">
                      Không có giao dịch phù hợp.
                    </td>
                  </tr>
                )}
                {transactionsQuery.isSuccess &&
                  pagination.visibleItems.map((x) => (
                    <tr className="border-t" key={x.id}>
                      <td className="p-2 font-semibold" title={x.id}>
                        {x.id}
                      </td>
                      <td className="p-2">{x.customer}</td>
                      <td className="p-2">{x.type}</td>
                      <td className="p-2 font-semibold">{x.amountText}</td>
                      <td className="p-2">{x.time}</td>
                      <td className="p-2">
                        <RecordStatus
                          status={x.raw.status}
                          domain="transaction"
                        />
                      </td>
                      <td className="p-2">
                        <TransactionRecordButton
                          transaction={x.raw}
                          account={
                            [x.raw.sourceaccountid, x.raw.destinationaccountid]
                              .filter((id) => id != null)
                              .map(
                                (id) =>
                                  accountsQuery.data?.find(
                                    (account) =>
                                      Number(account.accountid) === Number(id),
                                  )?.accountnumber ?? `TK #${id}`,
                              )
                              .join(" → ") || "Chưa cập nhật"
                          }
                          staffDetails={[
                            ["Khách hàng", x.customer],
                            ["Đánh giá rủi ro", x.risk],
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <ListPagination {...pagination} noun="giao dịch" />
        </article>
        <aside className="grid min-h-0 grid-rows-2 gap-3">
          <article className="card p-3">
            <h2 className="text-base font-black">Tỷ lệ loại giao dịch</h2>
            <DistributionChart
              items={summary.groups.map((group) => ({
                label: group.label,
                value: group.count,
              }))}
              label="giao dịch"
              ready={transactionsQuery.isSuccess}
              error={transactionsQuery.isError}
            />
          </article>
          <article className="card flex flex-col p-3">
            <h2 className="text-base font-black">Giao dịch gần đây</h2>
            <div className="mt-2 space-y-2">
              {transactions
                .slice(0, 3)
                .map((row) => ({ ...presentTransaction(row), raw: row }))
                .map((x, i) => (
                  <div className="flex items-center gap-2" key={x.id}>
                    <span className="grid size-5 place-items-center rounded-full bg-coral text-[10px] font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="grid size-8 place-items-center rounded bg-[#fff0f0] text-coral">
                      <ArrowLeftRight size={15} />
                    </span>
                    <p className="text-[10px]">
                      <b className="block">{x.customer}</b>
                      <span className="text-slate-500">{x.amountText}</span>
                    </p>
                    <TransactionRecordButton
                      transaction={x.raw}
                      account={
                        [x.raw.sourceaccountid, x.raw.destinationaccountid]
                          .filter((id) => id != null)
                          .map(
                            (id) =>
                              accountsQuery.data?.find(
                                (account) =>
                                  Number(account.accountid) === Number(id),
                              )?.accountnumber ?? `TK #${id}`,
                          )
                          .join(" → ") || "Chưa cập nhật"
                      }
                      staffDetails={[
                        ["Khách hàng", x.customer],
                        ["Đánh giá rủi ro", x.risk],
                      ]}
                    />
                  </div>
                ))}
            </div>
            <button
              onClick={reset}
              className="mt-auto h-7 rounded-md border border-coral text-[10px] text-coral"
            >
              Xem tất cả giao dịch →
            </button>
          </article>
        </aside>
      </section>
    </div>
  );
}
