"use client";

import { useSessionUser } from "@/components/session-context";
import { Modal } from "@/components/ui";
import { NotificationRow } from "@/components/notification-row";
import { useNotificationRead } from "@/features/employee/use-notification-read";
import { notificationText } from "@/lib/notification-data";
import { loadAllPages } from "@/lib/paged-data";
import { formatDateTime } from "@/lib/presentation";
import { bankService, type CustomerNotification } from "@/services/bank.service";
import { useQuery } from "@tanstack/react-query";
import { CheckCheck, ChevronRight, CreditCard, Megaphone, ReceiptText, Settings, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CustomerEmpty, CustomerLoading, CustomerPager } from "./customer-ui";
import { NotificationTransactionDetails } from './notification-transaction-details';
import "./customer-notifications.css";

const categories = [
  ["all", "Tất cả"],
  ["transaction", "Giao dịch"],
  ["promotion", "Khuyến mãi"],
  ["product", "Sản phẩm"],
  ["system", "Hệ thống"],
] as const;
type Category = (typeof categories)[number][0];

function categoryOf(item: CustomerNotification): Category {
  const type = item.notificationtype.toUpperCase();
  if (type.startsWith("TRANSACTION_")) return "transaction";
  if (/PROMOTION|OFFER|BIRTHDAY/.test(type)) return "promotion";
  if (/CARD|LOAN|SAVING|PRODUCT/.test(type)) return "product";
  return "system";
}

export function CustomerNotifications() {
  const user = useSessionUser();
  const { readIds, markRead } = useNotificationRead("customer", user.id);
  const [category, setCategory] = useState<Category>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CustomerNotification | null>(null);
  const query = useQuery({
    queryKey: ["customer", user.id, "notifications"],
    queryFn: () => loadAllPages(
      ({ page, pageSize }) => bankService.customerNotifications(page, pageSize),
      (item) => String(item.notificationoutboxid),
    ),
    refetchInterval: 30_000,
  });
  const items = query.data ?? [];
  const filtered = items.filter((item) => category === "all" || categoryOf(item) === category);
  const pageSize = 8;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const unread = (item: CustomerNotification) => !readIds.includes(String(item.notificationoutboxid));

  return (
    <div className="customer-notifications-screen">
      <header className="notice-hero">
        <nav aria-label="Đường dẫn">
          <Link href="/customer">Trang chủ</Link><ChevronRight size={15} /><span>Thông báo</span>
        </nav>
        <h1>Thông <span>báo</span></h1>
        <p>Cập nhật nhanh chóng các thông tin và hoạt động mới nhất từ D4 Bank.</p>
      </header>

      <div className="notice-controls">
        <div className="notice-categories" role="group" aria-label="Phân loại thông báo">
          {categories.map(([key, label]) => (
            <button key={key} aria-pressed={category === key} className={category === key ? "active" : ""}
              onClick={() => { setCategory(key); setPage(1); }}>
              {label} ({query.isSuccess ? (key === "all" ? items.length : items.filter((item) => categoryOf(item) === key).length) : "—"})
            </button>
          ))}
        </div>
        <button className="notice-mark-all" disabled={!items.some(unread)}
          onClick={() => markRead(items.filter(unread).map((item) => String(item.notificationoutboxid)))}>
          <CheckCheck size={16} />Đọc tất cả
        </button>
      </div>

      <section className="notice-list-area" aria-label="Danh sách thông báo">
        <div className="notice-list">
          {query.isPending && <CustomerLoading />}
          {query.isError && <CustomerEmpty error retry={() => void query.refetch()}>Không thể tải thông báo.</CustomerEmpty>}
          {query.isSuccess && !filtered.length && <CustomerEmpty>Chưa có thông báo trong mục này.</CustomerEmpty>}
          {query.isSuccess && filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((item) => {
            const [title, detail] = notificationText(item.notificationtype);
            const group = categoryOf(item);
            const warning = /BLOCK|REVIEW|FAILED|REJECTED/.test(item.notificationtype);
            const Icon = warning ? ShieldAlert : group === "transaction" ? ReceiptText : group === "promotion" ? Megaphone : group === "product" ? CreditCard : Settings;
            const isUnread = unread(item);
            return (
              <NotificationRow key={item.notificationoutboxid}
                title={title} detail={`${detail}${item.transactionid ? ` Giao dịch ${item.transactioncode ?? `#${item.transactionid}`}.` : ""}`}
                createdAt={item.createdat} unread={isUnread} icon={Icon} tone={warning ? "warning" : group}
                onClick={() => { markRead([String(item.notificationoutboxid)]); setSelected(item); }} />
            );
          })}
        </div>
        {query.isSuccess && filtered.length > pageSize && <CustomerPager page={currentPage} pageSize={pageSize} total={filtered.length} onPage={setPage} />}
      </section>

      <Modal open={!!selected} onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.transactionid ? "Chi tiết giao dịch" : selected ? notificationText(selected.notificationtype)[0] : "Thông báo"}
        description={selected?.transactionid ? "Thông tin và trạng thái hiện tại của giao dịch liên kết với thông báo." : "Chi tiết thông báo dành cho tài khoản của bạn."}
        className={selected?.transactionid ? "notice-transaction-dialog" : ""}>
        {selected?.transactionid ? <div className="notice-transaction-body"><NotificationTransactionDetails key={selected.transactionid} id={selected.transactionid}/></div> : selected && <div className="space-y-4 text-sm">
          <p>{notificationText(selected.notificationtype)[1]}</p>
          <p className="text-slate-500">{formatDateTime(selected.createdat)}</p>
        </div>}
      </Modal>
    </div>
  );
}
