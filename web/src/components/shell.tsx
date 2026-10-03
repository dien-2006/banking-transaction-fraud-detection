"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowRight, Bell, ChevronDown, CircleUserRound, LogOut, Menu, Search, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "@/components/brand";
import { ProfilePanel } from "@/components/profile-panel";
import { SessionProvider } from "@/components/session-context";
import { navigation, roleLabels } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { authService, demoUsers } from "@/services/auth.service";
import type { Role, SessionUser } from "@/types";
import { ReferenceArtwork } from "@/features/customer/reference-artwork";
import "@/features/customer/customer-home.css";

const notifications: Record<Role, { title: string; detail: string; time: string; href: string }[]> = {
  admin: [
    { title: "Giao dịch rủi ro cao", detail: "TRX001256 có RuleScore 92 và đã bị chặn.", time: "2 phút trước", href: "/admin/fraud" },
    { title: "Review đang chờ", detail: "Có 5 giao dịch cần được kiểm tra.", time: "12 phút trước", href: "/admin/fraud?status=review" },
    { title: "Hoạt động hệ thống", detail: "Model v1.2 đã được triển khai thành công.", time: "1 giờ trước", href: "/admin/audit-logs" },
  ],
  employee: [
    { title: "Hồ sơ cần xử lý", detail: "Có 3 hồ sơ khách hàng mới đang chờ.", time: "5 phút trước", href: "/employee/customers" },
    { title: "Review giao dịch", detail: "Một giao dịch mới được chuyển tới bạn.", time: "20 phút trước", href: "/employee/fraud" },
  ],
  customer: [
    { title: "Giao dịch thành công", detail: "Giao dịch gần nhất đã được xử lý.", time: "8 phút trước", href: "/customer/transactions" },
    { title: "Nhắc lịch thanh toán", detail: "Kỳ thanh toán khoản vay sắp đến hạn.", time: "1 giờ trước", href: "/customer/loans" },
  ],
};

