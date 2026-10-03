"use client";

import { ArrowLeftRight, HandCoins, ShieldAlert, Users, WalletCards } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/components/ui";
import { useSessionUser } from "@/components/session-context";
import { money } from "@/lib/utils";
import type { RiskDecision } from "@/types";

const kpis = [
  ["Tổng khách hàng", "12.430", "5,2%", Users, "red"],
  ["Tổng tài khoản", "18.250", "3,1%", WalletCards, "red"],
  ["Tổng giao dịch", "125.430", "12,6%", ArrowLeftRight, "red"],
  ["Tổng khoản vay", "3.560", "2,4%", HandCoins, "orange"],
  ["Giao dịch rủi ro", "128", "18,5%", ShieldAlert, "red"],
] as const;

interface RiskRow {
  transactionId: string;
  reviewId?: string;
  customer: string;
  amount: number;
  ruleScore: number;
  modelProbability: number;
  time: string;
  decision: RiskDecision;
}

const recentRisks: RiskRow[] = [
  { transactionId: "TRX001256", customer: "Nguyễn Văn A", amount: 48_000_000, ruleScore: 92, modelProbability: 0.74, time: "02:34", decision: "BLOCK" },
  { transactionId: "TRX001255", customer: "Trần Thị B", amount: 100_000_000, ruleScore: 88, modelProbability: 0.91, time: "11:20", decision: "BLOCK" },
  { transactionId: "TRX001254", customer: "Lê Văn C", amount: 30_000_000, ruleScore: 85, modelProbability: 0.82, time: "14:15", decision: "BLOCK" },
  { transactionId: "TRX001253", customer: "Phạm Thị D", amount: 20_000_000, ruleScore: 78, modelProbability: 0.66, time: "09:40", decision: "REVIEW" },
  { transactionId: "TRX001252", customer: "Hoàng Văn E", amount: 150_000_000, ruleScore: 75, modelProbability: 0.71, time: "22:18", decision: "REVIEW" },
];

const pendingReviews: RiskRow[] = [
  { transactionId: "TRX001253", reviewId: "RVW000123", customer: "Phạm Thị D", amount: 20_000_000, ruleScore: 78, modelProbability: 0.66, time: "09:40", decision: "REVIEW" },
  { transactionId: "TRX001252", reviewId: "RVW000122", customer: "Hoàng Văn E", amount: 150_000_000, ruleScore: 75, modelProbability: 0.71, time: "22:18", decision: "REVIEW" },
  { transactionId: "TRX001249", reviewId: "RVW000121", customer: "Đặng Thu Mai", amount: 62_000_000, ruleScore: 72, modelProbability: 0.58, time: "21:05", decision: "REVIEW" },
  { transactionId: "TRX001247", reviewId: "RVW000120", customer: "Đỗ Minh Khang", amount: 27_500_000, ruleScore: 68, modelProbability: 0.64, time: "18:42", decision: "REVIEW" },
  { transactionId: "TRX001244", reviewId: "RVW000119", customer: "Vũ Hải Yến", amount: 84_000_000, ruleScore: 64, modelProbability: 0.61, time: "16:27", decision: "REVIEW" },
];

const decisionTone: Record<RiskDecision, string> = {
  ALLOW: "bg-[#eafaf2] text-[#128653]",
  REVIEW: "bg-[#fff2dc] text-[#c66b00]",
  BLOCK: "bg-[#ffe5e8] text-[#d90018]",
};

function Heading({ children, href }: { children: React.ReactNode; href?: string }) {
  return <div className="mb-1 flex items-center justify-between gap-3"><h2 className="truncate text-[14px] font-extrabold text-[#000064]">{children}</h2>{href && <Link className="shrink-0 text-[11px] font-semibold text-[#f80820] hover:underline" href={href}>Xem tất cả&nbsp; →</Link>}</div>;
}

