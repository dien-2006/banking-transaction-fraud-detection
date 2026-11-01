"use client";
import {
  ArrowRight,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  Database,
  Headphones,
  MessageCircle,
  Phone,
  PiggyBank,
} from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSessionUser } from "@/components/session-context";
import { useListPagination } from "@/components/list-pagination";
import { Modal } from "@/components/ui";
import { bankService } from "@/services/bank.service";
import { accountKind, formatVnd } from "@/lib/customer-data";
import { ReferenceArtwork } from "./reference-artwork";
import { CustomerQuickActions } from "./customer-quick-actions";
import {
  useCustomerAccounts,
  useCustomerTransactions,
} from "./customer-queries";
import {
  CustomerEmpty,
  CustomerLoading,
  CustomerMetric,
  CustomerPager,
  CustomerPanel,
  CustomerTransactionTable,
} from "./customer-ui";

export function CustomerHome() {
  const user = useSessionUser();
  const accounts = useCustomerAccounts();
  const transactions = useCustomerTransactions();
  const cards = useQuery({
    queryKey: ["customer", user.id, "cards"],
    queryFn: bankService.customerCards,
  });
  const [hidden, setHidden] = useState(false);
  const [support, setSupport] = useState<string | null>(null);
  const list = useListPagination(transactions.data ?? [], {
    fitViewportOnly: true,
  });
  const active = (accounts.data ?? []).filter(
    (account) => account.status === "Active" && account.currency === "VND",
  );
  const total = active.reduce(
    (sum, account) => sum + Number(account.balance),
    0,
  );
  const payment = active.filter(
    (account) => accountKind(account) === "Thanh toán",
  );
  const savings = active.filter(
    (account) => accountKind(account) === "Tiết kiệm",
  );
  const sum = (items: typeof active) =>
    items.reduce((value, item) => value + Number(item.balance), 0);
  const amount = (value: number | string) =>
    hidden ? "••••••" : formatVnd(value);
  return (
    <div className="customer-screen customer-overview">
      <section className="customer-welcome" aria-labelledby="customer-greeting">
        <ReferenceArtwork region="hero" className="customer-welcome-art" />
        <div className="customer-welcome-copy">
          <p>Xin chào,</p>
          <h1 id="customer-greeting">{user.name}!</h1>
          <span>Cùng D4 Bank quản lý tài chính mỗi ngày.</span>
        </div>
      </section>
      {accounts.isLoading ? (
        <CustomerLoading />
      ) : accounts.isError ? (
        <CustomerEmpty error retry={() => void accounts.refetch()}>
          Không thể tải thông tin tài khoản.
        </CustomerEmpty>
      ) : (
        <div className="customer-metrics">
          <CustomerMetric
            label="Tổng số dư đang hoạt động"
            value={
              <>
                {amount(total)}{" "}
                <button
                  className="ml-1 inline-flex align-middle"
                  aria-label={hidden ? "Hiện số dư" : "Ẩn số dư"}
                  onClick={() => setHidden(!hidden)}
                >
                  {hidden ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
              </>
            }
            caption={`${active.length} tài khoản đang hoạt động`}
          />
          <CustomerMetric
            label="Tài khoản thanh toán"
            value={amount(sum(payment))}
            caption={`${payment.length} tài khoản`}
          />
          <CustomerMetric
            label="Tiết kiệm"
            value={amount(sum(savings))}
            caption={`${savings.length} tài khoản`}
          />
          <CustomerMetric
            label="Thẻ đang hoạt động"
            value={
              cards.isPending || cards.isError
                ? "—"
                : cards.data.filter((card) => card.status === "Active").length
            }
            icon={CreditCard}
            caption={
              cards.isError
                ? "Không thể tải dữ liệu thẻ"
                : "Thẻ liên kết với tài khoản của bạn"
            }
          />
        </div>
      )}
      <div className="customer-two-column customer-home-workspace">
        <div className="customer-home-main">
          <CustomerQuickActions />
          <CustomerPanel
            className="customer-list-panel"
            panelRef={list.panelRef}
            title="Giao dịch gần đây"
            action={
              <Link
                className="customer-text-button"
                href="/customer/transactions"
              >
                Xem tất cả <ArrowRight size={16} />
              </Link>
            }
          >
            {transactions.isLoading || accounts.isLoading ? (
              <CustomerLoading />
            ) : transactions.isError || accounts.isError ? (
              <CustomerEmpty
                error
                retry={() => {
                  void transactions.refetch();
                  void accounts.refetch();
                }}
              >
                Không thể tải giao dịch của bạn.
              </CustomerEmpty>
            ) : (
              <CustomerTransactionTable
                accounts={accounts.data ?? []}
                transactions={list.visibleItems}
                hidden={hidden}
                compact
              />
            )}
            <CustomerPager
              page={list.page}
              pageSize={list.pageSize}
              total={list.total}
              onPage={list.setPage}
            />
          </CustomerPanel>
        </div>
        <aside className="customer-stack">
          <CustomerPanel
            title="Tài khoản của tôi"
            action={
              <Link className="customer-text-button" href="/customer/accounts">
                Xem tất cả →
              </Link>
            }
          >
            {accounts.isLoading ? (
              <CustomerLoading />
            ) : accounts.isError ? (
              <CustomerEmpty error>Không thể tải tài khoản.</CustomerEmpty>
            ) : active.length ? (
              <div className="customer-home-account-list">
                {active.slice(0, 2).map((account) => (
                  <Link key={account.accountid} href="/customer/accounts">
                    <i>
                      {accountKind(account) === "Tiết kiệm" ? (
                        <PiggyBank size={19} />
                      ) : (
                        <Database size={19} />
                      )}
                    </i>
                    <span>
                      {account.accounttypename}
                      <b>{amount(account.balance)}</b>
                      <small>{hidden ? "••••••" : account.accountnumber}</small>
                    </span>
                    <ChevronRight size={16} />
                  </Link>
                ))}
              </div>
            ) : (
              <CustomerEmpty>
                Bạn chưa có tài khoản đang hoạt động.
              </CustomerEmpty>
            )}
          </CustomerPanel>
          <CustomerPanel
            title="Ưu đãi dành cho bạn"
            action={
              <Link className="customer-text-button" href="/customer/news">
                Xem tất cả →
              </Link>
            }
          >
            <Link className="customer-home-offer" href="/customer/news">
              <ReferenceArtwork region="gift" />
              <span>
                <strong>Khám phá ưu đãi D4 Bank</strong>
                <small>Tin tức và chương trình dành cho khách hàng</small>
              </span>
              <ArrowRight size={17} />
            </Link>
          </CustomerPanel>
          <CustomerPanel
            title="Hỗ trợ khách hàng"
            className="customer-home-support"
          >
            <button onClick={() => setSupport("Trung tâm hỗ trợ")}>
              <i>
                <Headphones size={19} />
              </i>
              <span>
                Trung tâm hỗ trợ<small>Hướng dẫn sử dụng dịch vụ</small>
              </span>
              <ChevronRight size={16} />
            </button>
            <button onClick={() => setSupport("Chat trực tuyến")}>
              <i>
                <MessageCircle size={19} />
              </i>
              <span>
                Chat trực tuyến<small>Thông tin kênh hỗ trợ</small>
              </span>
              <ChevronRight size={16} />
            </button>
            <Link href="/customer/about">
              <i>
                <Phone size={19} />
              </i>
              <span>
                Liên hệ chi nhánh<small>Tìm hiểu các kênh liên hệ</small>
              </span>
              <ChevronRight size={16} />
            </Link>
          </CustomerPanel>
        </aside>
      </div>
      <Modal
        open={support !== null}
        onOpenChange={(open) => !open && setSupport(null)}
        title={support ?? "Hỗ trợ khách hàng"}
        description="Hướng dẫn sử dụng D4 Bank."
      >
        {support === "Chat trực tuyến" ? (
          <p className="text-sm leading-6 text-slate-600">
            Kênh chat trực tuyến chưa được hỗ trợ. Vui lòng liên hệ chi nhánh
            quản lý tài khoản để được trợ giúp.
          </p>
        ) : (
          <div className="space-y-3 text-sm">
            <details className="rounded-xl border p-4">
              <summary className="cursor-pointer font-semibold">
                Ẩn hoặc hiện số dư
              </summary>
              <p className="mt-2 text-slate-600">
                Nhấn biểu tượng con mắt bên cạnh tổng số dư trên trang chủ.
              </p>
            </details>
            <details className="rounded-xl border p-4">
              <summary className="cursor-pointer font-semibold">
                Xem chi tiết giao dịch
              </summary>
              <p className="mt-2 text-slate-600">
                Nhấn dấu ba chấm ở cuối dòng giao dịch để xem thông tin và trạng
                thái thực tế.
              </p>
            </details>
            <Link
              className="customer-button secondary"
              href="/customer/profile"
            >
              Hồ sơ và bảo mật
            </Link>
          </div>
        )}
      </Modal>
    </div>
  );
}
