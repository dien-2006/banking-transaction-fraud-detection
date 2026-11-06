"use client";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  Filter,
  PauseCircle,
  Search,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ListPagination,
  useListPagination,
} from "@/components/list-pagination";
import { Modal } from "@/components/ui";
import { bankService } from "@/services/bank.service";
import { BranchSidebar, type BranchView } from "./branch-sidebar";
import { loadAllPages } from "@/lib/paged-data";
import { useSessionUser } from "@/components/session-context";
import { ResourceCreateDialog } from "@/features/live/resource-create-dialog";
type ApiBranch = {
  branchid: number;
  branchcode: string;
  branchname: string;
  address: string;
  city: string;
  status: string;
  employeecount: number | string;
  customercount: number | string;
};
const imageFor = (code: string) =>
  code === "CN001"
    ? "/branch-head-office.png"
    : code === "CN002"
      ? "/branch-da-nang.png"
      : code === "CN003"
        ? "/branch-ho-chi-minh.png"
        : "/d4-headquarters.png";
const regionFor = (city: string) =>
  ["Hà Nội", "Hải Phòng"].some((value) => city.includes(value))
    ? "Miền Bắc"
    : city.includes("Đà Nẵng")
      ? "Miền Trung"
      : "Miền Nam";
export function BranchesPageFixed() {
  const user = useSessionUser();
  const [q, setQ] = useState(""),
    [region, setRegion] = useState(""),
    [status, setStatus] = useState(""),
    [tab, setTab] = useState("Danh sách chi nhánh"),
    [selected, setSelected] = useState<BranchView | null>(null);
  const query = useQuery({
    queryKey: ["admin-branches-live", user.id],
    queryFn: () =>
      loadAllPages(bankService.branches, (row) => String(row.branchid)),
  });
  const rows = useMemo<BranchView[]>(
    () =>
      ((query.data ?? []) as ApiBranch[]).map((x) => ({
        id: x.branchid,
        code: x.branchcode,
        name: x.branchname,
        address: x.address,
        city: x.city,
        region: regionFor(x.city),
        staff: Number(x.employeecount),
        customers: Number(x.customercount),
        status: x.status,
        image: imageFor(x.branchcode),
      })),
    [query.data],
  );
  const data = useMemo(
    () =>
      rows.filter(
        (x) =>
          (!q ||
            `${x.code} ${x.name} ${x.address}`
              .toLocaleLowerCase("vi")
              .includes(q.toLocaleLowerCase("vi"))) &&
          (!region || x.region === region) &&
          (!status || x.status === status),
      ),
    [rows, q, region, status],
  );
  const pagination = useListPagination(data, { fitViewportOnly: true });
  const {
    setPage,
    visibleItems: visibleRows,
    panelRef: listPanelRef,
  } = pagination;
  const active = rows.filter((x) => x.status === "Active").length,
    cards = [
      [Building2, "Tổng số chi nhánh", rows.length],
      [CheckCircle2, "Chi nhánh đang hoạt động", active],
      [PauseCircle, "Chi nhánh tạm ngừng", rows.length - active],
      [UsersRound, "Tổng nhân viên", rows.reduce((n, x) => n + x.staff, 0)],
    ] as const;
  if (query.isLoading)
    return <div className="h-80 animate-pulse rounded-xl bg-slate-100" />;
  if (query.isError)
    return (
      <div className="card p-6 text-sm text-red-600">
        Không thể tải dữ liệu chi nhánh từ PostgreSQL.{" "}
        <button className="underline" onClick={() => void query.refetch()}>
          Thử lại
        </button>
      </div>
    );
  return (
    <div className="staff-data-page branches-page-content flex flex-col gap-2.5 text-navy">
      <section className="relative h-60 overflow-hidden rounded-xl border border-red-100">
        <Image
          src="/branches-hero.png"
          alt="Danh sách chi nhánh"
          fill
          priority
          className="object-contain"
        />
      </section>
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map(([I, l, v]) => (
          <article className="card flex items-center gap-3 p-3" key={l}>
            <span className="grid size-11 place-items-center rounded-full bg-[#ffe9ec] text-coral">
              <I size={21} />
            </span>
            <div>
              <p className="text-xs">{l}</p>
              <b className="text-2xl">{v.toLocaleString("vi-VN")}</b>
              <small className="block text-[9px] text-emerald-500">
                Dữ liệu PostgreSQL
              </small>
            </div>
          </article>
        ))}
      </section>
      <section className="d4-page-toolbar card flex h-12 justify-between px-3">
        <div className="flex h-full gap-4">
          {[
            "Danh sách chi nhánh",
            "Bản đồ chi nhánh",
            "Thống kê",
            "Lịch sử thay đổi",
          ].map((x) => (
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
          resource="branches"
          onCreated={() => void query.refetch()}
        />
      </section>
      {tab !== "Danh sách chi nhánh" ? (
        <section className="card min-h-0 p-5">
          <h2 className="text-lg font-black">{tab}</h2>
          {tab === "Thống kê" ? (
            <div className="mt-3">
              <BranchSidebar
                rows={rows}
                ready={query.isSuccess}
                error={query.isError}
              />
            </div>
          ) : tab === "Lịch sử thay đổi" ? (
            <Link className="btn-secondary mt-3" href="/admin/audit-logs">
              Mở nhật ký hoạt động
            </Link>
          ) : (
            <div className="mt-3 grid max-h-full gap-3 overflow-auto md:grid-cols-2">
              {rows.map((row) => (
                <article className="rounded-xl border p-3 text-sm" key={row.id}>
                  <b>{row.name}</b>
                  <p className="my-2 text-slate-500">
                    {row.address}, {row.city}
                  </p>
                  <a
                    className="text-coral underline"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${row.address}, ${row.city}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Xem vị trí trên bản đồ
                  </a>
                </article>
              ))}
              {!rows.length && <p>Chưa có dữ liệu địa chỉ chi nhánh.</p>}
            </div>
          )}
        </section>
      ) : (
        <section className="branches-workspace grid min-h-0 gap-3 xl:grid-cols-[1.9fr_.7fr]">
          <article
            ref={listPanelRef}
            className="card flex min-h-0 flex-col p-3"
          >
            <div className="grid shrink-0 gap-2 sm:grid-cols-2 xl:grid-cols-[1.5fr_.6fr_.6fr_.35fr]">
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
                    setPage(1);
                  }}
                  placeholder="Tìm kiếm theo tên, mã, địa chỉ..."
                />
              </label>
              <select
                className="text-[10px]"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="Active">Hoạt động</option>
                <option value="Inactive">Tạm ngừng</option>
              </select>
              <select
                className="text-[10px]"
                value={region}
                onChange={(e) => {
                  setRegion(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tất cả khu vực</option>
                <option>Miền Bắc</option>
                <option>Miền Trung</option>
                <option>Miền Nam</option>
              </select>
              <button
                onClick={() => {
                  setQ("");
                  setStatus("");
                  setRegion("");
                  setPage(1);
                }}
                className="border border-coral text-[10px] text-coral"
              >
                <Filter className="inline" size={13} /> Đặt lại
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <table className="mt-3 w-full min-w-[760px] table-fixed text-left text-[10px]">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      "Mã chi nhánh",
                      "Tên chi nhánh",
                      "Địa chỉ",
                      "Khu vực",
                      "Nhân viên",
                      "Khách hàng",
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
                  {visibleRows.map((x) => (
                    <tr className="border-t" key={x.id}>
                      <td className="p-1">
                        <div className="flex items-center gap-1">
                          <span className="relative size-10 shrink-0 overflow-hidden rounded">
                            <Image
                              src={x.image}
                              alt={x.name}
                              fill
                              className="object-cover"
                              sizes="40px"
                            />
                          </span>
                          <span className="truncate">{x.code}</span>
                        </div>
                      </td>
                      <td className="truncate p-1 font-bold" title={x.name}>
                        {x.name}
                      </td>
                      <td className="truncate p-1" title={x.address}>
                        {x.address}
                      </td>
                      <td className="truncate p-1">{x.region}</td>
                      <td className="p-1">{x.staff.toLocaleString("vi-VN")}</td>
                      <td className="p-1">
                        {x.customers.toLocaleString("vi-VN")}
                      </td>
                      <td className="p-1">
                        <span
                          className={
                            x.status === "Active"
                              ? "rounded bg-emerald-100 px-1 text-emerald-600"
                              : "rounded bg-amber-100 px-1 text-amber-700"
                          }
                        >
                          {x.status === "Active" ? "Hoạt động" : "Tạm ngừng"}
                        </span>
                      </td>
                      <td className="p-1">
                        <button
                          className="d4-view-button"
                          onClick={() => setSelected(x)}
                        >
                          Xem
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPagination {...pagination} noun="chi nhánh" />
          </article>
          <BranchSidebar
            rows={rows}
            ready={query.isSuccess}
            error={query.isError}
          />
        </section>
      )}
      <Modal
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        title="Chi tiết chi nhánh"
      >
        {selected && (
          <div className="divide-y rounded-xl bg-slate-50 px-4">
            {[
              ["Mã chi nhánh", selected.code],
              ["Tên chi nhánh", selected.name],
              ["Địa chỉ", selected.address],
              ["Khu vực", selected.region],
              ["Nhân viên", selected.staff.toLocaleString("vi-VN")],
              ["Khách hàng", selected.customers.toLocaleString("vi-VN")],
              [
                "Trạng thái",
                selected.status === "Active" ? "Hoạt động" : "Tạm ngừng",
              ],
            ].map(([label, value]) => (
              <div
                className="flex items-center justify-between gap-6 py-3 text-sm"
                key={label}
              >
                <span className="text-slate-500">{label}</span>
                <b className="text-right text-navy">{value}</b>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