function LineChart() {
  const points = [[4,108],[56,85],[108,76],[160,82],[212,58],[264,64],[316,43],[368,52],[420,29],[456,35],[488,12]];
  const polyline = points.map(([x,y]) => `${x},${y}`).join(" ");
  return <div className="relative h-[82px] pl-9 pt-2 text-[10px] text-[#17418d]"><div className="absolute inset-x-10 bottom-6 top-3 flex flex-col justify-between">{["2.000","1.000","0"].map(x=><div className="relative border-t border-[#e2e7f1]" key={x}><span className="absolute -left-10 -top-2">{x}</span></div>)}</div><svg aria-label="Số lượng giao dịch tăng trong tháng 9" className="absolute inset-x-10 bottom-6 h-[76px] w-[calc(100%-3.25rem)] overflow-visible" preserveAspectRatio="none" role="img" viewBox="0 0 500 135"><defs><linearGradient id="transaction-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f80820" stopOpacity=".18"/><stop offset="1" stopColor="#f80820" stopOpacity=".02"/></linearGradient></defs><path d={`M${polyline} L488 135 L4 135Z`} fill="url(#transaction-area)"/><polyline points={polyline} fill="none" stroke="#f80820" strokeWidth="3"/>{points.map(([x,y])=><circle cx={x} cy={y} fill="#f80820" r="4" key={`${x}-${y}`}/>)}</svg><div className="absolute inset-x-10 bottom-0 flex justify-between">{["01/09","04/09","07/09","10/09","13/09","16/09","19/09","22/09","25/09","28/09"].map(x=><span key={x}>{x}</span>)}</div></div>;
}

function Donut() {
  const items=[["Chuyển tiền","45%","#f80820"],["Thanh toán","30%","#ff7585"],["Nạp tiền","15%","#ffb54a"],["Rút tiền","7%","#ff8a00"],["Khác","3%","#ffc1c8"]];
  return <div className="flex h-[82px] items-center justify-center gap-6"><div aria-label="125.430 giao dịch" className="grid size-[76px] shrink-0 place-items-center rounded-full bg-[conic-gradient(#f80820_0_45%,#ff7585_45%_75%,#ffb54a_75%_90%,#ff8a00_90%_97%,#ffc1c8_97%)]"><div className="grid size-[48px] place-items-center rounded-full bg-white text-center"><span><b className="block text-[14px]">125.430</b><small className="text-[9px]">giao dịch</small></span></div></div><div className="w-32 space-y-0.5 text-[10px] leading-3">{items.map(([name,value,color])=><div className="flex items-center gap-2" key={name}><span className="size-2.5 rounded-full" style={{background:color}}/><span>{name}</span><b className="ml-auto font-medium">{value}</b></div>)}</div></div>;
}

function Bars() {
  const bars=[[82,"Thành công","82.430","#ff5266"],[28,"Đang xử lý","4.280","#ffabb4"],[43,"Cần duyệt","8.120","#ffad42"],[25,"Thất bại","3.950","#f80820"],[12,"Bị từ chối","1.280","#ff717f"]] as const;
  return <div className="relative flex h-[82px] items-end justify-around border-b border-l border-[#dbe2ed] px-3 pb-5 before:absolute before:inset-x-0 before:top-1/4 before:border-t before:border-[#e7ebf2] after:absolute after:inset-x-0 after:top-1/2 after:border-t after:border-[#e7ebf2]">{bars.map(([height,label,value,color])=><div className="relative z-10 flex h-full w-12 flex-col items-center justify-end" key={label}><span className="mb-0.5 text-[8px] font-semibold">{value}</span><div className="w-8 rounded-t-sm" style={{height:`${height}%`,background:color}}/><span className="absolute -bottom-5 whitespace-nowrap text-[9px]">{label}</span></div>)}</div>;
}

