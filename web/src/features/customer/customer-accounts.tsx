"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, ChevronRight, CreditCard,
  Eye, EyeOff, FileText, PiggyBank, Plus, ShieldCheck,
  Smartphone, Wallet, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useSessionUser } from "@/components/session-context";
import { getCustomerAccountsDemo, type CustomerAccount } from "./account-data";
import type { HomeTransaction } from "./home-data";
import "./customer-accounts.css";

const formatNumber = new Intl.NumberFormat("en-US");
const accountIcons: Record<CustomerAccount["type"], LucideIcon> = { "Thanh toán": Wallet, "Tiết kiệm": PiggyBank, "Thẻ": CreditCard };

function AccountDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-[#000064]/30 backdrop-blur-sm"/>
    <Dialog.Content className="customer-dialog fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between gap-4"><Dialog.Title className="text-xl font-bold">{title}</Dialog.Title><Dialog.Close aria-label="Đóng hộp thoại" className="rounded-lg p-2 hover:bg-slate-100"><X size={20}/></Dialog.Close></div>
      <Dialog.Description className="mb-5 mt-2 text-sm text-slate-500">D4 Bank · Dữ liệu minh họa, chưa kết nối dịch vụ ngân hàng.</Dialog.Description>
      {children}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}

function HeroArtwork() {
  return <div className="customer-accounts-hero-art" aria-hidden="true"><img alt="" src="/customer-accounts-reference.png" draggable={false}/></div>;
}

function RoundIcon({ icon: Icon, incoming = false }: { icon: LucideIcon; incoming?: boolean }) {
  return <span className={`customer-accounts-round ${incoming ? "incoming" : ""}`}><Icon aria-hidden="true"/></span>;
}

