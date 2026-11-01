"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, Eye, Gauge, Handshake, Lightbulb, MapPin, Repeat2, Rocket, ShieldCheck, Target, Users, WalletCards } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { bankService } from "@/services/bank.service";
import "./about-page.css";

const highlights = [
  [ShieldCheck, "An toàn", "Bảo mật dữ liệu khách hàng là ưu tiên hàng đầu"],
  [Rocket, "Nhanh chóng", "Trải nghiệm dịch vụ đơn giản, tiện lợi"],
  [Users, "Khách hàng là trọng tâm", "Luôn đồng hành và mang lại giá trị tốt nhất"],
  [Lightbulb, "Đổi mới", "Ứng dụng công nghệ dữ liệu và AI để phát triển bền vững"],
] as const;

const values = [
  [ShieldCheck, "Chính trực", "Minh bạch và trách nhiệm"],
  [Lightbulb, "Sáng tạo", "Không ngừng đổi mới"],
  [Handshake, "Hợp tác", "Cùng phát triển bền vững"],
  [Gauge, "Hiệu quả", "Tối ưu giá trị cho khách hàng"],
] as const;

const journey = [
  ["2021", "Thành lập D4 Bank"],
  ["2022", "Triển khai ngân hàng số toàn diện"],
  ["2023", "Mở rộng chi nhánh tại Hà Nội, Đà Nẵng"],
  ["2024", "Ứng dụng AI trong quản trị rủi ro"],
  ["2025", "Hướng tới ngân hàng số hàng đầu Việt Nam"],
] as const;

function BankBuilding({ compact = false, src = "/d4-headquarters.png", name = "Trụ sở D4 Bank" }: { compact?: boolean; src?: string; name?: string }) {
  return <div className={compact ? "relative h-12 w-20 shrink-0 overflow-hidden rounded-md border border-slate-100 bg-slate-100" : "relative h-full min-h-36 w-full overflow-hidden rounded-xl border border-slate-100 bg-slate-100 shadow-card"}>
    <Image alt={name} className="object-cover" fill priority={!compact} sizes={compact ? "80px" : "(min-width: 1280px) 32vw, 45vw"} src={src}/>
  </div>;
}

