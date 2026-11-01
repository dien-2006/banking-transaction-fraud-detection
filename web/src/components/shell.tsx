"use client";

import { notificationText } from "@/lib/notification-data";
import { formatDateTime } from "@/lib/presentation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowRight,
  Bell,
  ChevronDown,
  CircleUserRound,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "@/components/brand";
import "@/features/customer/customer-ui.css";
import { SessionProvider } from "@/components/session-context";
import { navigation, roleLabels } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { authService } from "@/services/auth.service";
import { SESSION_CHANGED_EVENT } from "@/services/api.client";
import { bankService } from "@/services/bank.service";
import { useQuery } from "@tanstack/react-query";
import type { Role, SessionUser } from "@/types";
import "@/features/customer/customer-home.css";
import "@/features/customer/customer-workspace.css";
import { useNotificationRead } from "@/features/employee/use-notification-read";

function NotificationMenu({
  role,
  sessionId,
}: {
  role: Role;
  sessionId: string;
}) {
  const { readIds, markRead } = useNotificationRead(role, sessionId);
  const customerQuery = useQuery({
    queryKey: ["shell-notifications", "customer", sessionId],
    queryFn: () => bankService.customerNotifications(1, 5),
    enabled: role === "customer",
  });
  const employeeQuery = useQuery({
    queryKey: ["shell-notifications", role, sessionId],
    queryFn: () => bankService.employeeNotifications(1, 5),
    enabled: role !== "customer",
  });
  const query = role === "customer" ? customerQuery : employeeQuery;
  const items =
    role === "customer"
      ? (customerQuery.data?.items ?? []).map((item) => ({
          id: String(item.notificationoutboxid),
          title: notificationText(item.notificationtype)[0],
          detail: item.transactioncode
            ? `Giao dịch ${item.transactioncode}`
            : "Cập nhật từ D4 Bank",
          time: formatDateTime(item.createdat),
          href: "/customer/notifications",
          unread: true,
        }))
      : (employeeQuery.data?.items ?? []).map((item) => ({
          id: item.id,
          title: item.title,
          detail: item.detail,
          time: formatDateTime(item.createdat),
          href: `/${role}/notifications`,
          unread: item.unread,
        }));
  const unreadCount = items.filter(
    (item) => item.unread && !readIds.includes(item.id),
  ).length;
  const markAllRead = () => markRead(items.map((item) => item.id));
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label={`Thông báo, ${unreadCount} chưa đọc`}
          className="relative grid size-8 place-items-center rounded-lg bg-slate-50 outline-none transition hover:bg-[#fff0f0] data-[state=open]:bg-[#fff0f0]"
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-1 grid min-w-3.5 place-items-center rounded-full bg-coral px-1 text-[8px] font-bold leading-3.5 text-white">
              {unreadCount}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-100 bg-white shadow-2xl"
          sideOffset={4}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-black text-navy">Thông báo</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {query.isPending
                  ? "Đang tải…"
                  : query.isError
                    ? "Không tải được thông báo"
                    : `${unreadCount} chưa đọc trong thông báo gần đây`}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                className="text-xs font-bold text-coral hover:underline"
                onClick={markAllRead}
              >
                Đánh dấu đã đọc
              </button>
            )}
          </div>
          <div className="p-2">
            {items.map((item) => (
              <DropdownMenu.Item asChild key={item.id}>
                <Link
                  className="flex cursor-pointer gap-3 rounded-lg px-3 py-2.5 outline-none hover:bg-[#fff7f8] focus:bg-[#fff7f8]"
                  href={item.href}
                  onClick={() => markRead([item.id])}
                >
                  <span
                    className={cn(
                      "mt-1 size-2 shrink-0 rounded-full",
                      item.unread && !readIds.includes(item.id)
                        ? "bg-coral"
                        : "bg-slate-200",
                    )}
                  />
                  <span className="min-w-0">
                    <b className="block truncate text-xs text-navy">
                      {item.title}
                    </b>
                    <span className="mt-1 block text-[11px] leading-4 text-slate-500">
                      {item.detail}
                    </span>
                    <small className="mt-1 block text-[10px] text-slate-400">
                      {item.time}
                    </small>
                  </span>
                </Link>
              </DropdownMenu.Item>
            ))}
            {query.isPending && (
              <p className="p-4 text-xs text-slate-500" role="status">
                Đang tải thông báo…
              </p>
            )}
            {query.isError && (
              <div className="p-4 text-xs text-red-600" role="alert">
                Không thể tải thông báo.{" "}
                <button
                  className="underline"
                  onClick={() => void query.refetch()}
                >
                  Thử lại
                </button>
              </div>
            )}
            {query.isSuccess && items.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-slate-400">
                Chưa có thông báo.
              </p>
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function AccountMenu({
  role,
  session,
  avatarUrl,
  openProfile,
  logout,
}: {
  role: Role;
  session: SessionUser;
  avatarUrl: string | null;
  openProfile: () => void;
  logout: () => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label="Mở menu tài khoản"
          className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-left outline-none transition hover:bg-slate-50 data-[state=open]:bg-slate-50"
        >
          <span className="grid size-8 place-items-center overflow-hidden rounded-full bg-navy text-xs font-bold text-white">
            {avatarUrl ? (
              <img
                alt={`Ảnh đại diện ${session.name}`}
                className="size-full object-cover"
                src={avatarUrl}
              />
            ) : (
              session.name.slice(0, 1)
            )}
          </span>
          <span className="hidden sm:block">
            <span className="block text-[12px] font-bold leading-3.5">
              {session.name}
            </span>
            <span className="block text-[9px] leading-3 text-slate-500">
              {roleLabels[role]}
            </span>
          </span>
          <ChevronDown className="hidden text-slate-400 sm:block" size={14} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="z-50 mt-2 w-56 rounded-xl border border-slate-100 bg-white p-2 shadow-2xl"
          sideOffset={4}
        >
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="truncate text-sm font-bold text-navy">
              {session.name}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{session.subtitle}</p>
          </div>
          <DropdownMenu.Item
            className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-600 outline-none hover:bg-[#fff0f0] hover:text-coral focus:bg-[#fff0f0] focus:text-coral"
            onSelect={openProfile}
          >
            <CircleUserRound size={17} />
            Hồ sơ cá nhân
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-600 outline-none hover:bg-[#fff0f0] hover:text-coral focus:bg-[#fff0f0] focus:text-coral"
            onSelect={logout}
          >
            <LogOut size={17} />
            Đăng xuất
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function DashboardShell({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const [sessionReady, setSessionReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<SessionUser | null>(null);
  const [featureQuery, setFeatureQuery] = useState("");
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      const activeSession = authService.getSession();
      if (!activeSession || activeSession.role !== role) {
        setSession(null);
        setSessionReady(false);
        router.replace(activeSession ? `/${activeSession.role}` : "/login");
        return;
      }
      setSession(activeSession);
      setSessionReady(true);
    };
    const storageChanged = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === "d4-session" ||
        event.key === "d4-access-token"
      )
        refresh();
    };
    refresh();
    window.addEventListener(SESSION_CHANGED_EVENT, refresh);
    window.addEventListener("storage", storageChanged);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", storageChanged);
    };
  }, [role, router]);

  useEffect(() => {
    const expired = () => router.replace("/login");
    window.addEventListener("d4-session-expired", expired);
    return () => window.removeEventListener("d4-session-expired", expired);
  }, [router]);

  if (!sessionReady || !session) {
    return (
      <main
        className="grid min-h-screen place-items-center bg-slate-50"
        aria-busy="true"
      >
        <div className="text-center">
          <div className="mx-auto size-9 animate-spin rounded-full border-4 border-slate-200 border-t-coral" />
          <p className="mt-3 text-sm font-semibold text-slate-500">
            Đang kiểm tra phiên đăng nhập...
          </p>
        </div>
      </main>
    );
  }

  const featureItems = navigation[role].filter((item) =>
    item.label
      .toLocaleLowerCase("vi")
      .includes(featureQuery.trim().toLocaleLowerCase("vi")),
  );
  const adminWorkspace =
    (role === "admin" &&
      pathname !== "/admin" &&
      navigation.admin.some((item) => item.href === pathname)) ||
    (role !== "customer" && pathname === `/${role}/notifications`) ||
    (role === "employee" &&
      pathname !== "/employee" &&
      pathname !== "/employee/profile" &&
      navigation.employee.some((item) => item.href === pathname));
  return (
    <SessionProvider value={session}>
      <div
        className={cn(
          "dashboard-shell dashboard-fixed h-dvh overflow-hidden bg-white",
          role === "admin" && pathname === "/admin" && "admin-overview-shell",
          adminWorkspace && "admin-workspace-shell",
          role === "admin" &&
            pathname === "/admin/branches" &&
            "admin-branches-shell",
          role === "customer" && "customer-shell",
          role === "customer" &&
            pathname === "/customer" &&
            "customer-home-fixed",
        )}
      >
        <a className="skip-link" href="#main-content">
          Bỏ qua điều hướng
        </a>
        {open && (
          <button
            aria-label="Đóng menu"
            className="dashboard-menu-backdrop fixed inset-0 z-30 bg-navy/30 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}
        <aside
          className={cn(
            "dashboard-sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-100 bg-white px-2 py-3 transition-transform",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between px-1">
            <Brand />
            <button
              aria-label="Đóng menu"
              className="dashboard-menu-close lg:hidden"
              onClick={() => setOpen(false)}
            >
              <X />
            </button>
          </div>
          <nav
            aria-label="Điều hướng chính"
            className="mt-4 flex-1 space-y-0.5 overflow-y-auto"
          >
            {navigation[role].map(({ label, href, icon: Icon }) => {
              const active =
                pathname === href ||
                (href !== `/${role}` && pathname.startsWith(`${href}/`));
              return (
                <Link
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2 py-2 text-[11px] font-semibold transition",
                    active
                      ? "bg-gradient-to-r from-[#f80820] to-[#ff586b] text-white shadow-md shadow-[#ffd9dd]"
                      : "text-slate-600 hover:bg-[#fff0f0] hover:text-coral",
                  )}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  key={href}
                >
                  <Icon className="shrink-0" size={16} />
                  {label}
                </Link>
              );
            })}
          </nav>
          {role === "customer" ? (
            <Link
              className="customer-sidebar-security mb-2 rounded-xl bg-blush p-3"
              href="/customer/profile"
              onClick={() => setOpen(false)}
            >
              <ShieldCheck className="text-coral" size={20} />
              <p className="mt-1.5 text-[11px] font-bold">
                An toàn cùng D4 Bank
              </p>
              <p className="mt-1 text-[9px] leading-3.5 text-slate-500">
                Giữ bí mật mật khẩu, PIN và mã OTP.
              </p>
            </Link>
          ) : (
            <div className="mb-2 rounded-xl bg-blush p-3">
              <ShieldCheck className="text-coral" size={20} />
              <p className="mt-1.5 text-[11px] font-bold">
                Dữ liệu được bảo vệ
              </p>
              <p className="mt-1 text-[9px] leading-3.5 text-slate-500">
                Giữ bí mật mật khẩu, PIN và mã OTP.
              </p>
            </div>
          )}
          <button
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-[11px] font-semibold text-slate-600 hover:bg-[#fff0f0] hover:text-coral"
            onClick={() => {
              authService.logout();
              router.push("/login");
            }}
          >
            <LogOut size={16} />
            Đăng xuất
          </button>
        </aside>
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-slate-100 bg-white/95 px-3 backdrop-blur md:px-4">
          <button
            aria-label="Mở menu"
            className="dashboard-menu-open grid size-8 place-items-center rounded-lg border lg:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu size={18} />
          </button>
          <nav className="hidden items-center gap-1.5 text-[12px] font-semibold lg:flex">
            {[
              ["Tổng quan", `/${role}`],
              ["Giới thiệu chúng tôi", `/${role}/about`],
              ["Tin tức", `/${role}/news`],
            ].map(([label, href]) => (
              <Link
                className={cn(
                  "rounded-lg px-3 py-1.5 transition",
                  pathname === href
                    ? "bg-[#fff0f0] text-coral"
                    : "hover:bg-slate-50 hover:text-coral",
                )}
                href={href}
                key={href}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div
              className={cn(
                "customer-feature-search",
                role !== "customer" && "hidden xl:block",
              )}
            >
              <label>
                <Search size={18} />
                <input
                  aria-label="Tìm tính năng"
                  placeholder="Tìm tính năng..."
                  value={featureQuery}
                  onChange={(event) => setFeatureQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setFeatureQuery("");
                  }}
                />
              </label>
              {featureQuery.trim() && (
                <div className="customer-search-results">
                  <p>Tính năng</p>
                  {featureItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setFeatureQuery("")}
                    >
                      {item.label}
                      <ArrowRight size={16} />
                    </Link>
                  ))}
                  {featureItems.length === 0 && (
                    <p>Không tìm thấy tính năng.</p>
                  )}
                </div>
              )}
            </div>
            <NotificationMenu role={role} sessionId={session.id} />
            <AccountMenu
              role={role}
              session={session}
              avatarUrl={null}
              openProfile={() => router.push(`/${role}/profile`)}
              logout={() => {
                authService.logout();
                router.push("/login");
              }}
            />
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="h-[calc(100dvh-3rem)] overflow-y-auto overflow-x-hidden p-2 md:p-3"
        >
          <div className="dashboard-page-fit min-h-0">{children}</div>
        </main>
      </div>
    </SessionProvider>
  );
}