export function CustomerAccounts() {
  const session = useSessionUser();
  const data = getCustomerAccountsDemo(session.id);
  const contentViewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);
  const [tab, setTab] = useState<"accounts" | "movements" | "analysis">("accounts");
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [transaction, setTransaction] = useState<HomeTransaction | null>(null);
  const [service, setService] = useState<string | null>(null);
  const total = data.accounts.reduce((sum, item) => sum + item.balance, 0);
  const amount = (value: number) => hidden ? "••••••" : formatNumber.format(value);

  useLayoutEffect(() => {
    const viewport = contentViewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const fit = () => {
      content.style.removeProperty("zoom");
      content.style.removeProperty("width");
      if (!desktop.matches) return;
      const availableWidth = viewport.clientWidth;
      const availableHeight = viewport.clientHeight;
      if (availableWidth <= 0 || availableHeight <= 0) return;

      // Measure the overflowing children, not the fixed-height content box. Using
      // getBoundingClientRect() here kept reporting the viewport height and made
      // the old binary search collapse the dashboard to its 10% fallback scale.
      const naturalWidth = content.scrollWidth;
      const naturalHeight = content.scrollHeight;
      const scale = Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight);
      if (scale >= 0.999) return;

      content.style.zoom = String(scale);
      content.style.width = `${availableWidth / scale}px`;
    };
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    desktop.addEventListener("change", fit);
    fit();
    return () => { observer.disconnect(); desktop.removeEventListener("change", fit); };
  }, [tab, session.id]);

  return <div className="customer-accounts-page">
    <section className="customer-accounts-hero">
      <HeroArtwork/>
      <div className="customer-accounts-hero-copy"><p>Trang chủ <ChevronRight size={13}/> Tài khoản của tôi</p><h1>Tài khoản <span>của tôi</span></h1><strong>Quản lý tất cả tài khoản của bạn tại D4 Bank một cách dễ dàng, an toàn và tiện lợi.</strong></div>
    </section>

    <div className="customer-accounts-content-viewport" ref={contentViewportRef}><div className="customer-accounts-content" ref={contentRef}>
      <section className="customer-accounts-stats">
        <article><RoundIcon icon={Wallet}/><div><p>Tổng số dư</p><h2>{amount(total)} <small>VND</small><button aria-label={hidden ? "Hiện số dư" : "Ẩn số dư"} onClick={() => setHidden(!hidden)}>{hidden ? <Eye size={19}/> : <EyeOff size={19}/>}</button></h2><span>↑ 8% <i>so với tháng trước</i></span></div></article>
        <article><RoundIcon icon={Wallet}/><div><p>Tài khoản thanh toán</p><h2>{amount(data.accounts.find((item) => item.type === "Thanh toán")?.balance ?? 0)} <small>VND</small></h2><span>1 tài khoản</span></div></article>
        <article><RoundIcon icon={PiggyBank}/><div><p>Tài khoản tiết kiệm</p><h2>{amount(data.accounts.find((item) => item.type === "Tiết kiệm")?.balance ?? 0)} <small>VND</small></h2><span>1 tài khoản</span></div></article>
        <article><RoundIcon icon={CreditCard}/><div><p>Tài khoản thẻ</p><h2>{amount(data.accounts.find((item) => item.type === "Thẻ")?.balance ?? 0)} <small>VND</small></h2><span>1 tài khoản</span></div></article>
      </section>

      <div className="customer-accounts-body">
        <div className="customer-accounts-main">
          <nav className="customer-accounts-tabs" aria-label="Nội dung tài khoản">
            {[{ id: "accounts", label: "Danh sách tài khoản" }, { id: "movements", label: "Biến động số dư" }, { id: "analysis", label: "Biểu đồ phân tích" }].map((item) => <button className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id as typeof tab)}>{item.label}</button>)}
          </nav>

          {tab === "accounts" && <section className="customer-accounts-panel customer-account-list">
            <header><h2>Danh sách tài khoản</h2><button onClick={() => setService("open-account")}><Plus size={20}/> Mở tài khoản mới</button></header>
            <div className="customer-account-table-scroll"><table><thead><tr><th></th><th>Số tài khoản</th><th>Tên tài khoản</th><th>Loại tài khoản</th><th>Số dư (VND)</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{data.accounts.map((item) => {
              const Icon = accountIcons[item.type];
              return <tr key={item.id}><td><Icon size={21}/></td><td>{hidden ? "•••• •••• ••••" : item.number}</td><td><b>{item.name}</b><small>{item.description}</small></td><td><span className={`account-type ${item.id}`}>{item.type}</span></td><td>{amount(item.balance)}</td><td><span className="active-status">{item.status}</span></td><td><button className="account-detail" onClick={() => setAccount(item)}>Xem chi tiết</button></td></tr>;
            })}</tbody></table></div>
            {!data.accounts.length && <p className="customer-accounts-empty">Chưa có tài khoản minh họa.</p>}
          </section>}

          {tab === "movements" && <section className="customer-accounts-panel customer-balance-movements"><header><div><h2>Biến động số dư</h2><p>Thống kê từ các giao dịch minh họa gần nhất</p></div></header><div className="movement-summary"><article><span>Tiền vào</span><b>+3,000,000 VND</b></article><article><span>Tiền ra</span><b>-1,062,000 VND</b></article><article><span>Chênh lệch</span><b>+1,938,000 VND</b></article></div><div className="movement-bars">{[42,29,76,36,58,88,67].map((height, index) => <i key={index} style={{ height: `${height}%` }}/>)}</div></section>}

          {tab === "analysis" && <section className="customer-accounts-panel customer-account-analysis"><header><div><h2>Biểu đồ phân tích</h2><p>Cơ cấu số dư và dòng tiền minh họa</p></div></header><div className="analysis-grid"><div className="account-donut"><span><b>{hidden ? "••••••" : "28,650,000"}</b><small>VND</small></span></div><div className="analysis-legend"><p><i className="payment"/> Thanh toán <b>65%</b></p><p><i className="savings"/> Tiết kiệm <b>35%</b></p><p><i className="card"/> Thẻ <b>0%</b></p></div></div></section>}

          <section className="customer-accounts-panel customer-account-transactions">
            <header><h2>Giao dịch gần đây</h2><Link href="/customer/transactions">Xem tất cả <ArrowRight size={18}/></Link></header>
            <div className="customer-account-transactions-scroll"><table><thead><tr><th></th><th>Thời gian</th><th>Nội dung</th><th>Tài khoản</th><th>Số tiền (VND)</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{data.transactions.map((item) => <tr key={item.id}><td><RoundIcon icon={item.direction === "in" ? ArrowDownLeft : ArrowRight} incoming={item.direction === "in"}/></td><td><span className="transaction-time">{item.time}</span></td><td>{item.description}</td><td>{hidden ? "•••• •••• ••••" : "1023 4567 8910"}</td><td className={item.direction === "in" ? "income" : "expense"}>{hidden ? "••••••" : `${item.direction === "in" ? "+" : "-"}${amount(item.amount)}`}</td><td><span className="active-status">Thành công</span></td><td><button className="account-detail" aria-label={`Chi tiết ${item.description}`} onClick={() => setTransaction(item)}>Xem chi tiết</button></td></tr>)}</tbody></table></div>
            <p className="customer-accounts-demo">Dữ liệu minh họa · Không phải số dư hoặc giao dịch thực tế</p>
          </section>
        </div>

        <aside>
          <section className="customer-accounts-panel customer-account-actions"><h2>Thao tác nhanh</h2>{[
            { label: "Chuyển tiền", icon: ArrowUpRight, href: "/customer/transfer" },
            { label: "Nạp tiền", icon: Smartphone },
            { label: "Thanh toán hóa đơn", icon: FileText },
            { label: "Mở tài khoản tiết kiệm", icon: PiggyBank },
          ].map(({ label, icon: Icon, href }) => href ? <Link href={href} key={label}><RoundIcon icon={Icon}/><span>{label}</span><ChevronRight/></Link> : <button onClick={() => setService(label)} key={label}><RoundIcon icon={Icon}/><span>{label}</span><ChevronRight/></button>)}</section>
          <section className="customer-accounts-panel customer-account-structure"><h2>Cơ cấu số dư tài khoản</h2><div><div className="account-donut"><span><b>{hidden ? "••••••" : "28,650,000"}</b><small>VND</small></span></div><div className="analysis-legend"><p><i className="payment"/> Thanh toán <b>65%</b></p><p><i className="savings"/> Tiết kiệm <b>35%</b></p><p><i className="card"/> Thẻ <b>0%</b></p></div></div></section>
          <section className="customer-accounts-panel customer-account-security"><ShieldCheck/><div><h2>Tài khoản an toàn<br/>Giao dịch an tâm</h2>{["Bảo mật đa lớp", "Theo dõi giao dịch 24/7", "Cảnh báo giao dịch bất thường"].map((item) => <p key={item}>● <span>{item}</span></p>)}</div></section>
        </aside>
      </div>
    </div></div>

    {account && <AccountDialog title="Chi tiết tài khoản" close={() => setAccount(null)}><dl className="customer-detail-list"><div><dt>Tên tài khoản</dt><dd>{account.name}</dd></div><div><dt>Số tài khoản</dt><dd>{hidden ? "•••• •••• ••••" : account.number}</dd></div><div><dt>Loại</dt><dd>{account.type}</dd></div><div><dt>Số dư</dt><dd>{amount(account.balance)} VND</dd></div><div><dt>Trạng thái</dt><dd><span className="active-status">{account.status}</span></dd></div></dl></AccountDialog>}
    {transaction && <AccountDialog title="Chi tiết giao dịch" close={() => setTransaction(null)}><dl className="customer-detail-list"><div><dt>Mã giao dịch mẫu</dt><dd>{transaction.id}</dd></div><div><dt>Thời gian</dt><dd>{transaction.time}</dd></div><div><dt>Nội dung</dt><dd>{transaction.description}</dd></div><div><dt>Số tiền</dt><dd className={transaction.direction === "in" ? "income" : "expense"}>{hidden ? "••••••" : `${transaction.direction === "in" ? "+" : "-"}${amount(transaction.amount)}`} VND</dd></div></dl></AccountDialog>}
    {service && <AccountDialog title={service === "open-account" ? "Mở tài khoản mới" : service} close={() => setService(null)}><div className="space-y-4 text-sm leading-6"><p>Tính năng này chưa kết nối trong bản giao diện minh họa.</p><p className="rounded-xl bg-rose-50 p-4">Không có yêu cầu tài chính nào được gửi và không có số dư nào bị thay đổi.</p>{service === "open-account" && <div className="grid gap-3 sm:grid-cols-2"><button className="btn-secondary"><Wallet size={18}/>Thanh toán</button><button className="btn-secondary"><PiggyBank size={18}/>Tiết kiệm</button></div>}</div></AccountDialog>}
  </div>;
}
