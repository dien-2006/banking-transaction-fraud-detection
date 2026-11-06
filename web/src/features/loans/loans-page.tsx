"use client";
import { RecordStatus } from "@/components/record-status";
import { recordStatus } from "@/lib/record-status";
import { DistributionChart } from "@/components/distribution-chart";

import {
  BadgeDollarSign,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Filter,
  Search,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ListPagination,
  useListPagination,
} from "@/components/list-pagination";
import { RecordViewButton } from "@/components/record-view-button";
import { recordText } from "@/lib/record-value";
import { bankService } from "@/services/bank.service";
import { summarizeLoans } from "@/lib/loan-summary";
import { loadAllPages } from "@/lib/paged-data";
import { useSessionUser } from "@/components/session-context";
import { ResourceCreateDialog } from "@/features/live/resource-create-dialog";

const money = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});
export function LoansPage() {
  const user = useSessionUser();
  const loansQuery = useQuery({
    queryKey: ["staff-loans", user.role, user.id, user.branchId],
    queryFn: async () => {
      const rows = await loadAllPages(bankService.loans, (row) =>
        recordText(row, ["loanid", "loancode"]),
      );
      return { rows, summary: summarizeLoans(rows) };
    },
  });
  const attentionRows = (loansQuery.data?.rows ?? [])
    .filter((row) => row.status === "Pending" || row.status === "Overdue")
    .sort((a, b) => Number(b.loanid) - Number(a.loanid))
    .slice(0, 3);
  const loans = useMemo(
    () =>
      (loansQuery.data?.rows ?? []).map((row) => [
        recordText(row, ["loancode", "loanid"]),
        recordText(row, ["customername", "fullname", "customerid"]),
        recordText(row, ["loantypename", "productname", "loantypeid"]),
        money.format(
          Number(
            recordText(row, ["principalamount", "outstandingamount"], "0"),
          ),
        ),
        `${recordText(row, ["interestrate"], "0")}%`,
        recordText(row, ["status"]),
      ]),
    [loansQuery.data],
  );
  const [q, setQ] = useState(""),
    [tab, setTab] = useState("Danh sách khoản vay");
  const [status, setStatus] = useState(""),
    [product, setProduct] = useState("");
  const filtered = useMemo(
    () =>
      loans.filter(
        (x) =>
          (!status || x[5] === status) &&
          (!product || x[2] === product) &&
          x
            .join(" ")
            .toLocaleLowerCase("vi")
            .includes(q.trim().toLocaleLowerCase("vi")),
      ),
    [q, loans, status, product],
  );
  const pagination = useListPagination(filtered, { fitViewportOnly: true });
  const data = pagination.visibleItems;
  const reset = () => {
    setQ("");
    setStatus("");
    setProduct("");
    pagination.setPage(1);
  };
  const summary = loansQuery.data?.summary;
  const outstanding = summary?.outstanding ?? 0;
  const products = summary?.products ?? [];
  const composition =
    products.length > 3
      ? [
          ...products.slice(0, 2),
          {
            name: "Khác",
            amount: products
              .slice(2)
              .reduce((sum, product) => sum + product.amount, 0),
          },
        ]
      : products;
  const summaryStatus = loansQuery.isError
    ? "Không tải được thống kê"
    : loansQuery.isPending
      ? "Đang tải thống kê…"
      : "Toàn bộ khoản vay được cấp quyền";
  const cards = [
    [BadgeDollarSign, "Tổng dư nợ", summary ? money.format(outstanding) : "—"],
    [
      CheckCircle2,
      "Khoản vay đang hoạt động",
      summary ? String(summary.active) : "—",
    ],
    [Clock3, "Chờ phê duyệt", summary ? String(summary.pending) : "—"],
    [CircleAlert, "Quá hạn cần xử lý", summary ? String(summary.overdue) : "—"],
  ] as const;
  return (
    <div className="staff-data-page customers-page-content flex flex-col gap-2.5 text-navy">
      <section className="relative h-60 overflow-hidden rounded-xl border border-red-100">
        <Image
          src="/loans-hero.png"
          alt="Quản lý khoản vay"
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
                {summaryStatus}
              </small>
            </div>
          </article>
        ))}
      </section>
      <section className="d4-page-toolbar card flex h-12 justify-between px-3">
        <div className="flex h-full gap-4">
          {["Danh sách khoản vay", "Thống kê", "Lịch sử thay đổi"].map((x) => (
            <button
              className={
                tab === x
                  ? "border-b-2 border-coral px-2 text-xs text-coral"
                  : "px-2 text-xs"
              }
              onClick={() => setTab(x)}
              key={x}
            >
              {x}
            </button>
          ))}
        </div>
        <ResourceCreateDialog
          resource="loans"
          onCreated={() => void loansQuery.refetch()}
        />
      </section>
      {tab !== "Danh sách khoản vay" ? (
        <section className="card flex-1 p-5">
          <h2 className="text-lg font-black">{tab}</h2>
          {tab === "Thống kê" ? (
            <div className="mt-4 space-y-3 text-sm">
              {products.map((row) => (
                <p key={row.name}>
                  {row.name}: <b>{money.format(row.amount)}</b> dư nợ
                </p>
              ))}
              {!products.length && (
                <p>
                  {loansQuery.isPending
                    ? "Đang tải thống kê…"
                    : loansQuery.isError
                      ? "Không thể tải thống kê."
                      : "Chưa có dữ liệu khoản vay."}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 text-sm">
              <p>Nhật ký lưu lại các thay đổi được hệ thống ghi nhận.</p>
              {user.role === "admin" ? (
                <Link className="btn-secondary mt-3" href="/admin/audit-logs">
                  Mở nhật ký hoạt động
                </Link>
              ) : (
                <p className="mt-2 text-slate-500">
                  Liên hệ quản trị viên để tra cứu nhật ký thay đổi khoản vay.
                </p>
              )}
            </div>
          )}
        </section>
      ) : (
        <section className="grid min-h-0 flex-1 grid-cols-[1.9fr_.7fr] gap-3">
          <article
            ref={pagination.panelRef}
            className="card flex min-h-0 flex-col p-3"
          >
            <div className="grid grid-cols-[1.5fr_.7fr_.7fr_.35fr] gap-2">
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
                  placeholder="Tìm mã khoản vay, khách hàng..."
                />
              </label>
              <select
                aria-label="Sản phẩm khoản vay"
                className="min-w-0 rounded-lg border text-[10px]"
                value={product}
                onChange={(event) => {
                  setProduct(event.target.value);
                  pagination.setPage(1);
                }}
              >
                <option value="">Tất cả sản phẩm</option>
                {[...new Set(loans.map((row) => row[2]))].map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
              <select
                aria-label="Trạng thái khoản vay"
                className="min-w-0 rounded-lg border text-[10px]"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  pagination.setPage(1);
                }}
              >
                <option value="">Tất cả trạng thái</option>
                {[...new Set(loans.map((row) => row[5]))].map((name) => (
                  <option key={name} value={name}>
                    {recordStatus(name, "loan").label}
                  </option>
                ))}
              </select>
              <button
                onClick={reset}
                className="border border-coral text-[10px] text-coral"
              >
                <Filter className="inline" size={13} /> Đặt lại
              </button>
            </div>
            <div className="staff-table-scroll">
              <table className="mt-3 w-full table-fixed text-left text-[10px]">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      "Mã khoản vay",
                      "Khách hàng",
                      "Sản phẩm",
                      "Số tiền",
                      "Lãi suất",
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
                  {loansQuery.isPending && (
                    <tr>
                      <td colSpan={7} className="p-3 text-center">
                        Đang tải khoản vay…
                      </td>
                    </tr>
                  )}
                  {loansQuery.isError && (
                    <tr>
                      <td
                        colSpan={7}
                        className="p-3 text-center text-red-600"
                        role="alert"
                      >
                        Không thể tải khoản vay.{" "}
                        <button
                          className="underline"
                          onClick={() => void loansQuery.refetch()}
                        >
                          Thử lại
                        </button>
                      </td>
                    </tr>
                  )}
                  {loansQuery.isSuccess && !filtered.length && (
                    <tr>
                      <td colSpan={7} className="p-3 text-center">
                        Không có khoản vay phù hợp.
                      </td>
                    </tr>
                  )}
                  {loansQuery.isSuccess &&
                    data.map((x) => (
                      <tr className="border-t" key={x[0]}>
                        <td className="p-2 font-semibold">{x[0]}</td>
                        <td className="p-2">{x[1]}</td>
                        <td className="p-2">{x[2]}</td>
                        <td className="p-2 font-semibold">{x[3]}</td>
                        <td className="p-2">{x[4]}</td>
                        <td className="p-2">
                          <RecordStatus status={x[5]} domain="loan" />
                        </td>
                        <td className="p-2">
                          <RecordViewButton
                            record={[
                              ...x.slice(0, 5),
                              recordStatus(x[5], "loan").label,
                            ]}
                            title="Chi tiết khoản vay"
                            labels={[
                              "Mã khoản vay",
                              "Khách hàng",
                              "Sản phẩm",
                              "Số tiền",
                              "Lãi suất",
                              "Trạng thái",
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <ListPagination {...pagination} noun="khoản vay" />
          </article>
          <aside className="grid min-h-0 grid-rows-2 gap-3">
            <article className="card p-3">
              <h2 className="text-base font-black">Cơ cấu dư nợ</h2>
              <DistributionChart
                items={composition.map((product) => ({
                  label: product.name,
                  value: product.amount,
                }))}
                label="dư nợ VND"
                ready={loansQuery.isSuccess}
                error={loansQuery.isError}
                centerValue={new Intl.NumberFormat("vi-VN", {
                  notation: "compact",
                  maximumFractionDigits: 1,
                }).format(outstanding)}
                formatValue={(value) => money.format(value)}
                emptyText="Chưa có dư nợ."
              />
            </article>
            <article className="card flex flex-col p-3">
              <h2 className="text-base font-black">Hồ sơ cần xử lý</h2>
              <div className="mt-2 space-y-2">
                {loansQuery.isPending && (
                  <p className="text-xs text-slate-500">Đang tải hồ sơ…</p>
                )}
                {loansQuery.isError && (
                  <p className="text-xs text-red-600">
                    Không thể tải hồ sơ cần xử lý.
                  </p>
                )}
                {loansQuery.isSuccess && !attentionRows.length && (
                  <p className="text-xs text-slate-500">
                    Không có hồ sơ chờ duyệt hoặc quá hạn.
                  </p>
                )}
                {attentionRows.map((x, i) => (
                  <div
                    className="flex min-w-0 items-center gap-2"
                    key={String(x.loanid)}
                  >
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-coral text-[10px] font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="grid size-8 shrink-0 place-items-center rounded bg-[#fff0f0] text-coral">
                      <BadgeDollarSign size={15} />
                    </span>
                    <p className="min-w-0 flex-1 text-[10px]">
                      <b
                        className="block truncate"
                        title={recordText(x, [
                          "customername",
                          "fullname",
                          "customerid",
                        ])}
                      >
                        {recordText(x, [
                          "customername",
                          "fullname",
                          "customerid",
                        ])}
                      </b>
                      <span className="block truncate text-slate-500">
                        {recordText(x, ["loancode"])}
                      </span>
                    </p>
                    <span className="ml-auto text-coral">›</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  setTab("Danh sách khoản vay");
                  setQ("");
                  pagination.setPage(1);
                }}
                className="mt-auto h-7 rounded-md border border-coral text-[10px] text-coral"
              >
                Xem tất cả khoản vay →
              </button>
            </article>
          </aside>
        </section>
      )}
    </div>
  );
}
