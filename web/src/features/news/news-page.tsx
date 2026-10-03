"use client";

import { ArrowRight, CalendarDays, Cpu, Gift, Landmark, Leaf, Smartphone, WalletCards } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

const categories = ["Tất cả", "Tin D4 Bank", "Sản phẩm & Dịch vụ", "Ngân hàng số", "Thị trường tài chính", "Công nghệ", "Khuyến mãi", "Trách nhiệm xã hội"];

const latestNews = [
  { title: "D4 Bank triển khai dịch vụ tư vấn tài chính cá nhân", description: "Dịch vụ mới giúp khách hàng xây dựng kế hoạch tài chính phù hợp với mục tiêu dài hạn, đảm bảo an toàn và hiệu quả.", date: "05/09/2024", category: "Tin D4 Bank", image: "/branch-head-office.png" },
  { title: "Ứng dụng AI trong phát hiện giao dịch bất thường", description: "D4 Bank tiếp tục đầu tư công nghệ AI nhằm nâng cao khả năng bảo mật và phòng chống gian lận trong giao dịch.", date: "03/09/2024", category: "Công nghệ", icon: Cpu },
  { title: "D4 Bank đồng hành cùng cộng đồng hướng đến phát triển bền vững", description: "Nhiều hoạt động an sinh xã hội được triển khai trong năm 2024, tập trung vào giáo dục, môi trường và hỗ trợ doanh nghiệp địa phương.", date: "28/08/2024", category: "Trách nhiệm xã hội", icon: Leaf },
  { title: "Giới thiệu thẻ tín dụng D4 Bank – Linh hoạt, nhiều ưu đãi", description: "Thẻ tín dụng mới với nhiều ưu đãi hoàn tiền và đặc quyền dành riêng cho khách hàng thân thiết.", date: "25/08/2024", category: "Sản phẩm & Dịch vụ", icon: WalletCards },
] as const;

const featured = [
  ["D4 Bank khai trương chi nhánh mới tại Đà Nẵng", "12/09/2024", "/branch-da-nang.png"],
  ["Ra mắt tính năng chuyển tiền bằng QR nâng cao", "10/09/2024", "/branch-head-office.png"],
  ["Ưu đãi đặc biệt dành cho khách hàng mới", "08/09/2024", "/branch-ho-chi-minh.png"],
  ["Ứng dụng AI trong phát hiện giao dịch bất thường", "03/09/2024", "/d4-headquarters.png"],
  ["D4 Bank đồng hành cùng cộng đồng", "28/08/2024", "/about-hero.png"],
] as const;

const categorySummary = [
  [Landmark, "Tin D4 Bank", 24], [Cpu, "Công nghệ", 14], [WalletCards, "Sản phẩm & Dịch vụ", 18],
  [Gift, "Khuyến mãi", 10], [Smartphone, "Ngân hàng số", 16], [Leaf, "Trách nhiệm xã hội", 8],
] as const;