function RiskTable({ rows, review = false, onView }: { rows: RiskRow[]; review?: boolean; onView: (row: RiskRow) => void }) {
  const headers = review
    ? ["Mã review","Mã giao dịch","Khách hàng","Số tiền","RuleScore","ML","Thời gian","Thao tác"]
    : ["Mã giao dịch","Khách hàng","Số tiền","RuleScore","ML","Decision","Thao tác"];
  return <div className="overflow-hidden"><table className="w-full table-fixed text-left text-[10px]"><thead className="bg-[#f4f6fa] text-[#17418d]"><tr>{headers.map(x=><th className="truncate px-1.5 py-0.5 font-semibold" title={x} key={x}>{x}</th>)}</tr></thead><tbody className="divide-y divide-[#edf0f5]">{rows.map(row=><tr key={row.reviewId ?? row.transactionId}>{review && <td className="truncate px-1.5 py-0.5">{row.reviewId}</td>}<td className="truncate px-1.5 py-0.5">{row.transactionId}</td><td className="truncate px-1.5 py-0.5" title={row.customer}>{row.customer}</td><td className="truncate px-1.5 py-0.5">{money.format(row.amount)}</td><td className="px-1.5 py-0.5"><b className="rounded-md bg-[#ffe5e8] px-1.5 text-[#f80820]">{row.ruleScore}</b></td><td className="px-1.5 py-0.5">{Math.round(row.modelProbability*100)}%</td>{review ? <td className="px-1.5 py-0.5">{row.time}</td> : <td className="px-1.5 py-0.5"><span className={`rounded-md px-1.5 font-semibold ${decisionTone[row.decision]}`}>{row.decision}</span></td>}<td className="px-1.5 py-0.5"><button className="rounded-md bg-[#fff0f0] px-3 py-0.5 font-medium text-[#f80820] hover:bg-[#ffe0e4]" onClick={()=>onView(row)}>Xem</button></td></tr>)}</tbody></table></div>;
}