function NotificationMenu({ role, unreadCount, markRead }: { role: Role; unreadCount: number; markRead: () => void }) {
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <button aria-label={`Thông báo, ${unreadCount} chưa đọc`} className="relative grid size-8 place-items-center rounded-lg bg-slate-50 outline-none transition hover:bg-[#fff0f0] data-[state=open]:bg-[#fff0f0]">
        <Bell size={16}/>{unreadCount > 0 && <span className="absolute -right-0.5 -top-1 grid min-w-3.5 place-items-center rounded-full bg-coral px-1 text-[8px] font-bold leading-3.5 text-white">{unreadCount}</span>}
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="end" className="z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-100 bg-white shadow-2xl" sideOffset={4}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div><p className="text-sm font-black text-navy">Thông báo</p><p className="mt-0.5 text-[11px] text-slate-400">{unreadCount} thông báo chưa đọc</p></div>
          {unreadCount > 0 && <button className="text-[11px] font-bold text-coral hover:underline" onClick={markRead}>Đánh dấu đã đọc</button>}
        </div>
        <div className="p-2">{notifications[role].map((item, index) => <DropdownMenu.Item asChild key={item.title}>
          <Link className="flex cursor-pointer gap-3 rounded-lg px-3 py-2.5 outline-none hover:bg-[#fff7f8] focus:bg-[#fff7f8]" href={item.href}>
            <span className={cn("mt-1 size-2 shrink-0 rounded-full", index < unreadCount ? "bg-coral" : "bg-slate-200")}/>
            <span className="min-w-0"><b className="block truncate text-xs text-navy">{item.title}</b><span className="mt-1 block text-[11px] leading-4 text-slate-500">{item.detail}</span><small className="mt-1 block text-[10px] text-slate-400">{item.time}</small></span>
          </Link>
        </DropdownMenu.Item>)}</div>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

function AccountMenu({ role, session, avatarUrl, openProfile, logout }: { role: Role; session: SessionUser; avatarUrl: string | null; openProfile: () => void; logout: () => void }) {
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <button aria-label="Mở menu tài khoản" className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-left outline-none transition hover:bg-slate-50 data-[state=open]:bg-slate-50">
        <span className="grid size-8 place-items-center overflow-hidden rounded-full bg-navy text-xs font-bold text-white">{avatarUrl ? <img alt={`Ảnh đại diện ${session.name}`} className="size-full object-cover" src={avatarUrl}/> : session.name.slice(0, 1)}</span>
        <span className="hidden sm:block"><span className="block text-[12px] font-bold leading-3.5">{session.name}</span><span className="block text-[9px] leading-3 text-slate-500">{role === "customer" ? "Khách hàng cá nhân" : roleLabels[role]}</span></span>
        <ChevronDown className="hidden text-slate-400 sm:block" size={14}/>
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="end" className="z-50 mt-2 w-56 rounded-xl border border-slate-100 bg-white p-2 shadow-2xl" sideOffset={4}>
        <div className="border-b border-slate-100 px-3 py-2"><p className="truncate text-sm font-bold text-navy">{session.name}</p><p className="mt-0.5 text-xs text-slate-500">{session.subtitle}</p></div>
        <DropdownMenu.Item className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-600 outline-none hover:bg-[#fff0f0] hover:text-coral focus:bg-[#fff0f0] focus:text-coral" onSelect={openProfile}><CircleUserRound size={17}/>Hồ sơ cá nhân</DropdownMenu.Item>
        <DropdownMenu.Separator className="my-1 h-px bg-slate-100"/>
        <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-600 outline-none hover:bg-[#fff0f0] hover:text-coral focus:bg-[#fff0f0] focus:text-coral" onSelect={logout}><LogOut size={17}/>Đăng xuất</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

export function DashboardShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const [sessionReady, setSessionReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(notifications[role].length);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [session, setSession] = useState<SessionUser>(demoUsers[role]);
  const [featureQuery, setFeatureQuery] = useState("");
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const activeSession = authService.getSession();
    if (!activeSession) {
      router.replace("/login");
      return;
    }
    if (activeSession.role !== role) {
      router.replace(`/${activeSession.role}`);
      return;
    }
    setSession({ ...demoUsers[role], ...activeSession });
    setUnreadCount(notifications[role].length);
    setSessionReady(true);
  }, [role, router]);

  if (!sessionReady) {
    return <main className="grid min-h-screen place-items-center bg-slate-50" aria-busy="true">
      <div className="text-center"><div className="mx-auto size-9 animate-spin rounded-full border-4 border-slate-200 border-t-coral"/><p className="mt-3 text-sm font-semibold text-slate-500">Đang kiểm tra phiên đăng nhập...</p></div>
    </main>;
  }

  const customerModule = role === "customer" && !["/customer", "/customer/accounts", "/customer/about", "/customer/news"].includes(pathname);

  return <SessionProvider value={session}><div className={cn("dashboard-shell dashboard-fixed min-h-screen bg-white", role === "customer" && "customer-shell", role === "customer" && pathname === "/customer" && "customer-home-fixed", role === "customer" && pathname === "/customer/accounts" && "customer-accounts-fixed")}>
    {open && <button aria-label="Đóng menu" className="dashboard-menu-backdrop fixed inset-0 z-30 bg-navy/30 lg:hidden" onClick={() => setOpen(false)}/>} 
    <aside className={cn("dashboard-sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-100 bg-white px-2 py-3 transition-transform", open ? "translate-x-0" : "-translate-x-full")}>
      <div className="flex items-center justify-between px-1"><Brand customer={role === "customer"}/><button aria-label="Đóng menu" className="dashboard-menu-close lg:hidden" onClick={() => setOpen(false)}><X/></button></div>
      <nav className="mt-4 flex-1 space-y-0.5 overflow-hidden">{navigation[role].map(({ label, href, icon: Icon }) => {
        const active = pathname === href || (href !== `/${role}` && pathname.startsWith(`${href}/`));
        return <Link onClick={() => setOpen(false)} className={cn("flex items-center gap-2 rounded-lg px-2 py-2 text-[11px] font-semibold transition", active ? "bg-gradient-to-r from-[#f80820] to-[#ff586b] text-white shadow-md shadow-[#ffd9dd]" : "text-slate-600 hover:bg-[#fff0f0] hover:text-coral")} href={href} key={href}><Icon className="shrink-0" size={16}/>{label}</Link>;
      })}</nav>
      {role === "customer" ? <Link className="customer-sidebar-promo" href="/customer#customer-support" onClick={() => setOpen(false)}><ReferenceArtwork region="phone"/><div><p>Ngân hàng số<br/><b>D4 Bank</b></p><small>Mọi giao dịch trong tầm tay<br/>An toàn – Nhanh chóng<br/>Tiện lợi</small><span className="customer-promo-arrow" aria-label="Tìm hiểu thêm"><ArrowRight size={23}/></span></div></Link> : <div className="mb-2 rounded-xl bg-blush p-3"><ShieldCheck className="text-coral" size={20}/><p className="mt-1.5 text-[11px] font-bold">Dữ liệu được bảo vệ</p><p className="mt-1 text-[9px] leading-3.5 text-slate-500">Hệ thống đạt tiêu chuẩn bảo mật ngân hàng.</p></div>}
      <button className="flex items-center gap-2 rounded-lg px-2 py-2 text-[11px] font-semibold text-slate-600 hover:bg-[#fff0f0] hover:text-coral" onClick={() => { authService.logout(); router.push("/login"); }}><LogOut size={16}/>Đăng xuất</button>
    </aside>
    <header className="sticky top-0 z-20 flex h-10 items-center gap-2 border-b border-slate-100 bg-white/95 px-3 backdrop-blur md:px-4">
      <button aria-label="Mở menu" className="dashboard-menu-open grid size-8 place-items-center rounded-lg border lg:hidden" onClick={() => setOpen(true)}><Menu size={18}/></button>
      <nav className="hidden items-center gap-1.5 text-[12px] font-semibold lg:flex">{[
        ["Tổng quan", `/${role}`],
        ["Giới thiệu chúng tôi", `/${role}/about`],
        ["Tin tức", `/${role}/news`],
      ].map(([label, href]) => <Link className={cn("rounded-lg px-3 py-1.5 transition", pathname === href ? "bg-[#fff0f0] text-coral" : "hover:bg-slate-50 hover:text-coral")} href={href} key={href}>{label}</Link>)}</nav>
      <div className="ml-auto flex items-center gap-2">
        {role === "customer" ? <div className="customer-feature-search"><label><Search size={18}/><input aria-label="Tìm tính năng" placeholder="Tìm giao dịch, tính năng, sản phẩm..." value={featureQuery} onChange={(event) => setFeatureQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setFeatureQuery(""); }}/></label>{featureQuery.trim() && <div className="customer-search-results"><p>Tính năng</p>{navigation.customer.filter((item) => item.label.toLocaleLowerCase("vi").includes(featureQuery.trim().toLocaleLowerCase("vi"))).map((item) => <Link key={item.href} href={item.href} onClick={() => setFeatureQuery("")}>{item.label}<ArrowRight size={16}/></Link>)}{!navigation.customer.some((item) => item.label.toLocaleLowerCase("vi").includes(featureQuery.trim().toLocaleLowerCase("vi"))) && <p>Không tìm thấy tính năng.</p>}</div>}</div> : <label className="relative hidden xl:block"><Search className="absolute left-3 top-1.5 text-slate-400" size={16}/><input className="h-8 w-60 rounded-lg bg-slate-50 pl-9 pr-3 text-xs" placeholder="Tìm kiếm trong D4 Bank..."/></label>}
        <NotificationMenu role={role} unreadCount={unreadCount} markRead={() => setUnreadCount(0)}/>
        <AccountMenu role={role} session={session} avatarUrl={avatarUrl} openProfile={() => setProfileOpen(true)} logout={() => { authService.logout(); router.push("/login"); }}/>
      </div>
    </header>
    {profileOpen && <ProfilePanel user={session} roleLabel={roleLabels[role]} avatarUrl={avatarUrl} onAvatarChange={setAvatarUrl} onClose={() => setProfileOpen(false)}/>} 
    <main className="h-[calc(100dvh-2.5rem)] overflow-hidden p-2 md:p-3"><div className={cn("dashboard-page-fit", role === "admin" && pathname === "/admin" && "admin-page-fit", role === "employee" && pathname === "/employee" && "admin-page-fit", pathname === `/${role}/about` && "about-page-fit", pathname === `/${role}/news` && "news-page-fit", role === "admin" && pathname === "/admin/branches" && "branches-page-fit", role === "admin" && pathname === "/admin/employees" && "employees-page-fit", role === "admin" && pathname === "/admin/customers" && "customers-page-fit", role === "admin" && pathname === "/admin/accounts" && "customers-page-fit", role === "admin" && pathname === "/admin/transactions" && "customers-page-fit", role === "admin" && pathname === "/admin/loans" && "customers-page-fit", role === "admin" && pathname === "/admin/cards" && "customers-page-fit", role === "admin" && pathname === "/admin/fraud" && "customers-page-fit", role === "admin" && pathname === "/admin/insights" && "insights-page-fit", role === "admin" && pathname === "/admin/audit-logs" && "customers-page-fit", role === "employee" && ["/employee/customers","/employee/accounts","/employee/transactions","/employee/loans","/employee/cards","/employee/fraud"].includes(pathname) && "customers-page-fit", role === "employee" && pathname === "/employee/reports" && "insights-page-fit", customerModule && "customer-module-fit")}>{children}</div></main>
  </div></SessionProvider>;
}