export function AboutPage({ role }: { role: "admin" | "employee" | "customer" }) {
  const summary = useQuery({
    queryKey: ["admin-overview", role],
    queryFn: bankService.adminOverview,
    enabled: role !== "customer",
    refetchInterval: 30_000,
  });
  const branches = useQuery({
    queryKey: ["about-branches", role],
    queryFn: () => bankService.branches({ page: 1, pageSize: 2 }),
    enabled: role === "admin",
  });
  const format = (value: number | undefined) => value == null ? "—" : value.toLocaleString("vi-VN");
  const stats = role === "customer" ? [
    [Users, "Đồng hành", "Khách hàng là trọng tâm"],
    [Building2, "Kết nối", "Hỗ trợ tại chi nhánh"],
    [WalletCards, "Thuận tiện", "Quản lý tài khoản"],
    [Repeat2, "Minh bạch", "Theo dõi giao dịch"],
  ] as const : [
    [Users, format(summary.data?.kpis.find(item => item.key === "customers")?.value), "Khách hàng"],
    [Building2, format(summary.data?.branches.length), role === "employee" ? "Chi nhánh trong phạm vi" : "Chi nhánh"],
    [WalletCards, format(summary.data?.activeAccounts), "Tài khoản đang hoạt động"],
    [Repeat2, format(summary.data?.kpis.find(item => item.key === "transactions")?.currentPeriod), "Giao dịch tháng này"],
  ] as const;
  return <div className="about-page-content flex flex-col gap-2.5 text-navy">
    <section className="about-hero relative w-full shrink-0 overflow-hidden rounded-xl border border-red-100 bg-[#fff0f0] shadow-card"><div className="about-hero-copy"><p>D4 BANK</p><h1>Giới thiệu chúng tôi</h1><span>Data for a brighter tomorrow</span></div><div className="about-hero-art"><Image alt="" className="object-contain" fill priority sizes="(min-width: 1100px) 600px, 50vw" src="/about-hero.png"/></div></section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{highlights.map(([Icon,title,description]) => <article className="card flex items-center gap-4 p-3" key={title}><span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#ffe9ec] text-coral"><Icon size={21}/></span><div><h2 className="text-sm font-black">{title}</h2><p className="mt-1 text-xs leading-4 text-slate-500">{description}</p></div></article>)}</section>

    <section className="about-main-section grid flex-1 items-stretch gap-3 xl:grid-cols-[2fr_1fr]">
      <article className="card p-3"><div className="grid items-stretch gap-4 md:grid-cols-[1.2fr_.9fr]"><div><h2 className="text-lg font-black">Về D4 Bank</h2><span className="mt-1.5 block h-0.5 w-12 bg-coral"/><p className="mt-3 text-sm leading-5 text-slate-600">D4 Bank là ngân hàng số thế hệ mới, tiên phong ứng dụng công nghệ dữ liệu và trí tuệ nhân tạo để mang đến các sản phẩm, dịch vụ tài chính an toàn, hiệu quả, hiện đại. Chúng tôi cam kết đồng hành cùng khách hàng, doanh nghiệp và cộng đồng trong hành trình kiến tạo một tương lai tài chính bền vững.</p><a className="mt-2 inline-flex items-center gap-3 rounded-lg border border-coral px-5 py-1.5 text-sm font-bold text-coral transition hover:bg-coral hover:text-white" href="#mission">Xem sứ mệnh<ArrowRight size={16}/></a></div><BankBuilding/></div>
        <div className="about-statistics mt-3 grid gap-2 rounded-xl bg-[#fff0f0] p-2.5 sm:grid-cols-2 lg:grid-cols-4" aria-busy={role !== "customer" && summary.isFetching}>{stats.map(([Icon,value,label]) => <div className="flex items-center gap-3" key={label}><span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-coral"><Icon size={18}/></span><div><b className="text-base font-black">{value}</b><p className="text-[9px] text-slate-500">{label}</p></div></div>)}</div>
        {role !== "customer" && <p className="about-data-note" role={summary.isError ? "alert" : "status"}>{summary.isError ? <>Không tải được số liệu. <button type="button" onClick={() => summary.refetch()}>Thử lại</button></> : summary.isPending ? "Đang tải số liệu…" : role === "employee" ? "Số liệu trong phạm vi chi nhánh được phân quyền." : "Số liệu hiện tại của hệ thống D4 Bank."}</p>}
      </article>
      <article className="card scroll-mt-20 p-3" id="mission"><h2 className="text-lg font-black">Sứ mệnh &amp; Tầm nhìn</h2><span className="mt-1.5 block h-0.5 w-12 bg-coral"/><div className="mt-2 space-y-2"><div className="rounded-xl bg-gradient-to-r from-[#fff0f0] to-white p-3"><div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-coral"><Target size={20}/></span><div><h3 className="font-black text-coral">Sứ mệnh</h3><p className="mt-1 text-xs leading-4 text-slate-500">Cung cấp các giải pháp tài chính an toàn, thuận tiện và sáng tạo, giúp mọi người tiếp cận dịch vụ ngân hàng dễ dàng hơn.</p></div></div></div><div className="rounded-xl bg-gradient-to-r from-[#fff0f0] to-white p-3"><div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-coral"><Eye size={20}/></span><div><h3 className="font-black text-coral">Tầm nhìn</h3><p className="mt-1 text-xs leading-4 text-slate-500">Trở thành ngân hàng số hàng đầu được tin cậy tại Việt Nam, tiên phong ứng dụng dữ liệu và AI.</p></div></div></div></div></article>
    </section>

    <section className="grid items-stretch gap-3 xl:grid-cols-3">
      <article className="card flex h-full min-h-40 flex-col p-3"><h2 className="text-base font-black">Giá trị cốt lõi</h2><div className="mt-2 grid flex-1 grid-cols-2 items-center gap-3 sm:grid-cols-4">{values.map(([Icon,title,description]) => <div className="text-center" key={title}><span className="mx-auto grid size-10 place-items-center rounded-full bg-[#ffe9ec] text-coral"><Icon size={19}/></span><h3 className="mt-1.5 text-xs font-black">{title}</h3><p className="mt-1 text-[9px] leading-3 text-slate-500">{description}</p></div>)}</div></article>
      <article className="card flex h-full min-h-40 flex-col p-3"><h2 className="text-base font-black">Hành trình phát triển</h2><p className="about-data-note">Các cột mốc minh họa cho dự án mô phỏng.</p><div className="relative mt-2 flex flex-1 flex-col justify-evenly before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-coral">{journey.map(([year,event]) => <div className="relative grid grid-cols-[18px_52px_1fr] items-center gap-2 text-[11px]" key={year}><span className="z-10 size-3 rounded-full bg-coral"/><b className="text-coral">{year}</b><span className="text-slate-500">{event}</span></div>)}</div></article>
      <article className="card about-branch-card flex h-full min-h-40 flex-col p-3"><div className="flex items-center justify-between gap-2"><h2 className="text-base font-black">Hệ thống chi nhánh</h2>{role === "admin" && <Link className="shrink-0 text-xs font-bold text-coral" href="/admin/branches">Xem tất cả →</Link>}</div>
        {role === "admin" ? <div className="about-branch-list mt-2 grid flex-1 divide-y">
          {branches.isPending && <p className="about-data-note" role="status">Đang tải chi nhánh…</p>}
          {branches.isError && <p className="about-data-note" role="alert">Không tải được chi nhánh. <button type="button" onClick={() => branches.refetch()}>Thử lại</button></p>}
          {branches.data?.items.map(branch => { const name = String(branch.branchname ?? "Chi nhánh"), address = String(branch.address ?? "Chưa cập nhật địa chỉ"), city = String(branch.city ?? ""); return <div className="flex items-center gap-3 py-2" key={String(branch.branchid)}><BankBuilding compact name={`Hình minh họa ${name}`}/><div className="min-w-0"><h3 className="text-xs font-black">{name}</h3><p className="mt-1 flex items-start gap-1 text-[10px] text-slate-500"><MapPin className="mt-0.5 shrink-0" size={12}/><span>{address}{city && !address.includes(city) ? `, ${city}` : ""}</span></p></div></div>; })}
          {branches.data?.items.length === 0 && <p className="about-data-note">Chưa có chi nhánh.</p>}
        </div> : <div className="about-contact-info"><Building2 size={32} aria-hidden="true"/><h3>Đồng hành tại chi nhánh</h3><p>Liên hệ nhân viên D4 Bank để được hướng dẫn về tài khoản, giao dịch và các dịch vụ phù hợp.</p><Link href={`/${role}/profile`}>Thông tin liên hệ của bạn <ArrowRight size={14}/></Link></div>}
      </article>
    </section>
  </div>;
}
