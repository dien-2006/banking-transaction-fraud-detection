"use client";
import { AccountDetails } from "@/components/account-details";
import { DistributionChart } from "@/components/distribution-chart";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  PiggyBank,
  Plus,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Modal } from "@/components/ui";
import { useSessionUser } from "@/components/session-context";
import { useListPagination } from "@/components/list-pagination";
import {
  accountBalanceSummary,
  accountActivity,
} from "@/lib/account-analytics";
import { accountKind, formatVnd } from "@/lib/customer-data";
import type { ApiAccount } from "@/services/bank.service";
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
  CustomerStatus,
  CustomerTransactionTable,
} from "./customer-ui";
import { ReferenceArtwork } from "./reference-artwork";
import "./customer-accounts.css";

const tabs = [
  "Danh sách tài khoản",
  "Biến động số dư",
  "Biểu đồ phân tích",
] as const;
const services = {
  open: {
    title: "Mở tài khoản mới",
    description:
      "Để mở thêm tài khoản, vui lòng liên hệ chi nhánh D4 Bank quản lý tài khoản của bạn. Nhân viên sẽ hỗ trợ lựa chọn sản phẩm và hoàn tất đăng ký.",
  },
  deposit: {
    title: "Nạp tiền",
    description:
      "Bạn có thể chuyển tiền đến số tài khoản D4 Bank của mình hoặc nạp tiền tại chi nhánh. Kiểm tra tên người nhận và số tài khoản trước khi xác nhận.",
  },
  bills: {
    title: "Thanh toán hóa đơn",
    description:
      "Dịch vụ thanh toán hóa đơn trực tiếp chưa được hỗ trợ trên web. Bạn có thể chuyển khoản theo thông tin thanh toán được đơn vị cung cấp dịch vụ xác nhận.",
  },
  savings: {
    title: "Mở tài khoản tiết kiệm",
    description:
      "Liên hệ chi nhánh D4 Bank để được tư vấn kỳ hạn, lãi suất và đăng ký tài khoản tiết kiệm phù hợp.",
  },
} as const;
type Service = keyof typeof services;
const iconFor = (kind: string) =>
  kind === "Tiết kiệm" ? PiggyBank : kind === "Thẻ" ? CreditCard : Wallet;
const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

