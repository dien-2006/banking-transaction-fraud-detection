"use client";
import { formatDateTime } from "@/lib/presentation";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  ChevronRight,
  BriefcaseBusiness,
  Landmark,
  Settings,
  CheckCheck,
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
import { NotificationRow } from "@/components/notification-row";
import { loadAllPages } from "@/lib/paged-data";
import {
  bankService,
  type EmployeeNotification,
} from "@/services/bank.service";
import { useNotificationRead } from "./use-notification-read";

const typeLabels: Record<string, string> = {
  fraud: "Rủi ro & Thẩm định",
  loan: "Khoản vay",
  work: "Công việc",
  system: "Hệ thống",
};
export function EmployeeWorkspace() {
  const user = useSessionUser();
  const { readIds, markRead } = useNotificationRead(user.role, user.id);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState("");
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
          (!category || item.type === category) &&
          (!filter || (filter === "unread" ? unread(item) : !unread(item))) &&
          `${item.title} ${item.detail} ${typeLabels[item.type] ?? item.type}`
            .toLocaleLowerCase("vi")
            .includes(search.trim().toLocaleLowerCase("vi")),
      ),
    [items, category, filter, search, readIds],
  );
  const pagination = useListPagination(filtered, { fitViewportOnly: true });
  const icons = { fraud: ShieldAlert, loan: Landmark, work: BriefcaseBusiness, system: Settings };
  return (
    <div className="notification-screen staff-notifications-screen">
      <header className="notice-hero">
        <nav aria-label="Đường dẫn">
          <Link href={`/${user.role}`}>Trang chủ</Link><ChevronRight size={15} /><span>Thông báo</span>
        </nav>
        <h1>Thông <span>báo</span></h1>
        <p>Cập nhật công việc và cảnh báo mới nhất trong phạm vi được cấp quyền.</p>
      </header>
      <div className="notice-controls">
        <div className="notice-categories" role="group" aria-label="Phân loại thông báo">
          {[["", "Tất cả"], ...Object.entries(typeLabels)].map(([key, label]) => (
            <button type="button" key={key} aria-pressed={category === key}
              className={category === key ? "active" : ""}
              onClick={() => { setCategory(key); pagination.setPage(1); }}>
              {label} ({query.isSuccess ? items.filter((item) => !key || item.type === key).length : "—"})
            </button>
          ))}
        </div>
        <button type="button" className="notice-mark-all" disabled={!items.some(unread)}
          onClick={() => markRead(items.filter(unread).map((item) => item.id))}>
          <CheckCheck size={16} />Đọc tất cả thông báo
        </button>
      </div>
      <div className="notice-search-controls">
        <label>
          <Search size={16} />
          <input type="search" aria-label="Tìm thông báo" placeholder="Tìm tiêu đề, nội dung…" value={search}
            onChange={(event) => { setSearch(event.target.value); pagination.setPage(1); }} />
        </label>
        <select aria-label="Trạng thái thông báo" value={filter}
          onChange={(event) => { setFilter(event.target.value); pagination.setPage(1); }}>
          <option value="">Tất cả thông báo</option>
          <option value="unread">Chưa đọc</option>
          <option value="read">Đã đọc</option>
        </select>
        <button type="button" aria-label="Tải lại thông báo" onClick={() => void query.refetch()}><RefreshCw size={17} /></button>
      </div>
      <section className="notice-list-area" aria-label="Danh sách thông báo">
        <div className="notice-list">
          {query.isPending && <p className="notice-empty" role="status">Đang tải thông báo…</p>}
          {query.isError && <p className="notice-empty" role="alert">Không thể tải thông báo. <button onClick={() => void query.refetch()}>Thử lại</button></p>}
          {query.isSuccess && !filtered.length && <p className="notice-empty">Không có thông báo phù hợp.</p>}
          {query.isSuccess && pagination.visibleItems.map((item) => (
            <NotificationRow key={item.id} title={item.title} detail={item.detail} createdAt={item.createdat}
              unread={unread(item)} icon={icons[item.type] ?? Bell}
              tone={item.type === "fraud" ? "warning" : item.type === "loan" ? "product" : "system"}
              onClick={() => { markRead([item.id]); setSelected(item); }} />
          ))}
        </div>
        {query.isSuccess && <ListPagination {...pagination} noun="thông báo" />}
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
            <p>{typeLabels[selected.type]} · Mức độ: {selected.severity}</p>
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
