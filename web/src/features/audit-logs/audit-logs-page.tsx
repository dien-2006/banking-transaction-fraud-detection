"use client";

import {
  FileClock,
  Filter,
  LockKeyhole,
  Search,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { StaffHero } from "@/components/staff-hero";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSessionUser } from "@/components/session-context";
import {
  ListPagination,
  useListPagination,
} from "@/components/list-pagination";
import { RecordViewButton } from "@/components/record-view-button";
import { bankService } from "@/services/bank.service";
import { loadAuditLogs } from "@/lib/audit-data";

const typeTone: Record<string, string> = {
  "Tạo mới": "bg-rose-50 text-red-500",
  "Cập nhật": "bg-orange-50 text-orange-600",
  Xóa: "bg-red-50 text-red-600",
  "Đổi trạng thái": "bg-blue-50 text-blue-600",
};

function AuditHero() {
  return (
    <StaffHero
      kind="audit"
      eyebrow="GIÁM SÁT HỆ THỐNG"
      title="Nhật ký"
      accent="hoạt động"
      description="Theo dõi và truy vết hoạt động của người dùng trong hệ thống."
    />
  );
}

export function AuditLogsPage({
  role = "admin",
}: {
  role?: "admin" | "employee";
}) {
  const session = useSessionUser();
  const auditQuery = useQuery({
    queryKey: ["admin-audit-old-ui", role, session.id, session.branchId],
    queryFn: () => loadAuditLogs(bankService.auditLogs),
    staleTime: 60_000,
  });
  const logs = useMemo(() => auditQuery.data ?? [], [auditQuery.data]);
  const [user, setUser] = useState("");
  const [day, setDay] = useState("");
  const [q, setQ] = useState(""),
    [type, setType] = useState(""),
    [level, setLevel] = useState(""),
    [tab, setTab] = useState("Danh sách hoạt động");
  const data = useMemo(
    () =>
      logs.filter(
        (x) =>
          (!q ||
            Object.values(x)
              .join(" ")
              .toLowerCase()
              .includes(q.toLowerCase())) &&
          (!type || x.type === type) &&
          (!level || x.entity === level) &&
          (!user || x.userKey === user) &&
          (!day || x.day === day),
      ),
    [q, type, level, user, day, logs],
  );
  const pagination = useListPagination(data, { fitViewportOnly: true });
  useEffect(() => pagination.setPage(1), [q, type, level, user, day]);
  const users = Array.from(
    new Map(logs.map((x) => [x.userKey, x.user])).entries(),
  );
  const actions = Array.from(new Set(logs.map((x) => x.type))).sort();
  const entities = Array.from(
    new Map(logs.map((x) => [x.entity, x.target])).entries(),
  );
  const kpis: Array<[typeof FileClock, string, string]> = [
    [FileClock, "Tổng số hoạt động", String(logs.length)],
    [
      UsersRound,
      "Người thực hiện",
      String(users.filter(([id]) => id !== "__system").length),
    ],
    [
      LockKeyhole,
      "Thao tác cập nhật",
      String(logs.filter((x) => x.action === "UPDATE").length),
    ],
    [
      ShieldCheck,
      "Thay đổi trạng thái",
      String(logs.filter((x) => x.action === "STATUS_CHANGE").length),
    ],
  ];
  const percent = (count: number) =>
    logs.length ? Math.round((count / logs.length) * 100) : 0;
  const actionCounts = actions.map((label) => ({
    label,
    count: logs.filter((x) => x.type === label).length,
  }));
  const entityCounts = entities
    .map(([id, label]) => ({
      label,
      count: logs.filter((x) => x.entity === id).length,
    }))
    .sort((a, b) => b.count - a.count);
  const entityPreview =
    entityCounts.length > 4
      ? [
          ...entityCounts.slice(0, 3),
          {
            label: "Khác",
            count: entityCounts
              .slice(3)
              .reduce((sum, item) => sum + item.count, 0),
          },
        ]
      : entityCounts;
  const topUsers = users
    .map(([id, name]) => ({
      id,
      name,
      count: logs.filter((x) => x.userKey === id).length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  const colors = ["#f5223e", "#ff9aa6", "#ffbd49", "#3aa3e8"];
  let boundary = 0;
  const gradient = actionCounts
    .map((item, index) => {
      const start = boundary;
      boundary += (item.count / Math.max(logs.length, 1)) * 100;
      return `${colors[index % colors.length]} ${start}% ${boundary}%`;
    })
    .join(", ");
  return (
    <div className="staff-data-page customers-page-content flex flex-col gap-2.5 text-navy">
      <AuditHero />
      <section className="grid grid-cols-4 gap-3">
        {kpis.map(([Icon, label, value], i) => (
          <article className="card flex items-center gap-3 p-3" key={label}>
            <span className="grid size-11 place-items-center rounded-full bg-[#ffe9ec] text-coral">
              <Icon size={21} />
            </span>
            <div>
              <p className="text-xs">{label}</p>
              <b className="text-2xl">{auditQuery.data ? value : "—"}</b>
              <small
                className={`block text-[9px] ${i === 2 ? "text-red-500" : "text-emerald-500"}`}
              >
                {auditQuery.isError
                  ? "Không tải được dữ liệu"
                  : auditQuery.isPending
                    ? "Đang tải…"
                    : "Theo nhật ký trong hệ thống"}
              </small>
            </div>
          </article>
        ))}
      </section>
      <section className="d4-page-toolbar card flex h-12 px-3">
        <div className="flex h-full gap-4">
          {(role === "employee"
            ? [
                "Danh sách hoạt động",
                "Thống kê hoạt động",
                "Đăng nhập hệ thống",
              ]
            : [
                "Danh sách hoạt động",
                "Thống kê hoạt động",
                "Hoạt động nhạy cảm",
                "Đăng nhập hệ thống",
                "Lịch sử thay đổi",
              ]
          ).map((x) => (
            <button
              className={
                tab === x
                  ? "border-b-2 border-coral px-2 text-xs font-semibold text-coral"
                  : "px-2 text-xs"
              }
              key={x}
              onClick={() => setTab(x)}
              disabled={
                !["Danh sách hoạt động", "Thống kê hoạt động"].includes(x)
              }
              title={
                !["Danh sách hoạt động", "Thống kê hoạt động"].includes(x)
                  ? "API chưa có dữ liệu cho chức năng này"
                  : undefined
              }
            >
              {x}
            </button>
          ))}
        </div>
      </section>
      {tab !== "Danh sách hoạt động" ? (
        <section className="grid min-h-0 flex-1 grid-cols-3 gap-3">
          <article className="card p-5 lg:col-span-2">
            <h2 className="text-lg font-black">{tab}</h2>
            <p className="mt-2 text-sm text-slate-500">
              Tổng hợp audit theo khoảng thời gian và phạm vi truy cập đã chọn.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {["Tạo mới", "Cập nhật", "Xóa", "Đổi trạng thái"].map((x) => (
                <div className="rounded-xl bg-slate-50 p-4" key={x}>
                  <p className="text-xs text-slate-500">{x}</p>
                  <b className="mt-2 block text-2xl">
                    {auditQuery.data
                      ? logs.filter((row) => row.type === x).length
                      : "—"}
                  </b>
                </div>
              ))}
            </div>
          </article>
          <article className="card p-5">
            <h2 className="text-lg font-black">Lưu ý bảo mật</h2>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Nhật ký chỉ hiển thị metadata cần thiết để truy vết. Mật khẩu,
              token và dữ liệu bí mật không được ghi hoặc hiển thị.
            </p>
          </article>
        </section>
      ) : (
        <section className="grid min-h-0 flex-1 grid-cols-[2.05fr_.62fr] gap-3">
          <article
            ref={pagination.panelRef}
            className="d4-list-panel card flex min-h-0 flex-col p-3"
          >
            <div className="grid grid-cols-[1.4fr_.58fr_.58fr_.55fr_.75fr_.3fr] gap-2">
              <label className="relative">
                <Search
                  className="absolute left-3 top-2.5 text-slate-400"
                  size={15}
                />
                <input
                  aria-label="Tìm nhật ký"
                  className="h-9 w-full rounded-lg border pl-9 text-[10px]"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Tìm kiếm theo người dùng, hành động, mô tả, địa chỉ IP..."
                />
              </label>
              <select
                aria-label="Người dùng"
                className="rounded-lg border px-2 text-[10px]"
                value={user}
                onChange={(event) => setUser(event.target.value)}
              >
                <option value="">Tất cả người thực hiện</option>
                {users.map(([id, name]) => (
                  <option value={id} key={id}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Loại hoạt động"
                className="rounded-lg border px-2 text-[10px]"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">Tất cả loại hoạt động</option>
                {actions.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <select
                aria-label="Loại đối tượng"
                className="rounded-lg border px-2 text-[10px]"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                <option value="">Tất cả đối tượng</option>
                {entities.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                aria-label="Ngày ghi nhật ký"
                className="h-9 min-w-0 rounded-lg border px-2 text-[10px]"
                value={day}
                onChange={(event) => setDay(event.target.value)}
              />
              <button
                onClick={() => pagination.setPage(1)}
                className="rounded-lg border border-coral text-[10px] text-coral"
              >
                <Filter className="inline" size={13} /> Lọc
              </button>
            </div>
            <div className="staff-table-scroll mt-2 min-h-0 overflow-auto">
              <table className="w-full table-fixed text-left text-[10px]">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      "Mã nhật ký",
                      "Thời gian",
                      "Người thực hiện",
                      "Địa chỉ IP",
                      "Hành động",
                      "Đối tượng",
                      "Mã đối tượng",
                      "Trường thay đổi",
                      "Chi tiết",
                    ].map((x) => (
                      <th className="p-2 font-medium" key={x}>
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditQuery.isPending && (
                    <tr>
                      <td
                        colSpan={9}
                        className="p-3 text-center text-slate-500"
                      >
                        Đang tải nhật ký…
                      </td>
                    </tr>
                  )}
                  {auditQuery.isError && (
                    <tr>
                      <td colSpan={9} className="p-3 text-center text-red-600">
                        Không thể tải nhật ký.{" "}
                        <button
                          onClick={() => {
                            void auditQuery.refetch();
                          }}
                        >
                          Thử lại
                        </button>
                      </td>
                    </tr>
                  )}
                  {auditQuery.isSuccess && !data.length && (
                    <tr>
                      <td
                        colSpan={9}
                        className="p-3 text-center text-slate-500"
                      >
                        Không có nhật ký phù hợp.
                      </td>
                    </tr>
                  )}
                  {pagination.visibleItems.map((x) => (
                    <tr className="border-t" key={x.id}>
                      <td className="p-1.5">{x.id}</td>
                      <td className="p-1.5">{x.time}</td>
                      <td className="p-1.5">{x.user}</td>
                      <td className="p-1.5">{x.ip}</td>
                      <td className="p-1.5">
                        <span
                          className={`inline-block rounded px-1 text-center ${typeTone[x.type] ?? "bg-slate-100 text-slate-600"}`}
                        >
                          {x.type}
                        </span>
                      </td>
                      <td className="p-1.5">{x.target}</td>
                      <td className="p-1.5">{x.entityId}</td>
                      <td className="p-1.5">{x.changes}</td>
                      <td className="p-1.5 text-center">
                        <RecordViewButton
                          record={{
                            "Mã nhật ký": x.id,
                            "Thời gian": x.time,
                            "Người thực hiện": x.user,
                            "Địa chỉ IP": x.ip,
                            "Hành động": x.type,
                            "Mã hành động": x.action,
                            "Đối tượng": x.target,
                            "Mã đối tượng": x.entityId,
                            "Trường thay đổi": x.changes,
                          }}
                          title={`Chi tiết nhật ký #${x.id}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPagination {...pagination} noun="hoạt động" />
          </article>
          <aside className="staff-secondary-panels grid min-h-0 grid-rows-[1.15fr_1fr_1.1fr] gap-3">
            <article className="card p-3">
              <h2 className="text-sm font-black">Cơ cấu hoạt động theo loại</h2>
              <div className="flex min-w-0 items-center gap-3 pt-2">
                <div
                  className="grid size-20 shrink-0 place-items-center rounded-full"
                  style={{
                    background: logs.length
                      ? `conic-gradient(${gradient})`
                      : "#edf0f5",
                  }}
                >
                  <div className="grid size-12 place-items-center rounded-full bg-white text-center">
                    <b className="text-sm" title={String(logs.length)}>
                      {auditQuery.data
                        ? logs.length.toLocaleString("vi-VN", {
                            notation: "compact",
                            maximumFractionDigits: 1,
                          })
                        : "—"}
                    </b>
                    <span className="text-[9px]">hoạt động</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-1.5 text-[10px]">
                  {actionCounts.map((item, index) => (
                    <p
                      className="flex min-w-0 items-center gap-2"
                      key={item.label}
                    >
                      <i
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: colors[index % colors.length] }}
                      />
                      <span
                        className="min-w-0 flex-1 truncate"
                        title={item.label}
                      >
                        {item.label}
                      </span>
                      <b>{percent(item.count)}%</b>
                    </p>
                  ))}
                </div>
              </div>
            </article>
            <article className="card p-3">
              <h2 className="text-sm font-black">Hoạt động theo đối tượng</h2>
              <div className="mt-3 space-y-2 text-[10px]">
                {entityPreview.map((item, index) => (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_minmax(24px,.7fr)_auto] items-center gap-2"
                    key={item.label}
                  >
                    <span className="truncate" title={item.label}>
                      {item.label}
                    </span>
                    <span className="h-3 rounded bg-slate-100">
                      <i
                        className="block h-full rounded"
                        style={{
                          width: `${percent(item.count)}%`,
                          background: colors[index % colors.length],
                        }}
                      />
                    </span>
                    <b>
                      {percent(item.count)}% ({item.count})
                    </b>
                  </div>
                ))}
              </div>
            </article>
            <article className="card p-3">
              <div className="flex justify-between">
                <h2 className="text-sm font-black">
                  Người thực hiện nhiều nhất
                </h2>
                <button
                  onClick={() => {
                    setQ("");
                    setType("");
                    setLevel("");
                    setUser("");
                    setDay("");
                    pagination.setPage(1);
                  }}
                  className="shrink-0 text-[9px] text-coral"
                >
                  Xem tất cả →
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {auditQuery.isSuccess && !topUsers.length && (
                  <p className="text-xs text-slate-500">Chưa có hoạt động.</p>
                )}
                {topUsers.map((item, i) => (
                  <button
                    type="button"
                    onClick={() => {
                      setQ("");
                      setType("");
                      setLevel("");
                      setDay("");
                      setUser(item.id);
                      pagination.setPage(1);
                    }}
                    className="flex w-full min-w-0 items-center gap-2 text-left text-[10px]"
                    key={item.id}
                  >
                    <b className="text-coral">{i + 1}</b>
                    <span className="grid size-7 place-items-center rounded-full bg-red-50 text-coral">
                      <UserRoundCheck size={14} />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {item.name}
                    </span>
                    <span className="shrink-0">
                      {item.count.toLocaleString("vi-VN")}
                    </span>
                  </button>
                ))}
              </div>
            </article>
          </aside>
        </section>
      )}
    </div>
  );
}
