"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";
import { formatDateTime } from "@/lib/presentation";
import "@/features/customer/customer-notifications.css";

export function NotificationRow({ title, detail, createdAt, unread, icon: Icon, tone, onClick }: {
  title: string;
  detail: string;
  createdAt: string;
  unread: boolean;
  icon: LucideIcon;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`notice-row ${unread ? "unread" : ""}`}
      aria-label={`Xem thông báo ${title}${unread ? ", chưa đọc" : ""}`} onClick={onClick}>
      <span className={`notice-icon ${tone}`} aria-hidden="true"><Icon size={27} /></span>
      <span className="notice-copy"><strong>{title}</strong><span>{detail}</span></span>
      <span className={`notice-dot ${unread ? "unread" : ""}`} role="img" aria-label={unread ? "Chưa đọc" : "Đã đọc"} />
      <time dateTime={createdAt}>{formatDateTime(createdAt)}</time>
      <ChevronRight className="notice-arrow" size={21} aria-hidden="true" />
    </button>
  );
}
