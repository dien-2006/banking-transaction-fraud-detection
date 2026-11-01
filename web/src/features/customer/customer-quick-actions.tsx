"use client";

import {
  ArrowUpRight,
  CreditCard,
  FileText,
  HandCoins,
  MoreHorizontal,
  PiggyBank,
  Plus,
  Settings,
  ShoppingCart,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/components/ui";
import { CustomerPanel } from "./customer-ui";

const shortcuts: {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  description?: string;
}[] = [
  {
    id: "transfer",
    label: "Chuyển tiền",
    icon: ArrowUpRight,
    href: "/customer/transfer",
  },
  {
    id: "deposit",
    label: "Nạp tiền",
    icon: Smartphone,
    description:
      "Để nạp tiền vào tài khoản, bạn có thể chuyển tiền đến số tài khoản D4 Bank của mình hoặc liên hệ chi nhánh quản lý.",
  },
  {
    id: "bills",
    label: "Thanh toán hóa đơn",
    icon: FileText,
    description:
      "Thanh toán hóa đơn trực tiếp chưa được hỗ trợ. Bạn có thể chuyển khoản theo thông tin do đơn vị cung cấp dịch vụ xác nhận.",
  },
  {
    id: "shopping",
    label: "Mua sắm trực tuyến",
    icon: ShoppingCart,
    description:
      "Kiểm tra thẻ và hạn mức trước khi thanh toán trên website của đơn vị bán hàng. Chỉ nhập thông tin thẻ trên trang thanh toán đáng tin cậy.",
  },
  {
    id: "savings",
    label: "Tiết kiệm",
    icon: PiggyBank,
    href: "/customer/accounts",
  },
  { id: "loans", label: "Vay vốn", icon: HandCoins, href: "/customer/loans" },
  {
    id: "cards",
    label: "Mở thẻ",
    icon: CreditCard,
    description:
      "Bạn có thể xem thẻ và quản lý PIN trực tuyến. Để đăng ký mở thẻ mới, hãy liên hệ chi nhánh quản lý tài khoản.",
  },
  { id: "more", label: "Xem thêm", icon: MoreHorizontal },
];

export function CustomerQuickActions() {
  const [dialog, setDialog] = useState<string | null>(null);
  const [visible, setVisible] = useState(shortcuts.map((item) => item.id));
  const [draft, setDraft] = useState(visible);
  const service = shortcuts.find((item) => item.id === dialog);
  return (
    <>
      <CustomerPanel
        title="Giao dịch nhanh"
        className="customer-quick-panel"
        action={
          <button
            className="customer-quick-customize"
            onClick={() => {
              setDraft(visible);
              setDialog("customize");
            }}
          >
            Tùy chỉnh <Settings size={13} />
          </button>
        }
      >
        <div className="customer-home-shortcuts">
          {shortcuts
            .filter((item) => visible.includes(item.id))
            .map(({ id, label, icon: Icon, href }) => {
              const content = (
                <>
                  <i>
                    <Icon size={26} aria-hidden="true" />
                    {id === "cards" && (
                      <Plus
                        className="customer-quick-plus"
                        size={10}
                        aria-hidden="true"
                      />
                    )}
                  </i>
                  <span>{label}</span>
                </>
              );
              return href ? (
                <Link key={id} href={href}>
                  {content}
                </Link>
              ) : (
                <button key={id} onClick={() => setDialog(id)}>
                  {content}
                </button>
              );
            })}
        </div>
      </CustomerPanel>
      <Modal
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        title={
          dialog === "customize"
            ? "Tùy chỉnh giao dịch nhanh"
            : (service?.label ?? "Dịch vụ D4 Bank")
        }
        description={
          dialog === "customize"
            ? "Chọn các lối tắt muốn hiển thị trên trang chủ."
            : "Thông tin dịch vụ dành cho khách hàng D4 Bank."
        }
      >
        {dialog === "customize" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              {shortcuts.map(({ id, label, icon: Icon }) => (
                <label
                  key={id}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={draft.includes(id)}
                    onChange={(event) =>
                      setDraft(
                        event.target.checked
                          ? [...draft, id]
                          : draft.filter((value) => value !== id),
                      )
                    }
                  />
                  <Icon size={18} />
                  {label}
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                className="customer-button secondary"
                onClick={() => setDialog(null)}
              >
                Hủy
              </button>
              <button
                className="customer-button"
                disabled={!draft.length}
                onClick={() => {
                  setVisible(draft);
                  setDialog(null);
                }}
              >
                Lưu tùy chỉnh
              </button>
            </div>
          </>
        ) : dialog === "more" ? (
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Tài khoản", "/customer/accounts"],
              ["Thẻ của tôi", "/customer/cards"],
              ["Thông báo", "/customer/notifications"],
              ["Hồ sơ và bảo mật", "/customer/profile"],
            ].map(([label, href]) => (
              <Link
                key={href}
                className="customer-button secondary"
                href={href}
              >
                {label}
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-sm leading-6 text-slate-600">
              {service?.description}
            </p>
            <Link
              className="customer-button secondary"
              href={
                dialog === "shopping" || dialog === "cards"
                  ? "/customer/cards"
                  : "/customer/accounts"
              }
            >
              {dialog === "shopping" || dialog === "cards"
                ? "Xem thẻ của tôi"
                : "Xem tài khoản của tôi"}
            </Link>
          </div>
        )}
      </Modal>
    </>
  );
}