export function AdminOverview({ role = "admin" }: { role?: "admin" | "employee" }) {
  const [selected, setSelected] = useState<RiskRow | null>(null);
  const { name: adminName } = useSessionUser();
  return <div className="admin-overview-fit space-y-2 text-[#000064]">
    <section className="grid gap-3 lg:grid-cols-[2.15fr_1fr]"><article className="d4-banner relative min-h-[70px] overflow-hidden rounded-xl border border-[#ffe3e7] px-3 py-1.5"><div className="d4-city"/><div className="relative"><p className="text-[13px] text-[#f80820]">Chào mừng trở lại,</p><h1 className="text-[24px] font-black leading-none text-[#f80820]">{adminName}!</h1><p className="mt-0.5 text-[10px]">{role==="employee"?"Cùng D4 Bank vận hành chi nhánh an toàn – chính xác – hiệu quả.":"Cùng D4 Bank quản trị hệ thống an toàn – hiệu quả – bền vững."}</p></div><p className="absolute right-5 top-1 hidden rotate-[-8deg] text-center text-[10px] font-bold italic leading-4 text-[#f80820] md:block">Dữ liệu hôm nay<br/>Tạo nên một ngân hàng<br/>thông minh hơn ngày mai!</p></article><article className="d4-banner relative min-h-[70px] overflow-hidden rounded-xl border border-[#ffe3e7] px-2.5 py-1.5"><div className="d4-city"/><div className="relative mt-1 inline-block rounded-xl bg-white/90 px-2.5 py-1.5"><h2 className="text-[12px] font-black text-[#f80820]">{role==="employee"?"Vận hành trong phạm vi chi nhánh":"Kiểm soát toàn hệ thống"}</h2><p className="mt-0.5 text-[10px]">Bảo mật – Ổn định – Phát triển</p></div></article></section>
    <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{kpis.map(([label,value,change,Icon,tone])=><article className="card flex min-h-[60px] min-w-0 items-center gap-2 p-2.5" key={label}><span className={`grid size-8 shrink-0 place-items-center rounded-full ${tone==="orange"?"bg-[#fff1da] text-[#f59e0b]":"bg-[#ffe7e9] text-[#f80820]"}`}><Icon size={18}/></span><div className="min-w-0"><p className="truncate text-[12px]">{label}</p><strong className="mt-1 block text-[16px] font-black leading-none">{value}</strong><p className={`mt-1 truncate text-[9px] ${label==="Giao dịch rủi ro"?"text-[#f80820]":"text-[#08ad57]"}`}>↑ <b>{change}</b> <span className="font-normal text-[#17418d]">so với tháng trước</span></p></div></article>)}</section>
    <section className="grid gap-2 xl:grid-cols-[1.24fr_.82fr_1fr]"><article className="card p-2"><Heading>Số lượng giao dịch theo ngày</Heading><LineChart/></article><article className="card p-2"><Heading>Tỷ lệ loại giao dịch</Heading><Donut/></article><article className="card p-2"><Heading>Trạng thái giao dịch</Heading><Bars/></article></section>
    <section className="grid gap-2 xl:grid-cols-2"><article className="card p-2"><Heading href={`/${role}/fraud`}>Giao dịch rủi ro gần đây</Heading><RiskTable rows={recentRisks} onView={setSelected}/></article><article className="card p-2"><Heading href={`/${role}/fraud?status=review`}>Danh sách review đang chờ</Heading><RiskTable review rows={pendingReviews} onView={setSelected}/></article></section>
    <section className="grid gap-2 xl:grid-cols-[1.15fr_1fr]"><article className="card p-2"><Heading href={role==="admin"?"/admin/branches":undefined}>{role==="employee"?"Thống kê Chi nhánh Hà Nội":"Thống kê theo chi nhánh"}</Heading><table className="w-full table-fixed text-left text-[10px]"><thead className="bg-[#f4f6fa]"><tr>{["Chi nhánh","Khách hàng","Tài khoản","Giao dịch","Khoản vay","Giao dịch rủi ro"].map(x=><th className="px-2 py-0.5 font-medium" key={x}>{x}</th>)}</tr></thead><tbody className="divide-y divide-[#edf0f5]">{[["Hội sở","4.230","6.500","45.230","1.230","45"],["Chi nhánh Hà Nội","2.850","4.120","28.450","890","32"],["Chi nhánh Đà Nẵng","1.920","2.630","18.230","520","18"],["Chi nhánh TP.HCM","2.430","3.850","25.670","740","25"],["Khác","1.000","1.150","7.850","180","8"]].filter(row=>role==="admin"||row[0]==="Chi nhánh Hà Nội").map(row=><tr key={row[0]}>{row.map((value,index)=><td className={`truncate px-2 py-0.5 ${index===5?"font-bold text-[#f80820]":""}`} title={value} key={`${value}-${index}`}>{value}</td>)}</tr>)}</tbody></table></article><article className="card p-2"><Heading href={`/${role}/audit-logs`}>Hoạt động gần đây</Heading><div className="space-y-0.5">{[["Admin","Cập nhật cấu hình hạn mức chuyển tiền","30/09/2026 14:20"],["Nguyễn Văn A","Tạo nhân viên mới - Trần Thị B","30/09/2026 10:15"],["System","Triển khai model mới (v1.2)","29/09/2026 23:40"],["Admin","Thêm chi nhánh mới - Chi nhánh Cần Thơ","29/09/2026 16:30"],["System","Sao lưu dữ liệu hệ thống","29/09/2026 02:15"]].map(([user,action,time],index)=><div className="grid grid-cols-[25px_95px_1fr_auto] items-center gap-2 text-[10px]" key={action}><span className={`grid size-6 place-items-center rounded-full text-white ${index%2?"bg-[#39c991]":"bg-[#ff5366]"}`}>●</span><b className="truncate" title={user}>{user}</b><span className="truncate" title={action}>{action}</span><time className="whitespace-nowrap">{time}</time></div>)}</div></article></section>
    <Modal open={Boolean(selected)} onOpenChange={(open)=>!open&&setSelected(null)} title="Chi tiết đánh giá rủi ro">{selected && <div className="divide-y rounded-xl bg-slate-50 px-4">{[["Mã giao dịch",selected.transactionId],["Khách hàng",selected.customer],["Số tiền",money.format(selected.amount)],["RuleScore",`${selected.ruleScore}/100`],["ModelProbability",`${Math.round(selected.modelProbability*100)}%`],["Decision",selected.decision],["Thời gian",selected.time]].map(([label,value])=><div className="flex items-center justify-between gap-6 py-3 text-sm" key={label}><span className="text-slate-500">{label}</span><b className={label==="Decision"?decisionTone[selected.decision]+" rounded-md px-2 py-1":""}>{value}</b></div>)}</div>}</Modal>
  </div>;
}
