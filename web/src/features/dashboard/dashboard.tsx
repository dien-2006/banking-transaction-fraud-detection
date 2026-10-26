"use client";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, CreditCard, HandCoins, Landmark, ShieldAlert, Users, WalletCards } from "lucide-react";
import Link from "next/link";
import { DataTable, StatCard, StatusBadge } from "@/components/ui";
import { bankService } from "@/services/bank.service";
import { money } from "@/lib/utils";
import type { Role } from "@/types";
import { TrendChart } from "./trend-chart";
import { useSessionUser } from "@/components/session-context";
import { AdminOverview } from "./admin-overview";

const icons = [Users, WalletCards, Activity, ShieldAlert];
export function Dashboard({ role }: { role: Role }) {
  return role === "admin" ? <AdminOverview/> : <DataDashboard role={role}/>;
}

function DataDashboard({ role }: { role: Role }) {
  const session=useSessionUser();
  const { data, isLoading } = useQuery({ queryKey: ["dashboard", role], queryFn: () => bankService.dashboard(role) });
  if (isLoading || !data) return <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">{[1,2,3,4].map((x) => <div className="h-36 animate-pulse rounded-2xl bg-white" key={x} />)}</div>;
  const rows = data.transactions.slice(0, 5).map((x) => [x.id, x.customer, x.type, money.format(x.amount), x.time, x.status]);
  return <div className="space-y-4"><section className="relative overflow-hidden rounded-xl border border-red-50 d4-banner p-6 shadow-card md:p-7"><div className="d4-city" /><div className="relative flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-bold text-coral">D4 BANK • NGÂN HÀNG SỐ</p><h1 className="mt-2 text-3xl font-black text-navy md:text-4xl">{role === "customer" ? `Xin chào, ${session.name}!` : role === "employee" ? "Trung tâm vận hành" : "Tổng quan hệ thống"}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{role === "customer" ? "Quản lý tài chính của bạn thuận tiện và an toàn ở một nơi." : "Theo dõi hiệu suất, giao dịch và cảnh báo rủi ro theo dữ liệu hệ thống."}</p></div><Link className="btn-primary" href={role === "customer" ? "/customer/transfer" : `/${role}/transactions`}>{role === "customer" ? "Chuyển tiền ngay" : "Xem giao dịch"}<ArrowRight size={17} /></Link></div></section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.stats.map((item, i) => <StatCard icon={icons[i]} item={item} key={item.label} />)}</section>
    {role === "customer" && <section className="grid gap-4 sm:grid-cols-3">{[[ArrowUpRight,"Chuyển tiền","Gửi tiền nhanh 24/7","/customer/transfer"],[ArrowDownLeft,"Nhận tiền","Xem số tài khoản","/customer/accounts"],[CreditCard,"Quản lý thẻ","Khóa và mở khóa thẻ","/customer/cards"]].map(([Icon,title,desc,href]) => { const C = Icon as typeof ArrowRight; return <Link className="card flex items-center gap-4 p-5 transition hover:-translate-y-1" href={href as string} key={title as string}><span className="grid size-12 place-items-center rounded-xl bg-[#fff0f0] text-coral"><C /></span><span><b>{title as string}</b><small className="mt-1 block text-slate-500">{desc as string}</small></span></Link>; })}</section>}
    <section className="grid gap-6 xl:grid-cols-[1.45fr_.75fr]"><article className="card p-5"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-black">Giá trị giao dịch gần đây</h2><p className="text-sm text-slate-500">Dữ liệu trực tiếp từ các giao dịch mới nhất</p></div></div><TrendChart transactions={data.transactions} /></article><article className="card p-5"><h2 className="text-lg font-black">Hoạt động gần đây</h2><div className="mt-5 space-y-5">{data.transactions.slice(0,4).map((x) => <div className="flex items-start gap-3" key={x.id}><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><HandCoins size={18} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{x.customer}</p><p className="mt-1 text-xs text-slate-500">{x.type} • {x.time.split(" ")[1]}</p></div><StatusBadge value={x.status} /></div>)}</div></article></section>
    <section><div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-black">Giao dịch gần đây</h2><p className="text-sm text-slate-500">Danh sách giao dịch mới nhất trên hệ thống</p></div><Link className="text-sm font-bold text-coral" href={`/${role}/transactions`}>Xem tất cả</Link></div><DataTable headers={["Mã GD","Khách hàng","Loại","Số tiền","Thời gian","Trạng thái"]} rows={rows} searchable={false} /></section>
  </div>;
}