export function CustomerAccounts() {
  const user = useSessionUser();
  const query = useCustomerAccounts(),
    transactions = useCustomerTransactions();
  const [hidden, setHidden] = useState(false);
  const [selected, setSelected] = useState<ApiAccount | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]>(tabs[0]);
  const accounts = query.data ?? [];
  const list = useListPagination(accounts, { fitViewportOnly: true });
  const recent = useListPagination(transactions.data ?? [], {
    fitViewportOnly: true,
  });
  const summary = useMemo(() => accountBalanceSummary(accounts), [accounts]);
  const activity = useMemo(
    () => accountActivity(transactions.data ?? [], accounts),
    [transactions.data, accounts],
  );
  const amount = (value: number | string, currency = "VND") =>
    hidden
      ? "••••••"
      : currency === "VND"
        ? formatVnd(value)
        : new Intl.NumberFormat("vi-VN", {
            style: "currency",
            currency,
          }).format(Number(value));
  const metricAmount = (value: number) => (
    <span className="customer-account-metric-amount">
      {hidden ? "••••••" : number.format(value)} <em>VND</em>
    </span>
  );
  const distribution = (
    <DistributionChart
      items={summary.groups.map((group) => ({
        label: group.type,
        value: group.balance,
      }))}
      label="số dư VND"
      hidden={hidden}
      ready={query.isSuccess}
      error={query.isError}
      centerValue={new Intl.NumberFormat("vi-VN", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(summary.total)}
      formatValue={(value) => formatVnd(value)}
      emptyText="Chưa có số dư tài khoản VND đang hoạt động."
    />
  );
  return (
    <div className="customer-screen customer-accounts-screen">
      <header className="customer-page-hero customer-accounts-hero">
        <ReferenceArtwork
          region="accountsHero"
          className="customer-accounts-hero-art"
        />
        <div className="customer-accounts-hero-copy">
          <nav aria-label="Đường dẫn">
            <Link href="/customer">Trang chủ</Link>
            <ChevronRight size={13} />
            <span>Tài khoản của tôi</span>
          </nav>
          <h1>
            Tài khoản <span>của tôi</span>
          </h1>
          <p>
            Quản lý tất cả tài khoản của bạn tại D4 Bank một cách dễ dàng, an
            toàn và tiện lợi.
          </p>
        </div>
      </header>
      {query.isLoading ? (
        <CustomerLoading />
      ) : query.isError ? (
        <CustomerEmpty error retry={() => void query.refetch()}>
          Không thể tải tài khoản của bạn.
        </CustomerEmpty>
      ) : (
        <>
          <div className="customer-metrics">
            <CustomerMetric
              label="Tổng số dư"
              value={
                <>
                  {metricAmount(summary.total)}{" "}
                  <button
                    className="customer-accounts-visibility"
                    aria-label={hidden ? "Hiện số dư" : "Ẩn số dư"}
                    onClick={() => setHidden(!hidden)}
                  >
                    {hidden ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                </>
              }
              caption={`${summary.count} tài khoản VND đang hoạt động`}
            />
            {summary.groups.map((group) => (
              <CustomerMetric
                key={group.type}
                label={`Tài khoản ${group.type.toLocaleLowerCase("vi")}`}
                icon={iconFor(group.type)}
                value={metricAmount(group.balance)}
                caption={`${group.count} tài khoản đang hoạt động`}
              />
            ))}
          </div>
          <div className="customer-accounts-workspace">
            <div className="customer-accounts-main">
              <nav
                className="customer-tabs customer-accounts-tabs"
                aria-label="Nội dung tài khoản"
              >
                {tabs.map((label) => (
                  <button
                    key={label}
                    aria-pressed={tab === label}
                    onClick={() => setTab(label)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              {tab === tabs[0] ? (
                <CustomerPanel
                  className="customer-list-panel customer-accounts-list"
                  panelRef={list.panelRef}
                  title="Danh sách tài khoản"
                  action={
                    <button
                      className="customer-button customer-accounts-open"
                      onClick={() => setService("open")}
                    >
                      <Plus size={16} />
                      Mở tài khoản mới
                    </button>
                  }
                >
                  {accounts.length ? (
                    <div
                      className="customer-data-scroll"
                      tabIndex={0}
                      role="region"
                      aria-label="Danh sách tài khoản"
                    >
                      <table className="customer-data-table customer-accounts-table">
                        <colgroup>
                          <col />
                          <col />
                          <col />
                          <col />
                          <col />
                          <col />
                        </colgroup>
                        <thead>
                          <tr>
                            {[
                              "Số tài khoản",
                              "Tên tài khoản",
                              "Loại tài khoản",
                              "Số dư",
                              "Trạng thái",
                              "Thao tác",
                            ].map((label) => (
                              <th key={label}>{label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {list.visibleItems.map((item) => {
                            const kind = accountKind(item),
                              Icon = iconFor(kind);
                            return (
                              <tr key={item.accountid}>
                                <td>
                                  <span className="customer-account-number">
                                    <Icon size={21} />
                                    <span>
                                      {hidden ? "••••••" : item.accountnumber}
                                    </span>
                                  </span>
                                </td>
                                <td>
                                  <b
                                    className="customer-account-product"
                                    title={item.accounttypename}
                                  >
                                    {item.accounttypename}
                                  </b>
                                  <small>{user.name}</small>
                                </td>
                                <td>
                                  <span
                                    className={`customer-account-kind ${kind === "Tiết kiệm" ? "saving" : kind === "Thẻ" ? "card" : "payment"}`}
                                  >
                                    {kind}
                                  </span>
                                </td>
                                <td className="customer-amount">
                                  {amount(item.balance, item.currency)}
                                </td>
                                <td>
                                  <CustomerStatus status={item.status} />
                                </td>
                                <td>
                                  <button
                                    className="customer-account-view"
                                    onClick={() => setSelected(item)}
                                    aria-label={
                                      hidden
                                        ? "Chi tiết tài khoản"
                                        : `Chi tiết tài khoản ${item.accountnumber}`
                                    }
                                  >
                                    <span className="customer-account-view-full">
                                      Xem chi tiết
                                    </span>
                                    <span className="customer-account-view-short">
                                      Xem
                                    </span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <CustomerEmpty>
                      Bạn chưa có tài khoản tại D4 Bank.
                    </CustomerEmpty>
                  )}
                  <CustomerPager
                    page={list.page}
                    pageSize={list.pageSize}
                    total={accounts.length}
                    onPage={list.setPage}
                  />
                </CustomerPanel>
              ) : (
                <CustomerPanel
                  className="customer-accounts-analysis"
                  title={tab}
                >
                  {tab === tabs[1] ? (
                    transactions.isLoading ? (
                      <CustomerLoading />
                    ) : transactions.isError ? (
                      <CustomerEmpty
                        error
                        retry={() => void transactions.refetch()}
                      >
                        Không thể tải biến động giao dịch.
                      </CustomerEmpty>
                    ) : (
                      <div className="customer-account-activity">
                        <p>Phát sinh tiền vào / tiền ra theo ngày</p>
                        {hidden ? (
                          <p className="customer-note">
                            Đã ẩn giá trị giao dịch.
                          </p>
                        ) : activity.length ? (
                          <div className="customer-account-activity-bars">
                            {activity.map((row) => {
                              const max = Math.max(
                                1,
                                ...activity.flatMap((item) => [
                                  item.incoming,
                                  item.outgoing,
                                ]),
                              );
                              return (
                                <div key={row.day}>
                                  <span>
                                    {row.day
                                      .slice(5)
                                      .split("-")
                                      .reverse()
                                      .join("/")}
                                  </span>
                                  <i
                                    style={{
                                      width: `${(row.incoming / max) * 100}%`,
                                    }}
                                    title={
                                      hidden
                                        ? "Đã ẩn tiền vào"
                                        : `Tiền vào: ${amount(row.incoming)}`
                                    }
                                  />
                                  <i
                                    style={{
                                      width: `${(row.outgoing / max) * 100}%`,
                                    }}
                                    title={
                                      hidden
                                        ? "Đã ẩn tiền ra"
                                        : `Tiền ra: ${amount(row.outgoing)}`
                                    }
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="customer-note">
                            Chưa có giao dịch tiền vào hoặc tiền ra thành công.
                          </p>
                        )}
                        <small>
                          Tiền vào (xanh), tiền ra (đỏ). Chỉ tính giao dịch VND
                          thành công; đây là phát sinh theo ngày, không phải số
                          dư cuối ngày.
                        </small>
                      </div>
                    )
                  ) : (
                    <>
                      {distribution}
                      <p className="customer-note customer-accounts-analysis-note">
                        Cơ cấu số dư VND của các tài khoản đang hoạt động.
                      </p>
                    </>
                  )}
                </CustomerPanel>
              )}
              <CustomerPanel
                className="customer-list-panel customer-accounts-recent"
                panelRef={recent.panelRef}
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
                {transactions.isLoading ? (
                  <CustomerLoading />
                ) : transactions.isError ? (
                  <CustomerEmpty
                    error
                    retry={() => void transactions.refetch()}
                  >
                    Không thể tải giao dịch.
                  </CustomerEmpty>
                ) : (
                  <CustomerTransactionTable
                    transactions={recent.visibleItems}
                    accounts={accounts}
                    hidden={hidden}
                    accountOverview
                  />
                )}
                <CustomerPager
                  page={recent.page}
                  pageSize={recent.pageSize}
                  total={transactions.data?.length ?? 0}
                  onPage={recent.setPage}
                />
              </CustomerPanel>
            </div>
            <aside className="customer-accounts-aside">
              <CustomerPanel
                title="Thao tác nhanh"
                className="customer-accounts-actions"
              >
                <div>
                  <Link href="/customer/transfer">
                    <i>
                      <ArrowUpRight />
                    </i>
                    <span>Chuyển tiền</span>
                    <ChevronRight size={17} />
                  </Link>
                  {(
                    [
                      { key: "deposit", label: "Nạp tiền", Icon: Smartphone },
                      {
                        key: "bills",
                        label: "Thanh toán hóa đơn",
                        Icon: FileText,
                      },
                      {
                        key: "savings",
                        label: "Mở tài khoản tiết kiệm",
                        Icon: PiggyBank,
                      },
                    ] as const
                  ).map(({ key, label, Icon }) => (
                    <button key={key} onClick={() => setService(key)}>
                      <i>
                        <Icon />
                      </i>
                      <span>{label}</span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
              </CustomerPanel>
              <CustomerPanel
                title="Cơ cấu số dư tài khoản"
                className="customer-accounts-composition"
              >
                {distribution}
                {!summary.total && (
                  <p className="customer-note">
                    Chưa có số dư VND đang hoạt động.
                  </p>
                )}
              </CustomerPanel>
              <section className="customer-box customer-accounts-security">
                <ReferenceArtwork
                  region="accountsSecurity"
                  className="customer-accounts-security-art"
                />
                <h2>
                  <ShieldCheck />
                  <span>
                    Tài khoản an toàn
                    <br />
                    Giao dịch an tâm
                  </span>
                </h2>
                <ul>
                  {[
                    "Bảo vệ mật khẩu và mã OTP",
                    "Kiểm tra thông báo giao dịch",
                    "Báo ngay giao dịch bất thường",
                  ].map((label) => (
                    <li key={label}>
                      <Check size={12} />
                      {label}
                    </li>
                  ))}
                </ul>
                <Link href="/customer/profile">
                  Hồ sơ và bảo mật <ArrowRight size={13} />
                </Link>
              </section>
            </aside>
          </div>
        </>
      )}
      <Modal
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        title="Chi tiết tài khoản"
        description="Thông tin tài khoản của bạn tại D4 Bank."
      >
        {selected && <AccountDetails account={selected} hidden={hidden} />}
      </Modal>
      <Modal
        open={!!service}
        onOpenChange={(open) => !open && setService(null)}
        title={service ? services[service].title : "Dịch vụ tài khoản"}
        description="Hỗ trợ dịch vụ tài khoản D4 Bank."
      >
        {service && (
          <div className="space-y-4 text-sm">
            <p>{services[service].description}</p>
            <Link
              className="customer-button secondary"
              href="/customer/profile"
            >
              Hồ sơ và thông tin liên hệ <ArrowRight size={15} />
            </Link>
          </div>
        )}
      </Modal>
    </div>
  );
}
