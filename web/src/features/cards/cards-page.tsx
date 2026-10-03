"use client";

import {
  BadgePlus,
  Ban,
  CreditCard,
  Ellipsis,
  Filter,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { useSessionUser } from "@/components/session-context";

type CardStatus = "Đang hoạt động" | "Tạm khóa" | "Tạm ngưng" | "Quá hạn";
type BankCard = {
  number: string;
  holder: string;
  identity: string;
  type: "Debit" | "Credit" | "Gold" | "Platinum";
  expiry: string;
  limit: string;
  status: CardStatus;
  issuedAt: string;
};

const bankCards: BankCard[] = [
  { number:"9704 12** **** 1234", holder:"Nguyễn Văn An", identity:"012345678901", type:"Debit", expiry:"12/2028", limit:"50,000,000", status:"Đang hoạt động", issuedAt:"12/09/2024" },
  { number:"9704 12** **** 5678", holder:"Trần Thị Bình", identity:"023456789012", type:"Credit", expiry:"08/2029", limit:"100,000,000", status:"Đang hoạt động", issuedAt:"15/09/2024" },
  { number:"9704 12** **** 9012", holder:"Lê Văn Cường", identity:"034567890123", type:"Debit", expiry:"05/2027", limit:"30,000,000", status:"Tạm khóa", issuedAt:"18/09/2024" },
  { number:"9704 12** **** 3456", holder:"Phạm Thị Dung", identity:"045678901234", type:"Credit", expiry:"11/2028", limit:"150,000,000", status:"Đang hoạt động", issuedAt:"20/09/2024" },
  { number:"9704 12** **** 7890", holder:"Hoàng Văn Em", identity:"056789012345", type:"Debit", expiry:"03/2026", limit:"20,000,000", status:"Đang hoạt động", issuedAt:"22/09/2024" },
  { number:"9704 12** **** 2468", holder:"Đỗ Thị Phương", identity:"067890123456", type:"Credit", expiry:"09/2028", limit:"120,000,000", status:"Quá hạn", issuedAt:"25/09/2024" },
  { number:"9704 12** **** 1357", holder:"Nguyễn Quang Huy", identity:"078901234567", type:"Gold", expiry:"04/2029", limit:"300,000,000", status:"Đang hoạt động", issuedAt:"27/09/2024" },
  { number:"9704 12** **** 8642", holder:"Vũ Thị Lan", identity:"089012345678", type:"Debit", expiry:"07/2027", limit:"40,000,000", status:"Tạm ngưng", issuedAt:"28/09/2024" },
  { number:"9704 12** **** 9753", holder:"Trần Đức Long", identity:"090123456789", type:"Platinum", expiry:"01/2030", limit:"500,000,000", status:"Đang hoạt động", issuedAt:"30/09/2024" },
  { number:"9704 12** **** 6420", holder:"Ngô Thị Mai", identity:"101234567890", type:"Debit", expiry:"10/2026", limit:"25,000,000", status:"Đang hoạt động", issuedAt:"02/10/2024" },
];

const typeTone: Record<BankCard["type"], string> = {
  Debit:"bg-rose-50 text-red-500", Credit:"bg-blue-50 text-blue-600", Gold:"bg-amber-50 text-amber-600", Platinum:"bg-violet-100 text-violet-600",
};
const statusTone: Record<CardStatus, string> = {
  "Đang hoạt động":"bg-emerald-50 text-emerald-600", "Tạm khóa":"bg-amber-50 text-orange-500", "Tạm ngưng":"bg-rose-50 text-red-500", "Quá hạn":"bg-red-50 text-red-500",
};

function CardHero() {
  return <section className="cards-hero relative overflow-hidden rounded-xl border border-red-100 bg-[#fff0f0]" aria-label="Quản lý thẻ D4 Bank">
    <Image alt="Quản lý thẻ D4 Bank" className="cards-hero-source absolute max-w-none" height={1024} priority src="/cards-admin-reference.png" width={1536}/>
  </section>;
}

export function CardsPage() {
  const {role}=useSessionUser();
  const [query,setQuery]=useState("");
  const [type,setType]=useState("");
  const [status,setStatus]=useState("");
  const [tab,setTab]=useState("Danh sách thẻ");
  const scopedCards=role==="employee"?bankCards.slice(0,5):bankCards;
  const data=useMemo(()=>scopedCards.filter(card=>(!query||Object.values(card).join(" ").toLowerCase().includes(query.toLowerCase()))&&(!type||card.type===type)&&(!status||card.status===status)),[query,type,status,role]);
  const kpis:Array<[typeof CreditCard,string,string,string]>=role==="employee"?[[CreditCard,"Thẻ tại chi nhánh","4,860","6.2%"],[BadgePlus,"Yêu cầu phát hành","18","Hôm nay"],[ShieldCheck,"Thẻ đang hoạt động","4,720","97.1%"],[Ban,"Yêu cầu khóa/mở","12","Cần xử lý"]]:[[CreditCard,"Tổng số thẻ","25,680","8.5%"],[BadgePlus,"Thẻ mới phát hành","2,430","12.3%"],[ShieldCheck,"Thẻ đang hoạt động","21,340","7.8%"],[Ban,"Thẻ bị khóa/tạm ngưng","410","15.4%"]];

  return <div className="customers-page-content flex flex-col gap-2.5 text-navy">
    <CardHero/>
    <section className="grid grid-cols-4 gap-3">{kpis.map(([Icon,label,value,change],index)=><article className="card flex items-center gap-3 p-3" key={label}><span className="grid size-11 place-items-center rounded-full bg-[#ffe9ec] text-coral"><Icon size={21}/></span><div><p className="text-xs">{label}</p><b className="text-2xl">{value}</b><small className={`block text-[9px] ${index===3?"text-red-500":"text-emerald-500"}`}>↑ &nbsp;{change} &nbsp;<span className="text-blue-700">so với tháng trước</span></small></div></article>)}</section>
    <section className="card flex h-12 justify-between px-3"><div className="flex h-full gap-4">{(role==="employee"?["Danh sách thẻ","Quản lý phát hành thẻ","Thống kê"]:["Danh sách thẻ","Quản lý phát hành thẻ","Thống kê","Lịch sử thay đổi"]).map(item=><button className={tab===item?"border-b-2 border-coral px-2 text-xs font-semibold text-coral":"px-2 text-xs"} onClick={()=>setTab(item)} key={item}>{item}</button>)}</div><button className="btn-primary h-8"><Plus size={14}/>{role==="employee"?"Yêu cầu phát hành thẻ":"Phát hành thẻ mới"}</button></section>
    {tab!=="Danh sách thẻ"?<section className="card flex-1 p-5"><h2 className="text-lg font-black">{tab}</h2><p className="mt-2 text-sm text-slate-500">Dữ liệu mô phỏng cho phân hệ quản lý thẻ D4 Bank.</p></section>:<section className="grid min-h-0 flex-1 grid-cols-[1.9fr_.7fr] gap-3">
      <article className="card flex min-h-0 flex-col p-3"><div className="grid grid-cols-[1.7fr_.65fr_.65fr_.65fr_.3fr] gap-2"><label className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={15}/><input aria-label="Tìm kiếm thẻ" className="h-9 w-full rounded-lg border pl-9 text-[10px]" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Tìm kiếm theo số thẻ, tên khách hàng, CMND/CCCD..."/></label><select aria-label="Loại thẻ" className="rounded-lg border px-2 text-[10px]" value={type} onChange={event=>setType(event.target.value)}><option value="">Tất cả loại thẻ</option>{["Debit","Credit","Gold","Platinum"].map(item=><option key={item}>{item}</option>)}</select><button className="rounded-lg border px-2 text-left text-[10px]">Tất cả chi nhánh⌄</button><select aria-label="Trạng thái thẻ" className="rounded-lg border px-2 text-[10px]" value={status} onChange={event=>setStatus(event.target.value)}><option value="">Tất cả trạng thái</option>{Object.keys(statusTone).map(item=><option key={item}>{item}</option>)}</select><button className="rounded-lg border border-coral text-[10px] text-coral"><Filter className="inline" size={13}/> Lọc</button></div>
        <div className="mt-2 min-h-0 overflow-auto"><table className="w-full table-fixed text-left text-[10px]"><thead className="bg-slate-50"><tr>{["Số thẻ","Họ và tên","CMND/CCCD","Loại thẻ","Hạn thẻ","Hạn mức (VNĐ)","Trạng thái","Ngày phát hành","Thao tác"].map(item=><th className="p-2 font-medium" key={item}>{item}</th>)}</tr></thead><tbody>{data.map((card,index)=><tr className="border-t" key={card.number}><td className="p-1.5 font-semibold"><span className="mr-1 inline-grid size-7 place-items-center rounded-full bg-[#fff0f0] text-coral"><UserRound size={14}/></span>{card.number}</td><td className="p-1.5">{card.holder}</td><td className="p-1.5">{card.identity}</td><td className="p-1.5"><span className={`inline-block min-w-14 rounded px-2 py-1 text-center ${typeTone[card.type]}`}>{card.type}</span></td><td className="p-1.5">{card.expiry}</td><td className="p-1.5">{card.limit}</td><td className="p-1.5"><span className={`inline-block min-w-24 rounded px-2 py-1 text-center ${statusTone[card.status]}`}>{card.status}</span></td><td className="p-1.5">{card.issuedAt}</td><td className="p-1.5 text-center"><button aria-label={`Thao tác với thẻ ${index+1}`}><Ellipsis size={16}/></button></td></tr>)}</tbody></table></div>
        <p className="mt-auto border-t pt-2 text-[10px] text-slate-500">Hiển thị 1 - {data.length} của 25,680 thẻ <span className="float-right font-semibold text-navy">‹ &nbsp; [ 1 ] &nbsp; 2 &nbsp; 3 &nbsp; 4 &nbsp; 5 &nbsp; … &nbsp; 2,568 &nbsp; › &nbsp; 10 / trang⌄</span></p>
      </article>
      <aside className="grid min-h-0 grid-rows-[1.1fr_.95fr_1.15fr] gap-3"><article className="card p-3"><h2 className="text-base font-black">Cơ cấu thẻ theo loại</h2><div className="flex items-center gap-4 pt-2"><div className="grid size-28 shrink-0 place-items-center rounded-full" style={{background:"conic-gradient(#f5223e 0 60%,#ff8f9d 60% 85%,#ffb42c 85% 95%,#2764df 95% 100%)"}}><div className="grid size-16 place-items-center rounded-full bg-white text-center"><b className="text-xl">25,680</b><span className="text-[9px]">thẻ</span></div></div><div className="space-y-2 text-[10px]">{[["bg-red-500","Debit","60% (15,408)"],["bg-rose-300","Credit","25% (6,420)"],["bg-amber-400","Gold","10% (2,568)"],["bg-blue-600","Platinum","5% (1,284)"]].map(([color,label,value])=><p className="flex items-center gap-2" key={label}><i className={`size-2.5 rounded-full ${color}`}/><span className="w-12">{label}</span><b>{value}</b></p>)}</div></div></article>
        <article className="card p-3"><h2 className="text-base font-black">Thẻ theo trạng thái</h2><div className="mt-3 space-y-2 text-[10px]">{[["Đang hoạt động","83% (21,340)",83,"bg-emerald-500"],["Tạm khóa","5% (1,283)",18,"bg-amber-400"],["Tạm ngưng","3% (770)",8,"bg-rose-300"],["Quá hạn","1% (410)",4,"bg-red-500"],["Khác","8% (1,877)",28,"bg-slate-400"]].map(([label,value,width,color])=><div className="grid grid-cols-[95px_1fr_72px] items-center gap-2" key={String(label)}><span>{label}</span><span className="h-3 overflow-hidden rounded bg-slate-100"><i className={`block h-full rounded ${color}`} style={{width:`${width}%`}}/></span><span>{value}</span></div>)}</div></article>
        <article className="card flex min-h-0 flex-col p-3"><div className="flex items-center justify-between"><h2 className="text-base font-black">Thẻ mới phát hành gần đây</h2><button className="text-[10px] text-coral">Xem tất cả →</button></div><div className="mt-2 space-y-2">{bankCards.slice(0,4).map(card=><div className="flex items-center gap-2 text-[10px]" key={card.number}><span className="grid size-8 place-items-center rounded-full bg-[#fff0f0] text-coral"><UserRound size={15}/></span><p className="min-w-0 flex-1"><b className="block truncate">{card.holder}</b><span className="text-slate-500">{card.type} - **** {card.number.slice(-4)}</span></p><time className="text-slate-500">{card.issuedAt}</time></div>)}</div></article></aside>
    </section>}
  </div>;
}
