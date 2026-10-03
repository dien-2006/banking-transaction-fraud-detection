"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, ChevronRight, CreditCard, Database,
  Eye, EyeOff, FileText, Hand, Headphones, Landmark, MessageCircle, MoreHorizontal,
  Phone, PiggyBank, Plus, Search, Settings, ShoppingCart, Smartphone, Wallet, X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useSessionUser } from "@/components/session-context";
import { getCustomerHomeDemo, type HomeTransaction } from "./home-data";
import { ReferenceArtwork } from "./reference-artwork";

const shortcuts: { id: string; label: string; icon: LucideIcon; href?: string }[] = [
  { id: "transfer", label: "Chuyển tiền", icon: ArrowUpRight, href: "/customer/transfer" },
  { id: "deposit", label: "Nạp tiền", icon: Smartphone },
  { id: "bills", label: "Thanh toán hóa đơn", icon: FileText },
  { id: "shopping", label: "Mua sắm trực tuyến", icon: ShoppingCart },
  { id: "savings", label: "Tiết kiệm", icon: PiggyBank },
  { id: "loans", label: "Vay vốn", icon: Landmark, href: "/customer/loans" },
  { id: "cards", label: "Mở thẻ", icon: CreditCard, href: "/customer/cards" },
  { id: "more", label: "Xem thêm", icon: MoreHorizontal },
];
const transactionIcons = { transfer: ArrowRight, bill: Smartphone, shopping: ShoppingCart, received: ArrowDownLeft };
const formatNumber = new Intl.NumberFormat("en-US");

function IconCircle({ icon: Icon, className = "" }: { icon: LucideIcon; className?: string }) {
  return <span className={`customer-icon-circle ${className}`}><Icon aria-hidden="true"/></span>;
}

function HomeDialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  return <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-[#000064]/30 backdrop-blur-sm"/>
      <Dialog.Content className="customer-dialog fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between gap-4">
          <Dialog.Title className="text-xl font-bold">{title}</Dialog.Title>
          <Dialog.Close aria-label="Đóng hộp thoại" className="rounded-lg p-2 hover:bg-slate-100"><X size={20}/></Dialog.Close>
        </div>
        <Dialog.Description className="mb-5 mt-2 text-sm text-slate-500">D4 Bank · Giao diện minh họa, chưa kết nối dịch vụ ngân hàng.</Dialog.Description>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function CustomerHome() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const session = useSessionUser();
  const data = getCustomerHomeDemo(session.id);
  const [hidden, setHidden] = useState(false);
  const [dialog, setDialog] = useState<string | null>(null);
  const [selected, setSelected] = useState<HomeTransaction | null>(null);
  const [visibleShortcuts, setVisibleShortcuts] = useState(shortcuts.map((item) => item.id));
  const [draftShortcuts, setDraftShortcuts] = useState(visibleShortcuts);
  const [query, setQuery] = useState("");
  // Fit only the content below the banner. The banner keeps the admin frame's
  // aspect ratio regardless of the content's zoom or the viewport height.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const desktop = window.matchMedia("(min-width: 1100px)");
    const fit = () => {
      content.style.removeProperty("zoom");
      content.style.removeProperty("width");
      if (!desktop.matches) return;
      const availableHeight = viewport.clientHeight;
      const applyScale = (scale: number) => {
        content.style.zoom = String(scale);
        content.style.width = `${viewport.clientWidth / scale}px`;
      };
      const fits = () => content.getBoundingClientRect().height <= availableHeight
        && content.scrollWidth * Number(content.style.zoom || 1) <= viewport.clientWidth + 1;
      if (fits()) return;
      let lower = 0.1;
      let upper = 1;
      for (let step = 0; step < 12; step += 1) {
        const scale = (lower + upper) / 2;
        applyScale(scale);
        if (fits()) lower = scale;
        else upper = scale;
      }
      applyScale(lower);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    desktop.addEventListener("change", fit);
    fit();
    return () => { observer.disconnect(); desktop.removeEventListener("change", fit); };
  }, [visibleShortcuts, session.name]);
  const amount = (value: number) => hidden ? "••••••" : formatNumber.format(value);
  const total = data.accounts.reduce((sum, account) => sum + account.balance, 0);
  const transactions = data.transactions.filter((transaction) =>
    `${transaction.description} ${transaction.time} ${transaction.id}`.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")),
  );
  const openService = (id: string) => setDialog(id);
  const closeDialog = () => { setDialog(null); setSelected(null); };
  const serviceTitle = shortcuts.find((item) => item.id === dialog)?.label ?? ({
    offers: "Ưu đãi dành cho bạn", help: "Trung tâm hỗ trợ", chat: "Chat trực tuyến",
    hotline: "Liên hệ tổng đài", accounts: "Tài khoản của tôi", history: "Lịch sử giao dịch minh họa",
  } as Record<string, string>)[dialog ?? ""] ?? "Dịch vụ D4 Bank";

  return <div className="customer-home-layout">
    <section className="customer-welcome" aria-labelledby="customer-greeting">
      <ReferenceArtwork region="hero" className="customer-welcome-art"/>
      <div className="customer-welcome-copy">
        <p>Xin chào,</p>
        <h1 id="customer-greeting">{session.name}! <Hand className="customer-wave" aria-hidden="true"/></h1>
        <span>Cùng D4 Bank quản lý tài chính thông minh mỗi ngày!</span>
      </div>
    </section>

    <div className="customer-home-viewport" ref={viewportRef}><div className="customer-home" ref={contentRef}>
    <section className="customer-stats" aria-label="Tổng quan tài chính">
      <article className="customer-panel customer-stat">
        <IconCircle icon={Wallet}/><div><p>Tổng số dư</p><div className="customer-stat-value"><strong>{amount(total)}</strong><span>VND</span><button className="customer-balance-toggle" aria-label={hidden ? "Hiện số dư" : "Ẩn số dư"} aria-pressed={hidden} onClick={() => setHidden(!hidden)}>{hidden ? <Eye size={21}/> : <EyeOff size={21}/>}</button></div><small><span className="customer-positive">↑ {data.growth}%</span> so với tháng trước</small></div>
      </article>
      <article className="customer-panel customer-stat">
        <IconCircle icon={CreditCard}/><div><p>Tài khoản thanh toán</p><div className="customer-stat-value"><strong>{amount(data.accounts[0]?.balance ?? 0)}</strong><span>VND</span></div><small>{hidden ? "•••• •••• ••••" : data.accounts[0]?.number ?? "Chưa có tài khoản"}</small></div>
      </article>
      <article id="customer-savings" className="customer-panel customer-stat">
        <IconCircle icon={PiggyBank}/><div><button className="customer-savings-link" onClick={() => setDialog("savings")}>Tiết kiệm</button><div className="customer-stat-value"><strong>{amount(data.accounts[1]?.balance ?? 0)}</strong><span>VND</span></div><small>{data.savingsCount} sổ tiết kiệm</small></div>
      </article>
      <article className="customer-panel customer-stat">
        <IconCircle icon={CreditCard}/><div><p>Thẻ đang hoạt động</p><div className="customer-stat-value"><strong>{data.activeCards} thẻ</strong></div><Link className="customer-text-link" href="/customer/cards">Xem chi tiết <ArrowRight size={18}/></Link></div>
      </article>
    </section>

    <div className="customer-content-grid">
      <div className="customer-main-column">
        <section className="customer-panel customer-quick">
          <div className="customer-section-heading"><h2>Giao dịch nhanh</h2><button className="customer-muted-link" onClick={() => { setDraftShortcuts(visibleShortcuts); setDialog("customize"); }}>Tùy chỉnh <Settings size={16}/></button></div>
          <div className="customer-shortcuts">{shortcuts.filter((item) => visibleShortcuts.includes(item.id)).map(({ id, label, icon: Icon, href }) => {
            const content = <><span className="customer-shortcut-icon"><Icon aria-hidden="true" size={31}/>{id === "cards" && <Plus className="customer-card-plus" size={12}/>}</span><span>{label}</span></>;
            return href ? <Link className="customer-shortcut" key={id} href={href}>{content}</Link> : <button className="customer-shortcut" key={id} onClick={() => openService(id)}>{content}</button>;
          })}</div>
        </section>

        <section className="customer-panel customer-recent">
          <div className="customer-section-heading"><h2>Giao dịch gần đây</h2><button className="customer-text-link" onClick={() => { setQuery(""); setDialog("history"); }}>Xem tất cả <ArrowRight size={19}/></button></div>
          <div className="customer-table-scroll"><table className="customer-transactions">
            <caption className="sr-only">Giao dịch mẫu của khách hàng đang đăng nhập</caption>
            <thead><tr><th>Thời gian</th><th>Nội dung</th><th>Số tiền</th><th>Trạng thái</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
            <tbody>{data.transactions.map((transaction) => <tr key={transaction.id}>
              <td><div className="customer-transaction-time"><IconCircle icon={transactionIcons[transaction.kind]} className={transaction.direction === "in" ? "incoming" : ""}/><time>{transaction.time}</time></div></td>
              <td>{transaction.description}</td>
              <td className={transaction.direction === "in" ? "customer-positive" : "customer-negative"}>{hidden ? "••••••" : `${transaction.direction === "in" ? "+" : "-"}${amount(transaction.amount)}`} VND</td>
              <td><span className="customer-success">Thành công</span></td>
              <td><button aria-label={`Chi tiết ${transaction.description}`} onClick={() => setSelected(transaction)} className="customer-row-menu"><MoreHorizontal size={20}/></button></td>
            </tr>)}</tbody>
          </table></div>
          {!data.transactions.length && <p className="customer-empty">Chưa có giao dịch cho tài khoản này.</p>}
          <p className="customer-demo-note">Dữ liệu minh họa · Không phải số dư hoặc giao dịch thực tế</p>
        </section>
      </div>

      <aside className="customer-side-column" aria-label="Tài khoản và hỗ trợ">
        <section className="customer-panel customer-accounts">
          <div className="customer-section-heading"><h2>Tài khoản của tôi</h2><button className="customer-text-link" onClick={() => setDialog("accounts")}>Xem tất cả <ArrowRight size={17}/></button></div>
          {data.accounts.map((account) => <button key={account.id} className="customer-account" onClick={() => setDialog("accounts")}>
            <IconCircle icon={account.id === "payment" ? Database : PiggyBank}/><span><span>{account.name}</span><b>{amount(account.balance)} <small>VND</small></b><small>{hidden ? "•••• •••• ••••" : account.number}</small></span><ChevronRight size={19}/>
          </button>)}
          {!data.accounts.length && <p className="customer-empty">Chưa có tài khoản minh họa.</p>}
        </section>
        <section className="customer-panel customer-offers">
          <div className="customer-section-heading"><h2>Ưu đãi dành cho bạn</h2><button className="customer-text-link" onClick={() => setDialog("offers")}>Xem tất cả <ArrowRight size={17}/></button></div>
          <button className="customer-offer" onClick={() => setDialog("offers")}><ReferenceArtwork region="gift"/><span><strong>Hoàn tiền<br/>đến 1.000.000đ</strong><small>Khi thanh toán bằng<br/>thẻ D4 Bank</small></span><span className="customer-offer-arrow"><ArrowRight size={20}/></span></button>
        </section>
        <section id="customer-support" className="customer-panel customer-support">
          <div className="customer-section-heading"><h2>Hỗ trợ khách hàng</h2></div>
          {[
            { id: "help", icon: Headphones, label: "Trung tâm hỗ trợ", detail: "Giải đáp thắc mắc 24/7" },
            { id: "chat", icon: MessageCircle, label: "Chat trực tuyến", detail: "Hỗ trợ nhanh chóng" },
            { id: "hotline", icon: Phone, label: "Gọi tổng đài", detail: "Thông tin liên hệ và hỗ trợ" },
          ].map(({ id, icon, label, detail }) => <button className="customer-support-item" key={id} onClick={() => setDialog(id)}><IconCircle icon={icon}/><span>{label}<small>{detail}</small></span><ChevronRight size={18}/></button>)}
        </section>
      </aside>
    </div>

    {selected && <HomeDialog title="Chi tiết giao dịch" close={closeDialog}>
      <dl className="customer-detail-list"><div><dt>Mã giao dịch mẫu</dt><dd>{selected.id}</dd></div><div><dt>Thời gian</dt><dd>{selected.time}</dd></div><div><dt>Nội dung</dt><dd>{selected.description}</dd></div><div><dt>Số tiền</dt><dd className={selected.direction === "in" ? "customer-positive" : "customer-negative"}>{hidden ? "••••••" : `${selected.direction === "in" ? "+" : "-"}${amount(selected.amount)}`} VND</dd></div><div><dt>Trạng thái</dt><dd><span className="customer-success">Thành công</span></dd></div></dl>
    </HomeDialog>}
    {dialog && !selected && <HomeDialog title={dialog === "customize" ? "Tùy chỉnh giao dịch nhanh" : serviceTitle} close={closeDialog}>
      {dialog === "customize" ? <>
        <p className="mb-4 text-sm text-slate-500">Chọn các lối tắt hiển thị trong lần xem này (ít nhất một mục).</p>
        <div className="grid grid-cols-2 gap-3">{shortcuts.map(({ id, label, icon: Icon }) => <label className="flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm" key={id}><input type="checkbox" checked={draftShortcuts.includes(id)} onChange={(event) => setDraftShortcuts(event.target.checked ? [...draftShortcuts, id] : draftShortcuts.filter((value) => value !== id))}/><Icon size={18}/>{label}</label>)}</div>
        <div className="mt-6 flex justify-end gap-3"><button className="btn-secondary" onClick={closeDialog}>Hủy</button><button className="btn-primary disabled:opacity-40" disabled={!draftShortcuts.length} onClick={() => { setVisibleShortcuts(draftShortcuts); closeDialog(); }}>Lưu tùy chỉnh</button></div>
      </> : dialog === "history" ? <>
        <label className="relative mb-4 block"><Search className="absolute left-3 top-3 text-slate-400" size={18}/><input autoFocus aria-label="Tìm giao dịch" className="field pl-10" placeholder="Tìm theo nội dung, thời gian, mã giao dịch" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
        <div className="divide-y">{transactions.map((transaction) => <button key={transaction.id} className="flex w-full items-center justify-between gap-3 py-4 text-left text-sm" onClick={() => { setDialog(null); setSelected(transaction); }}><span>{transaction.description}<small className="mt-1 block text-slate-500">{transaction.time}</small></span><span className={transaction.direction === "in" ? "customer-positive" : "customer-negative"}>{hidden ? "••••••" : `${transaction.direction === "in" ? "+" : "-"}${amount(transaction.amount)}`} VND</span></button>)}</div>
        {!transactions.length && <p className="customer-empty">Không tìm thấy giao dịch.</p>}
      </> : dialog === "accounts" || dialog === "savings" ? <>
        {data.accounts.filter((account) => dialog !== "savings" || account.id === "savings").map((account) => <div className="mb-3 rounded-xl border p-4" key={account.id}><b>{account.name}</b><p className="my-2 text-sm text-slate-500">{hidden ? "•••• •••• ••••" : account.number}</p><strong>{amount(account.balance)} VND</strong></div>)}
        {!data.accounts.length && <p>Chưa có tài khoản minh họa.</p>}
      </> : dialog === "more" ? <div className="grid grid-cols-2 gap-3">{shortcuts.filter((item) => item.id !== "more").map(({ id, label, href, icon: Icon }) => href ? <Link className="btn-secondary" href={href} key={id}><Icon size={18}/>{label}</Link> : <button className="btn-secondary" key={id} onClick={() => setDialog(id)}><Icon size={18}/>{label}</button>)}</div>
      : dialog === "offers" ? <div className="rounded-xl bg-rose-50 p-5"><h3 className="text-lg font-bold text-red-600">Hoàn tiền đến 1.000.000đ</h3><p className="mt-3 text-sm leading-6">Nội dung ưu đãi minh họa theo thiết kế. Điều kiện áp dụng và thời hạn chương trình sẽ được hiển thị khi kết nối dữ liệu chính thức.</p></div>
      : ["help", "chat", "hotline"].includes(dialog) ? <div className="space-y-4 text-sm leading-6"><p>Kênh hỗ trợ này chưa được kết nối trong bản giao diện minh họa. Chưa có yêu cầu hay tin nhắn nào được gửi đi.</p><details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">Làm sao để ẩn số dư?</summary><p className="mt-2">Nhấn biểu tượng con mắt cạnh Tổng số dư trên trang chủ để ẩn hoặc hiện thông tin tài chính.</p></details><details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">Xem chi tiết giao dịch ở đâu?</summary><p className="mt-2">Nhấn dấu ba chấm trên một dòng trong Giao dịch gần đây.</p></details></div>
      : <div className="space-y-3 text-sm leading-6"><p>Dịch vụ {serviceTitle.toLocaleLowerCase("vi")} chưa được kết nối trong bản giao diện minh họa.</p><p className="rounded-xl bg-rose-50 p-4">Không có tiền bị trừ và không có yêu cầu tài chính nào được tạo.</p><Link className="btn-secondary" href="/customer/cards">Xem thẻ của tôi <ArrowRight size={16}/></Link></div>}
    </HomeDialog>}
  </div></div></div>;
}
