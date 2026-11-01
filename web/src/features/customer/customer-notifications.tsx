"use client";
import { notificationText } from "@/lib/notification-data";
import { formatDateTime } from "@/lib/presentation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  ReceiptText,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNotificationRead } from "@/features/employee/use-notification-read";
import { Modal } from "@/components/ui";
import { useSessionUser } from "@/components/session-context";
import { useCustomerRecordCapacity } from "./customer-layout";
import {
  bankService,
  type CustomerNotification,
} from "@/services/bank.service";
import {
  CustomerEmpty,
  CustomerHero,
  CustomerLoading,
  CustomerPager,
  CustomerPanel,
} from "./customer-ui";

export function CustomerNotifications() {
  const user = useSessionUser();
  const { readIds: read, markRead } = useNotificationRead("customer", user.id);
  const [page, setPage] = useState(1);
  const { pageSize, bodyRef } = useCustomerRecordCapacity(
    ".customer-read-notice",
    10,
  );
  const [selected, setSelected] = useState<CustomerNotification | null>(null);
  const query = useQuery({
    queryKey: ["customer", user.id, "notifications", page, pageSize],
    queryFn: () => bankService.customerNotifications(page, pageSize),
    refetchInterval: 30_000,
  });
  useEffect(() => {
    setPage(1);
  }, [pageSize]);
  const items = query.data?.items ?? [];
  const view = (item: CustomerNotification) =>
    notificationText(item.notificationtype);
  return (
    <div className="customer-screen">
      <CustomerHero
        title="Thông báo"
        description="Cập nhật giao dịch và cảnh báo mới nhất dành cho bạn."
        icon={Bell}
      />
      <CustomerPanel
        className="customer-list-panel customer-notice-panel"
        title={`Thông báo của bạn${query.data ? ` (${query.data.total})` : ""}`}
        action={
          <button
            className="customer-text-button"
            disabled={!items.length}
            onClick={() =>
              markRead(items.map((item) => String(item.notificationoutboxid)))
            }
          >
            <CheckCheck size={16} />
            Đọc tất cả trên trang
          </button>
        }
      >
        <div className="customer-panel-body" ref={bodyRef}>
          {query.isLoading ? (
            <CustomerLoading />
          ) : query.isError ? (
            <CustomerEmpty error retry={() => void query.refetch()}>
              Không thể tải thông báo.
            </CustomerEmpty>
          ) : items.length ? (
            items.map((item) => {
              const Icon =
                item.notificationtype.includes("BLOCK") ||
                item.notificationtype.includes("REVIEW")
                  ? ShieldAlert
                  : item.notificationtype.includes("FAILED") ||
                      item.notificationtype.includes("REJECTED")
                    ? AlertTriangle
                    : ReceiptText;
              return (
                <button
                  className={`customer-read-notice ${read.includes(String(item.notificationoutboxid)) ? "" : "unread"}`}
                  key={item.notificationoutboxid}
                  onClick={() => {
                    markRead([String(item.notificationoutboxid)]);
                    setSelected(item);
                  }}
                >
                  <Icon size={24} />
                  <div>
                    <b>
                      {view(item)[0]}{" "}
                      {!read.includes(String(item.notificationoutboxid)) && (
                        <span className="ml-1 text-xs text-rose-600">Mới</span>
                      )}
                    </b>
                    <p>
                      {view(item)[1]}
                      {item.transactionid
                        ? ` Giao dịch #${item.transactionid}.`
                        : ""}
                    </p>
                  </div>
                  <time>{formatDateTime(item.createdat)}</time>
                </button>
              );
            })
          ) : (
            <CustomerEmpty>Bạn chưa có thông báo.</CustomerEmpty>
          )}
        </div>
        {!query.isError && (
          <CustomerPager
            page={page}
            pageSize={pageSize}
            total={query.data?.total ?? 0}
            onPage={setPage}
          />
        )}
      </CustomerPanel>
      <Modal
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected ? view(selected)[0] : "Thông báo"}
        description="Chi tiết thông báo dành cho tài khoản của bạn."
      >
        {selected && (
          <div className="space-y-4">
            <p>{view(selected)[1]}</p>
            {selected.transactionid && (
              <p className="text-sm">Mã giao dịch: #{selected.transactionid}</p>
            )}
            <time className="block text-sm text-slate-500">
              {formatDateTime(selected.createdat)}
            </time>
            <button
              className="customer-button"
              onClick={() => setSelected(null)}
            >
              Đóng
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
