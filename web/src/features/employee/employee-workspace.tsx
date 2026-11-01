"use client";
import { formatDateTime } from "@/lib/presentation";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  CheckCheck,
  Clock3,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ListPagination,
  useListPagination,
} from "@/components/list-pagination";
import { useSessionUser } from "@/components/session-context";
import { Modal } from "@/components/ui";
import { loadAllPages } from "@/lib/paged-data";
import {
  bankService,
  type EmployeeNotification,
} from "@/services/bank.service";
import { useNotificationRead } from "./use-notification-read";

const typeLabels: Record<string, string> = {
  fraud: "Fraud & Review",
  loan: "Khoản vay",
  work: "Công việc",
  system: "Hệ thống",
};
export function EmployeeWorkspace() {
  const user = useSessionUser();
  const { readIds, markRead } = useNotificationRead(user.role, user.id);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<EmployeeNotification | null>(null);
  const query = useQuery({
    queryKey: ["staff-notifications", user.role, user.id],
    queryFn: () =>
      loadAllPages(
        ({ page, pageSize }) =>
          bankService.employeeNotifications(page, pageSize),
        (row) => row.id,
      ),
    refetchInterval: 30_000,
  });
  const items = query.data ?? [];
  const unread = (item: EmployeeNotification) =>
    item.unread && !readIds.includes(item.id);
  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (!filter || (filter === "unread" ? unread(item) : !unread(item))) &&
          `${item.title} ${item.detail} ${typeLabels[item.type] ?? item.type}`
            .toLocaleLowerCase("vi")
            .includes(search.trim().toLocaleLowerCase("vi")),
      ),
    [items, filter, search, readIds],
  );
  const pagination = useListPagination(filtered, { fitViewportOnly: true });
  const unreadCount = items.filter(unread).length;
  const stats = [
    [Bell, "Tổng thông báo", items.length],
    [Clock3, "Chưa đọc", unreadCount],
    [CheckCheck, "Đã đọc", items.length - unreadCount],
    [
      ShieldAlert,
      "Mức độ cao",
      items.filter((item) =>
        ["HIGH", "CRITICAL", "Cao", "Rất cao"].includes(item.severity),
      ).length,
    ],
  ] as const;
  return (
    <div className="staff-data-page employees-page-content flex flex-col gap-2.5 text-navy">
      <section className="d4-banner relative overflow-hidden rounded-xl border border-red-100 p-3">
        <p className="text-xs font-bold text-coral">D4 BANK</p>
        <h1 className="text-2xl font-black">Thông báo</h1>
        <p className="mt-1 text-xs text-slate-500">
          Công việc và cảnh báo trong phạm vi được cấp quyền.
        </p>
      </section>
      <section className="grid grid-cols-4 gap-3">
        {stats.map(([Icon, label, value]) => (
          <article key={label} className="card flex items-center gap-3 p-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-red-50 text-coral">
              <Icon size={18} />
            </span>
            <div>
              <p className="text-xs">{label}</p>
              <b className="text-xl">{query.isSuccess ? value : "—"}</b>
            </div>
          </article>
        ))}
      </section>
      <section className="d4-page-toolbar card flex h-12 items-center justify-between px-3">
        <span className="text-xs font-semibold text-coral">
          Danh sách thông báo
        </span>
        <button
          className="btn-secondary"
          disabled={!items.some(unread)}
          onClick={() => markRead(items.filter(unread).map((item) => item.id))}
        >
          <CheckCheck size={15} />
          Đọc tất cả thông báo
        </button>
      </section>
      <section className="min-h-0 flex-1">
        <article
          ref={pagination.panelRef}
          className="card flex h-full min-h-0 flex-col p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3">
              <Search size={15} />
              <input
                type="search"
                aria-label="Tìm thông báo"
                className="h-9 min-w-0 flex-1 bg-transparent text-xs"
                placeholder="Tìm tiêu đề, nội dung…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  pagination.setPage(1);
                }}
              />
            </label>
            <select
              aria-label="Trạng thái thông báo"
              className="h-9 rounded-lg border px-2 text-xs"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                pagination.setPage(1);
              }}
            >
              <option value="">Tất cả thông báo</option>
              <option value="unread">Chưa đọc</option>
              <option value="read">Đã đọc</option>
            </select>
            <button
              aria-label="Tải lại thông báo"
              className="btn-secondary"
              onClick={() => void query.refetch()}
            >
              <RefreshCw size={15} />
            </button>
          </div>
          <div className="mt-3 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {[
                    "Thời gian",
                    "Thông báo",
                    "Phân hệ",
                    "Mức độ",
                    "Trạng thái",
                    "Thao tác",
                  ].map((label) => (
                    <th key={label} className="p-2">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.isPending && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center">
                      Đang tải thông báo…
                    </td>
                  </tr>
                )}
                {query.isError && (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-4 text-center text-red-600"
                      role="alert"
                    >
                      Không thể tải thông báo.{" "}
                      <button
                        className="underline"
                        onClick={() => void query.refetch()}
                      >
                        Thử lại
                      </button>
                    </td>
                  </tr>
                )}
                {query.isSuccess && !filtered.length && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-slate-500">
                      Không có thông báo phù hợp.
                    </td>
                  </tr>
                )}
                {query.isSuccess &&
                  pagination.visibleItems.map((item) => (
                    <tr
                      key={item.id}
                      className={
                        unread(item) ? "border-t bg-rose-50/40" : "border-t"
                      }
                    >
                      <td className="p-2">
                        {formatDateTime(item.createdat)}
                      </td>
                      <td className="p-2" title={item.detail}>
                        <b>{item.title}</b>
                      </td>
                      <td className="p-2">
                        {typeLabels[item.type] ?? item.type}
                      </td>
                      <td className="p-2">{item.severity}</td>
                      <td className="p-2">
                        {unread(item) ? "Chưa đọc" : "Đã đọc"}
                      </td>
                      <td className="p-2">
                        <button
                          className="d4-view-button"
                          aria-label={`Xem thông báo ${item.title}`}
                          onClick={() => {
                            markRead([item.id]);
                            setSelected(item);
                          }}
                        >
                          Xem
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <ListPagination {...pagination} noun="thông báo" />
        </article>
      </section>
      <Modal
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.title ?? "Thông báo"}
        description="Chi tiết thông báo dành cho tài khoản đang đăng nhập."
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <p>{selected.detail}</p>
            <p className="text-slate-500">
              {formatDateTime(selected.createdat)}
            </p>
            <Link
              className="btn-primary"
              href={
                selected.type === "fraud"
                  ? `/${user.role}/fraud`
                  : selected.type === "loan"
                    ? `/${user.role}/loans`
                    : `/${user.role}`
              }
            >
              Mở phân hệ liên quan
            </Link>
          </div>
        )}
      </Modal>
    </div>
  );
}
