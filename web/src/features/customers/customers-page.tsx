"use client";
import {
  BadgeCheck,
  CircleDollarSign,
  Filter,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ListPagination,
  useListPagination,
} from "@/components/list-pagination";
import { RecordViewButton } from "@/components/record-view-button";
import { activeStatus, recordText } from "@/lib/record-value";
import { bankService } from "@/services/bank.service";
import { useSessionUser } from "@/components/session-context";
import { loadAllPages } from "@/lib/paged-data";
import { isVerified } from "@/lib/staff-data";
import { ResourceCreateDialog } from "@/features/live/resource-create-dialog";

export function CustomersPage() {
  const user = useSessionUser();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const customersQuery = useQuery({
    queryKey: ["staff-customers", user.role, user.id, user.branchId],
    queryFn: () =>
      loadAllPages(bankService.customers, (row) =>
        recordText(row, ["customerid", "customercode"]),
      ),
  });
  const customers = useMemo(
    () =>
      (customersQuery.data ?? []).map((row) => {
        const rawStatus = recordText(row, ["status"], "Chưa cập nhật");
        const verified = recordText(
          row,
          ["kycstatus", "verificationstatus", "isverified"],
          "Chưa cập nhật",
        );
        return [
          recordText(row, ["customercode", "code", "customerid"]),
          recordText(row, ["fullname", "name"]),
          recordText(row, ["phone", "phonenumber"]),
          recordText(row, ["city", "address", "customersegment"]),
          isVerified(verified)
            ? "Đã xác minh"
            : verified === "false"
              ? "Chưa xác minh"
              : verified,
          activeStatus(rawStatus) ? "Đang hoạt động" : rawStatus,
        ];
      }),
    [customersQuery.data],
  );
  const filtered = useMemo(
    () =>
      customers.filter(
        (x) =>
          (!status ||
            x[5] === (status === "Active" ? "Đang hoạt động" : status)) &&
          x
            .join(" ")
            .toLocaleLowerCase("vi")
            .includes(q.trim().toLocaleLowerCase("vi")),
      ),
    [customers, status, q],
  );
  const pagination = useListPagination(filtered, { fitViewportOnly: true });
  const data = pagination.visibleItems;
  const reset = () => {
    setQ("");
    setStatus("");
    pagination.setPage(1);
  };
  const verifiedCount = customers.filter((x) => x[4] === "Đã xác minh").length;
  const priorityCount = (customersQuery.data ?? []).filter((row) =>
    ["VIP", "PRIORITY", "ƯU TIÊN"].includes(
      recordText(row, ["customersegment", "segment"], "").toLocaleUpperCase(
        "vi",
      ),
    ),
  ).length;
  const value = (count: number) =>
    customersQuery.isSuccess ? String(count) : "—";
  const counts = new Map<string, number>();
  (customersQuery.data ?? []).forEach((row) => {
    const label = recordText(
      row,
      ["customersegment", "segment"],
      "Chưa phân loại",
    );
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  const sortedGroups = Array.from(counts, ([label, count]) => ({
    label,
    count,
  })).sort((a, b) => b.count - a.count);
  const groups =
    sortedGroups.length > 4
      ? [
          ...sortedGroups.slice(0, 4),
          {
            label: "Phân khúc khác",
            count: sortedGroups
              .slice(4)
              .reduce((sum, row) => sum + row.count, 0),
          },
        ]
      : sortedGroups;
  const colors = ["#ff2143", "#ff9dad", "#ffbb4b", "#459cdb", "#8459e5"];
  let cursor = 0;
  const gradient = groups
    .map((group, i) => {
      const start = cursor;
      cursor += (group.count / Math.max(customers.length, 1)) * 100;
      return `${colors[i]} ${start}% ${cursor}%`;
    })
    .join(",");
  const cards = [
    [UsersRound, "Tổng khách hàng", value(customers.length)],
    [BadgeCheck, "Đã xác minh KYC", value(verifiedCount)],
    [CircleDollarSign, "Khách hàng ưu tiên", value(priorityCount)],
    [
      ShieldCheck,
      "Chưa có xác minh KYC",
      value(customers.length - verifiedCount),
    ],
  ] as const;
  return (
    <div className="staff-data-page customers-page-content flex flex-col gap-2.5 text-navy">
      <section className="relative h-60 overflow-hidden rounded-xl border border-red-100">
        <Image
          src="/customers-hero.png"
          alt="Danh sách khách hàng"
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
          Danh sách khách hàng
        </div>
        <ResourceCreateDialog
          resource="customers"
          onCreated={() => void customersQuery.refetch()}
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
                placeholder="Tìm theo tên, mã khách hàng, số điện thoại..."
              />
            </label>
            <select
              className="h-9 rounded-lg border px-2 text-[10px]"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                pagination.setPage(1);
              }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="Active">Đang hoạt động</option>
              <option value="Inactive">Không hoạt động</option>
              <option value="Blocked">Đã khóa</option>
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
                    "Mã KH",
                    "Họ và tên",
                    "Điện thoại",
                    "Khu vực",
                    "Xác minh",
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
                {customersQuery.isLoading && (
                  <tr>
                    <td className="p-3 text-center text-slate-500" colSpan={7}>
                      Đang tải dữ liệu khách hàng…
                    </td>
                  </tr>
                )}
                {customersQuery.isError && (
                  <tr>
                    <td className="p-3 text-center text-red-600" colSpan={7}>
                      Không thể tải dữ liệu khách hàng.{" "}
                      <button
                        className="underline"
                        onClick={() => void customersQuery.refetch()}
                      >
                        Thử lại
                      </button>
                    </td>
                  </tr>
                )}
                {customersQuery.isSuccess && !filtered.length && (
                  <tr>
                    <td colSpan={7} className="p-3 text-center">
                      Không có khách hàng phù hợp.
                    </td>
                  </tr>
                )}
                {customersQuery.isSuccess &&
                  data.map((x) => (
                    <tr className="border-t" key={x[0]}>
                      <td className="p-1">{x[0]}</td>
                      <td className="p-1">
                        <div className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="grid size-6 shrink-0 place-items-center rounded-full bg-rose-50 text-coral"
                          >
                            {x[1].trim().split(/\s+/).at(-1)?.slice(0, 1)}
                          </span>
                          <b className="min-w-0 flex-1 truncate">{x[1]}</b>
                        </div>
                      </td>
                      <td className="p-1">{x[2]}</td>
                      <td className="p-1">{x[3]}</td>
                      <td className="p-1">
                        <span className="rounded bg-blue-50 px-1 text-blue-600">
                          {x[4]}
                        </span>
                      </td>
                      <td className="p-1">
                        <span
                          className={
                            x[5] === "Đang hoạt động"
                              ? "rounded bg-emerald-100 px-1 text-emerald-600"
                              : "rounded bg-amber-100 px-1 text-amber-600"
                          }
                        >
                          {x[5]}
                        </span>
                      </td>
                      <td className="p-1">
                        <RecordViewButton
                          record={x}
                          title="Chi tiết khách hàng"
                          labels={[
                            "Mã khách hàng",
                            "Họ và tên",
                            "Điện thoại",
                            "Khu vực",
                            "Xác minh",
                            "Trạng thái",
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <ListPagination {...pagination} noun="khách hàng" />
        </article>
        <aside className="grid min-h-0 grid-rows-2 gap-3">
          <article className="card p-3">
            <h2 className="text-base font-black">Phân khúc khách hàng</h2>
            <div className="flex items-center gap-4 pt-2">
              <div
                className="grid size-28 place-items-center rounded-full"
                style={{
                  background: customers.length
                    ? `conic-gradient(${gradient})`
                    : "#edf0f5",
                }}
              >
                <div className="grid size-16 place-items-center rounded-full bg-white text-center">
                  <b className="text-xl">{value(customers.length)}</b>
                  <span className="text-[9px]">khách hàng</span>
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
                      {Math.round((group.count / customers.length) * 100)}% (
                      {group.count})
                    </b>
                  </p>
                ))}
                {customersQuery.isSuccess && !customers.length && (
                  <p>Chưa có dữ liệu phân khúc.</p>
                )}
              </div>
            </div>
          </article>
          <article className="card flex flex-col p-3">
            <h2 className="text-base font-black">Khách hàng gần đây</h2>
            <div className="mt-2 space-y-2">
              {customers.slice(0, 3).map((x, i) => (
                <div className="flex items-center gap-2" key={x[0]}>
                  <span className="grid size-5 place-items-center rounded-full bg-coral text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  <span
                    aria-hidden="true"
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-rose-50 text-coral"
                  >
                    {x[1].trim().split(/\s+/).at(-1)?.slice(0, 1)}
                  </span>
                  <p className="min-w-0 flex-1 text-[10px]">
                    <b className="block truncate" title={x[1]}>
                      {x[1]}
                    </b>
                    <span
                      className="block truncate text-slate-500"
                      title={x[3]}
                    >
                      {x[3]}
                    </span>
                  </p>
                  <RecordViewButton
                    record={x}
                    title="Chi tiết khách hàng"
                    labels={[
                      "Mã khách hàng",
                      "Họ và tên",
                      "Điện thoại",
                      "Khu vực",
                      "Xác minh",
                      "Trạng thái",
                    ]}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={reset}
              className="mt-auto h-7 rounded-md border border-coral text-[10px] text-coral"
            >
              Xem tất cả khách hàng →
            </button>
          </article>
        </aside>
      </section>
    </div>
  );
}
