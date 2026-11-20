"use client";
import {
  DistributionChart,
  distributionColors,
} from "@/components/distribution-chart";

import {
  FileClock,
  Filter,
  LockKeyhole,
  Search,
  RefreshCw,
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
import { loadAuditLogs, summarizeAuditLogs } from "@/lib/audit-data";

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
    queryKey: ["admin-audit", role, session.id, session.branchId],
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
            [x.id,x.time,x.user,x.actorKnown?x.userKey:"",x.actorCode,x.ip,x.type,x.action,x.target,x.entity,x.entityId,x.changes]
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
  const pagination = useListPagination(data, { fitViewportOnly: true, pageSize: role === "admin" ? 11 : undefined });
  useEffect(() => pagination.setPage(1), [q, type, level, user, day]);
  const users = Array.from(
    new Map(logs.map((x) => [x.userKey, x.user])).entries(),
  );
  const actions = Array.from(new Set(logs.map((x) => x.type))).sort();
  const entities = Array.from(
    new Map(logs.map((x) => [x.entity, x.target])).entries(),
  );
  const summary=useMemo(()=>summarizeAuditLogs(data),[data]);
  const kpis: Array<[typeof FileClock, string, string]> = [
    [FileClock,"Tổng bản ghi nhật ký",summary.total.toLocaleString('vi-VN')],
    [UsersRound,"Người thực hiện",summary.actors.toLocaleString('vi-VN')],
    [LockKeyhole,"Bản ghi cập nhật",summary.updates.toLocaleString('vi-VN')],
    [ShieldCheck,"Thay đổi trạng thái",summary.statusChanges.toLocaleString('vi-VN')],
  ];
  const percent=(count:number)=>summary.total ? count/summary.total*100 : 0;
  const formatPercent=(value:number)=>value.toLocaleString('vi-VN',{maximumFractionDigits:2})+'%';
  const actionCounts=summary.actionCounts;
  const entityCounts=summary.entityCounts;
  const entityPreview=entityCounts.length>4
    ? [...entityCounts.slice(0,3),{label:'Khác',count:entityCounts.slice(3).reduce((sum,item)=>sum+item.count,0)}]
    : entityCounts;
  const topUsers=summary.topActors.slice(0,3);
  const colors = distributionColors;
  return (
    <div className="staff-data-page customers-page-content flex flex-col gap-2.5 text-navy">
      <AuditHero />
      <section className="audit-kpis grid grid-cols-4 gap-3" aria-label="Thống kê nhật ký theo bộ lọc">
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
                    : "Theo bộ lọc hiện tại · Giờ Việt Nam"}
              </small>
            </div>
          </article>
        ))}
      </section>
      <section className="d4-page-toolbar card flex h-12 items-center justify-between gap-3 px-3">
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
        <button type="button" className="btn-secondary shrink-0" aria-label="Làm mới nhật ký"
          disabled={auditQuery.isFetching} onClick={()=>void auditQuery.refetch()}>
          <RefreshCw size={14} /> Làm mới
        </button>
      </section>
      {tab !== "Danh sách hoạt động" ? (
        <section className="grid min-h-0 flex-1 grid-cols-3 gap-3">
          <article className="card p-5 lg:col-span-2">
            <h2 className="text-lg font-black">{tab}</h2>
            <p className="mt-2 text-sm text-slate-500">
              Tổng hợp nhật ký theo bộ lọc hiện tại. Một thao tác có thể tạo nhiều bản ghi ở các đối tượng liên quan.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {["Tạo mới", "Cập nhật", "Xóa", "Đổi trạng thái"].map((x) => (
                <div className="rounded-xl bg-slate-50 p-4" key={x}>
                  <p className="text-xs text-slate-500">{x}</p>
                  <b className="mt-2 block text-2xl">
                    {auditQuery.data
                      ? data.filter((row) => row.type === x).length
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
            data-fixed-page-size={role === "admin" ? 11 : undefined}
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
                  placeholder="Tìm người thực hiện, hành động, đối tượng, mã hoặc IP…"
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
                      <td className="p-1.5" title={`${x.time} (giờ Việt Nam)`}>{x.time}</td>
                      <td className="p-1.5" title={x.user}>{x.user}</td>
                      <td className="p-1.5">{x.ip}</td>
                      <td className="p-1.5">
                        <span
                          className={`inline-block rounded px-1 text-center ${typeTone[x.type] ?? "bg-slate-100 text-slate-600"}`}
                        >
                          {x.type}
                        </span>
                      </td>
                      <td className="p-1.5" title={x.target}>{x.target}</td>
                      <td className="p-1.5">{x.entityId}</td>
                      <td className="p-1.5" title={x.changes}>{x.changes}</td>
                      <td className="p-1.5 text-center">
                        <RecordViewButton
                          record={{
                            "Mã nhật ký": x.id,
                            "Thời gian": x.time,
                            "Người thực hiện": x.user,
                            "Mã người dùng": x.actorKnown ? x.userKey : "Không được ghi nhận trong nhật ký",
                            "Mã nhân viên": x.actorCode,
                            "Nguồn thông tin người thực hiện": x.actorKnown
                              ? "Đối chiếu userid với hồ sơ nhân viên hiện tại; không thay đổi nhật ký gốc"
                              : "Nhật ký gốc không ghi nhận userid",
                            "Múi giờ": "Việt Nam (UTC+07:00)",
                            "Địa chỉ IP": x.ip,
                            "Hành động": x.type,
                            "Mã hành động": x.action,
                            "Đối tượng": x.target,
                            "Mã đối tượng": x.entityId,
                            "Trường thay đổi": x.changes,
                            "Mã trường thay đổi": x.changedFields.join(", ") || "—",
                          }}
                          title={`Chi tiết nhật ký #${x.id}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPagination {...pagination} noun="bản ghi" />
          </article>
          <aside className="staff-secondary-panels grid min-h-0 grid-rows-[1.15fr_1fr_1.1fr] gap-3">
            <article className="card p-3">
              <h2 className="text-sm font-black">Cơ cấu bản ghi theo hành động</h2>
              <DistributionChart
                items={actionCounts.map((item) => ({
                  label: item.label,
                  value: item.count,
                }))}
                label="bản ghi"
                ready={auditQuery.isSuccess}
                error={auditQuery.isError}
                centerValue={summary.total.toLocaleString("vi-VN")}
                formatPercentage={formatPercent}
              />
            </article>
            <article className="card p-3">
              <h2 className="text-sm font-black">Bản ghi theo đối tượng</h2>
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
                      {formatPercent(percent(item.count))} ({item.count.toLocaleString("vi-VN")})
                    </b>
                  </div>
                ))}
              </div>
            </article>
            <article className="card p-3">
              <div className="flex justify-between">
                <h2 className="text-sm font-black">
                  Bản ghi theo người thực hiện
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
                {summary.unattributed>0 && <p className="text-[10px] leading-4 text-slate-500">
                  {summary.unattributed.toLocaleString('vi-VN')} bản ghi chưa ghi nhận người thực hiện, không tính vào xếp hạng.
                </p>}
                {auditQuery.isSuccess && !topUsers.length && (
                  <p className="text-xs text-slate-500">Chưa có bản ghi xác định được người thực hiện.</p>
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