function NewsThumb({ item }: { item: (typeof latestNews)[number] }) {
  if ("image" in item) return <div className="relative h-full w-full"><Image alt={item.title} className="object-cover" fill sizes="150px" src={item.image}/></div>;
  const Icon = item.icon;
  return <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[#071268] to-[#1675da] text-white"><Icon size={42}/></div>;
}

export function NewsPage() {
  const [activeCategory, setActiveCategory] = useState("Tất cả");
  const visibleNews = activeCategory === "Tất cả" ? latestNews : latestNews.filter((item) => item.category === activeCategory);

  return <div className="news-page-content flex flex-col gap-2.5 text-navy">
    <section className="relative h-40 overflow-hidden rounded-xl border border-red-100 bg-[#fff0f0] shadow-card"><Image alt="Cập nhật tin tức D4 Bank" className="object-fill" fill priority sizes="calc(100vw - 180px)" src="/news-hero.png"/></section>

    <nav className="grid grid-cols-4 gap-2 xl:grid-cols-8" aria-label="Danh mục tin tức">{categories.map((category) => <button className={activeCategory === category ? "rounded-lg bg-coral px-2 py-2 text-xs font-bold text-white shadow-card" : "rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-medium hover:border-coral hover:text-coral"} key={category} onClick={() => setActiveCategory(category)}>{category}</button>)}</nav>

    <section className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[1.7fr_.75fr]">
      <div className="grid min-h-0 gap-3 grid-rows-[1fr_1.35fr]">
        <div className="grid min-h-0 gap-3 md:grid-cols-[1.5fr_1fr]">
          <article className="group relative min-h-52 overflow-hidden rounded-xl shadow-card"><Image alt="D4 Bank khai trương chi nhánh mới tại Đà Nẵng" className="object-cover transition group-hover:scale-105" fill sizes="45vw" src="/d4-headquarters.png"/><div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"/><div className="absolute inset-x-0 bottom-0 p-4 text-white"><span className="rounded-full bg-coral px-3 py-1 text-[10px] font-bold">Tin nổi bật</span><h2 className="mt-2 text-xl font-black">D4 Bank khai trương chi nhánh mới tại Đà Nẵng</h2><div className="mt-2 flex items-end justify-between"><p className="max-w-xl text-xs leading-4 text-white/80">Tiếp tục mở rộng mạng lưới, mang đến dịch vụ tài chính hiện đại, thuận tiện và an toàn hơn cho khách hàng miền Trung.</p><button className="ml-3 flex shrink-0 items-center gap-2 rounded-full border border-white px-3 py-1.5 text-xs">Xem chi tiết <ArrowRight size={14}/></button></div></div></article>
          <div className="grid min-h-0 grid-rows-2 gap-3">{latestNews.slice(1,3).map((item) => <article className="card grid min-h-0 grid-cols-[105px_1fr] overflow-hidden" key={item.title}><NewsThumb item={item}/><div className="flex min-w-0 flex-col justify-center p-3"><span className="w-fit rounded-full bg-[#ffe9ec] px-2 py-1 text-[9px] font-bold text-coral">{item.category}</span><h3 className="mt-1.5 text-xs font-black leading-4">{item.title}</h3><p className="mt-2 flex items-center gap-1 text-[9px] text-slate-500"><CalendarDays size={11}/>{item.date}</p></div></article>)}</div>
        </div>

        <article className="card min-h-0 p-3"><div className="flex items-center justify-between border-b pb-2"><h2 className="text-base font-black">Tin tức mới nhất</h2><button className="flex items-center gap-1 text-xs font-bold text-coral">Xem tất cả <ArrowRight size={14}/></button></div><div className="divide-y">{visibleNews.map((item) => <div className="grid grid-cols-[105px_1fr_auto] items-center gap-3 py-1.5" key={item.title}><div className="h-12 overflow-hidden rounded-lg"><NewsThumb item={item}/></div><div className="min-w-0"><h3 className="truncate text-xs font-black">{item.title}</h3><p className="mt-1 truncate text-[10px] text-slate-500">{item.description}</p></div><div className="flex items-center gap-3"><span className="text-[9px] text-slate-500">{item.date}</span><span className="rounded-full bg-[#fff0f0] px-2 py-1 text-[9px] text-coral">{item.category}</span><button aria-label={`Xem ${item.title}`} className="grid size-7 place-items-center rounded-full border text-coral"><ArrowRight size={14}/></button></div></div>)}</div></article>
      </div>

      <aside className="grid min-h-0 gap-3 grid-rows-[1.55fr_.85fr]">
        <article className="card min-h-0 p-3"><h2 className="border-b pb-2 text-base font-black">Tin tức nổi bật</h2><div className="mt-1 grid h-[calc(100%-2rem)] grid-rows-5">{featured.map(([title,date,image], index) => <div className="grid grid-cols-[20px_72px_1fr] items-center gap-2" key={title}><span className="grid size-5 place-items-center rounded-full bg-coral text-[9px] font-bold text-white">{index + 1}</span><div className="relative h-10 overflow-hidden rounded-md"><Image alt={title} className="object-cover" fill sizes="72px" src={image}/></div><div className="min-w-0"><h3 className="line-clamp-2 text-[11px] font-black leading-4">{title}</h3><p className="mt-0.5 text-[9px] text-slate-500">{date}</p></div></div>)}</div></article>
        <article className="card min-h-0 p-3"><h2 className="border-b pb-2 text-base font-black">Danh mục tin tức</h2><div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">{categorySummary.map(([Icon,label,count], index) => <button className="flex items-center gap-2 text-left text-[10px]" key={label}><span className={`grid size-7 shrink-0 place-items-center rounded-full text-white ${index % 2 ? "bg-blue-400" : "bg-coral"}`}><Icon size={14}/></span><span className="flex-1">{label} ({count})</span><span>›</span></button>)}</div></article>
      </aside>
    </section>
  </div>;
}
