"use client";
import {
  CircleArrowUp,
  CircleDollarSign,
  Filter,
  Landmark,
  Search,
  WalletCards,
} from "lucide-react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ListPagination,
  useListPagination,
} from "@/components/list-pagination";
import { RecordViewButton } from "@/components/record-view-button";
import { bankService } from "@/services/bank.service";
import { useSessionUser } from "@/components/session-context";
import { loadAllPages } from "@/lib/paged-data";
import { customerStatuses, accountKind, formatCurrency } from "@/lib/customer-data";
import { ResourceCreateDialog } from "@/features/live/resource-create-dialog";

const money = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});
export function AccountsPage() {
  const user = useSessionUser();
  const [q, setQ] = useState(""),
    [status, setStatus] = useState("");
  const accountsQuery = useQuery({
    queryKey: ["staff-accounts", user.role, user.id, user.branchId],
    queryFn: () => loadAllPages(bankService.accounts, (row) => row.accountid),
  });
  const accounts = accountsQuery.data ?? [];
  const filtered = useMemo(
    () =>
      accounts.filter(
        (row) =>
          (!status || row.status === status) &&
          `${row.accountnumber} ${row.customerid ?? ""} ${row.accounttypename} ${row.branchname}`
            .toLocaleLowerCase("vi")
            .includes(q.trim().toLocaleLowerCase("vi")),
      ),
    [accounts, q, status],
  );
  const pagination = useListPagination(filtered, { fitViewportOnly: true });
  const reset = () => {
    setQ("");
    setStatus("");
    pagination.setPage(1);
  };
  const display = (count: number) =>
    accountsQuery.isSuccess ? String(count) : "—";
  const rows = useMemo(
    () =>
      pagination.visibleItems.map((x) => [
        x.accountnumber,
        x.accountcategory === "INTERNAL"
          ? "Nội bộ ngân hàng"
          : `Khách hàng #${x.customerid ?? "—"}`,
        x.accounttypename || accountKind(x),
        formatCurrency(x.balance, x.currency),
        customerStatuses[x.status] ?? x.status,
      ]),
    [pagination.visibleItems],
  );
  const data = rows;
  const activeCount = accounts.filter((row) => row.status === "Active").length;
  const totalBalance = accounts
    .filter((row) => row.currency === "VND")
    .reduce((sum, x) => sum + Number(x.balance || 0), 0);
  const recentRows = accounts
    .slice(0, 3)
    .map((x) => [
      x.accountnumber,
      x.accountcategory === "INTERNAL"
        ? "Nội bộ ngân hàng"
        : `Khách hàng #${x.customerid ?? "—"}`,
    ]);
  const counts = new Map<string, number>();
  accounts.forEach((row) => {
    const label = row.accounttypename || accountKind(row);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  const types = Array.from(counts, ([label, count]) => ({ label, count })).sort(
    (a, b) => b.count - a.count,
  );
  const groups =
    types.length > 4
      ? [
          ...types.slice(0, 4),
          {
            label: "Khác",
            count: types.slice(4).reduce((sum, row) => sum + row.count, 0),
          },
        ]
      : types;
  const colors = ["#ff2143", "#ff9dad", "#ffbb4b", "#459cdb", "#8459e5"];
  let boundary = 0;
  const gradient = groups
    .map((group, i) => {
      const start = boundary;
      boundary += (group.count / Math.max(accounts.length, 1)) * 100;
      return `${colors[i]} ${start}% ${boundary}%`;
    })
    .join(",");
  const cards = [
    [WalletCards, "Tổng tài khoản", display(accounts.length)],
    [Landmark, "Đang hoạt động", display(activeCount)],
    [
      CircleDollarSign,
      "Tổng số dư VND",
      accountsQuery.isSuccess ? money.format(totalBalance) : "—",
    ],
    [
      CircleArrowUp,
      "Tạm phong tỏa",
      display(accounts.filter((row) => row.status === "Frozen").length),
    ],
  ] as const;
  return (
    <div className="staff-data-page customers-page-content flex flex-col gap-2.5 text-navy">
      <section className="relative h-60 overflow-hidden rounded-xl border border-red-100">
        <Image
          src="/accounts-hero.png"
          alt="Danh sách tài khoản"
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
          Danh sách tài khoản
        </div>
        <ResourceCreateDialog
          resource="accounts"
          onCreated={() => void accountsQuery.refetch()}
        />
      </section>
      <section className="grid min-h-0 flex-1 grid-cols-[1.9fr_.7fr] gap-3">
        <article
          ref={pagination.panelRef}
          className="card flex min-h-0 flex-col p-3"
        >
          <div className="grid grid-cols-[1.5fr_.7fr_.35fr] gap-2">
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
                placeholder="Tìm số tài khoản, mã khách hàng, chi nhánh..."
              />
            </label>
            <select
              className="h-9 rounded-lg border px-2 text-[10px]"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                pagination.setPage(1);
              }}
              aria-label="Trạng thái tài khoản"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="Active">Hoạt động</option>
              <option value="Frozen">Tạm phong tỏa</option>
              <option value="Closed">Đã đóng</option>
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
                    "Số tài khoản",
                    "Chủ tài khoản",
                    "Loại tài khoản",
                    "Số dư",
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
                {accountsQuery.isPending && (
                  <tr>
                    <td colSpan={6} className="p-3 text-center">
                      Đang tải tài khoản…
                    </td>
                  </tr>
                )}
                {accountsQuery.isError && (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-3 text-center text-red-600"
                      role="alert"
                    >
                      Không thể tải tài khoản.{" "}
                      <button
                        className="underline"
                        onClick={() => void accountsQuery.refetch()}
                      >
                        Thử lại
                      </button>
                    </td>
                  </tr>
                )}
                {accountsQuery.isSuccess && !filtered.length && (
                  <tr>
                    <td colSpan={6} className="p-3 text-center">
                      Không có tài khoản phù hợp.
                    </td>
                  </tr>
                )}
                {accountsQuery.isSuccess &&
                  data.map((x) => (
                    <tr className="border-t" key={x[0]}>
                      <td className="p-1 font-semibold">{x[0]}</td>
                      <td className="p-1">{x[1]}</td>
                      <td className="p-1">{x[2]}</td>
                      <td className="p-1 font-semibold">{x[3]}</td>
                      <td className="p-1">
                        <span
                          className={
                            x[4] === "Đang hoạt động"
                              ? "rounded bg-emerald-100 px-1 text-emerald-600"
                              : "rounded bg-amber-100 px-1 text-amber-600"
                          }
                        >
                          {x[4]}
                        </span>
                      </td>
                      <td className="p-1">
                        <RecordViewButton
                          record={x}
                          title="Chi tiết tài khoản"
                          labels={[
                            "Số tài khoản",
                            "Chủ tài khoản",
                            "Loại tài khoản",
                            "Số dư",
                            "Trạng thái",
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <ListPagination {...pagination} noun="tài khoản" />
        </article>
        <aside className="grid min-h-0 grid-rows-2 gap-3">
          <article className="card p-3">
            <h2 className="text-base font-black">Cơ cấu tài khoản</h2>
            <div className="flex items-center gap-4 pt-2">
              <div
                className="grid size-28 place-items-center rounded-full"
                style={{
                  background: accounts.length
                    ? `conic-gradient(${gradient})`
                    : "#edf0f5",
                }}
              >
                <div className="grid size-16 place-items-center rounded-full bg-white text-center">
                  <b className="text-xl">{display(accounts.length)}</b>
                  <span className="text-[9px]">tài khoản</span>
                </div>
              </div>
              <div className="space-y-2 text-[10px]">
                {groups.map((group, i) => (
                  <p key={group.label}>
                    <i
                      className="mr-1 inline-block size-2 rounded-full"
                      style={{ background: colors[i] }}
                    />
                    {group.label}{" "}
                    <b>
                      {Math.round((group.count / accounts.length) * 100)}% (
                      {group.count})
                    </b>
                  </p>
                ))}
                {accountsQuery.isSuccess && !accounts.length && (
                  <p>Chưa có dữ liệu tài khoản.</p>
                )}
              </div>
            </div>
          </article>
          <article className="card flex flex-col p-3">
            <h2 className="text-base font-black">Tài khoản mở gần đây</h2>
            <div className="mt-2 space-y-2">
              {recentRows.map((x, i) => (
                <div className="flex items-center gap-2" key={x[0]}>
                  <span className="grid size-5 place-items-center rounded-full bg-coral text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="grid size-8 place-items-center rounded bg-[#fff0f0] text-coral">
                    <WalletCards size={15} />
                  </span>
                  <p className="text-[10px]">
                    <b className="block">{x[1]}</b>
                    <span className="text-slate-500">{x[0]}</span>
                  </p>
                  <RecordViewButton
                    record={x}
                    title="Chi tiết tài khoản"
                    labels={["Số tài khoản", "Chủ tài khoản"]}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={reset}
              className="mt-auto h-7 rounded-md border border-coral text-[10px] text-coral"
            >
              Xem tất cả tài khoản →
            </button>
          </article>
        </aside>
      </section>
    </div>
  );
}
