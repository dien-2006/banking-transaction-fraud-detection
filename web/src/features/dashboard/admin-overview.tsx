"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, HandCoins, ShieldAlert, Users, WalletCards } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/components/ui";
import { useSessionUser } from "@/components/session-context";
import { money } from "@/lib/utils";
import { bankService, type AdminOverviewData } from "@/services/bank.service";
import type { RiskDecision } from "@/types";

type RiskRow = { transactionId: string; reviewId?: string; customer: string; amount: number; ruleScore: number; modelProbability: number; time: string; decision: RiskDecision };
const number = new Intl.NumberFormat("vi-VN");
const colors = ["#f80820", "#ff7585", "#ffb54a", "#ff8a00", "#ffc1c8", "#6f7ba7"];
const icons = { customers: Users, accounts: WalletCards, transactions: ArrowLeftRight, loans: HandCoins, risks: ShieldAlert } as const;
const typeLabels: Record<string, string> = { TRANSFER: "Chuyển tiền", DEPOSIT: "Nạp tiền", WITHDRAWAL: "Rút tiền", LOAN_PAYMENT: "Trả khoản vay", OPENING_BALANCE: "Số dư mở tài khoản", REVERSAL: "Hoàn giao dịch" };
const statusLabels: Record<string, string> = { Success: "Thành công", Pending: "Đang xử lý", Failed: "Thất bại", Cancelled: "Đã hủy" };
const decisionTone: Record<RiskDecision, string> = { ALLOW: "bg-[#eafaf2] text-[#128653]", REVIEW: "bg-[#fff2dc] text-[#c66b00]", BLOCK: "bg-[#ffe5e8] text-[#d90018]" };
const compactNumber = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });

function niceMaximum(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function Heading({ children, href }: { children: React.ReactNode; href?: string }) {
  return <div className="mb-1 flex items-center justify-between gap-3"><h2 className="truncate text-[14px] font-extrabold text-[#000064]">{children}</h2>{href && <Link className="shrink-0 text-[11px] font-semibold text-[#f80820] hover:underline" href={href}>Xem tất cả&nbsp; →</Link>}</div>;
}

function LineChart({ rows }: { rows: AdminOverviewData["dailyTransactions"] }) {
  const max = niceMaximum(Math.max(0, ...rows.map((row) => row.count)));
  const points = rows.map((row, index) => [4 + index * (484 / Math.max(rows.length - 1, 1)), 118 - (row.count / max) * 105] as const);
  const polyline = points.map(([x, y]) => `${x},${y}`).join(" ");
  return <div className="relative h-[82px] min-w-0 pl-9 pt-2 text-[10px] text-[#17418d]"><div className="absolute inset-x-10 bottom-6 top-3 flex flex-col justify-between">{[max,max/2,0].map((value,index)=><div className="relative border-t border-[#e2e7f1]" key={`${value}-${index}`}><span className="absolute -left-10 -top-2" title={number.format(value)}>{compactNumber.format(value)}</span></div>)}</div><svg aria-label="Số lượng giao dịch thực tế theo ngày" className="absolute inset-x-10 bottom-6 h-[76px] w-[calc(100%-3.25rem)] overflow-visible" preserveAspectRatio="none" role="img" viewBox="0 0 500 135"><defs><linearGradient id="transaction-area-live" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f80820" stopOpacity=".18"/><stop offset="1" stopColor="#f80820" stopOpacity=".02"/></linearGradient></defs>{points.length>0&&<><path d={`M${polyline} L488 135 L4 135Z`} fill="url(#transaction-area-live)"/><polyline points={polyline} fill="none" stroke="#f80820" strokeWidth="3"/>{points.map(([x,y],index)=><circle cx={x} cy={y} fill="#f80820" r="4" key={rows[index].date}><title>{`${rows[index].date}: ${number.format(rows[index].count)} giao dịch`}</title></circle>)}</>}</svg><div className="absolute inset-x-10 bottom-0 flex justify-between">{rows.map((row,index)=><span className={index%2===0||index===rows.length-1?"":"hidden sm:inline"} key={row.date}>{new Date(`${row.date}T00:00:00`).toLocaleDateString("vi-VN",{day:"2-digit",month:"2-digit"})}</span>)}</div></div>;
}

function Donut({ rows }: { rows: AdminOverviewData["transactionTypes"] }) {
  const total = rows.reduce((sum,row)=>sum+row.count,0);
  let cursor=0;
  const segments=rows.map((row,index)=>{const start=cursor;cursor+=total?row.count/total*100:0;return `${colors[index%colors.length]} ${start}% ${cursor}%`;});
  const background=total?`conic-gradient(${segments.join(",")})`:"#edf0f5";
  return <div className="flex h-[82px] min-w-0 items-center justify-center gap-3 sm:gap-6"><div aria-label={`${number.format(total)} giao dịch`} className="grid size-[76px] shrink-0 place-items-center rounded-full" style={{background}}><div className="grid size-[48px] place-items-center rounded-full bg-white text-center"><span><b className="block max-w-11 truncate text-[14px]" title={number.format(total)}>{compactNumber.format(total)}</b><small className="text-[9px]">giao dịch</small></span></div></div><div className="min-w-0 flex-1 space-y-0.5 text-[10px] leading-3">{rows.map((row,index)=><div className="flex items-center gap-2" key={row.code}><span className="size-2.5 shrink-0 rounded-full" style={{background:colors[index%colors.length]}}/><span className="truncate">{typeLabels[row.code]??row.label}</span><b className="ml-auto font-medium">{total?Math.round(row.count/total*100):0}%</b></div>)}{rows.length===0&&<span>Chưa có giao dịch tháng này</span>}</div></div>;
}

function Bars({ rows }: { rows: AdminOverviewData["transactionStatuses"] }) {
  const max=niceMaximum(Math.max(0,...rows.map((row)=>row.count)));
  return <div className="relative flex h-[82px] items-end justify-around border-b border-l border-[#dbe2ed] px-3 pb-5 before:absolute before:inset-x-0 before:top-1/4 before:border-t before:border-[#e7ebf2] after:absolute after:inset-x-0 after:top-1/2 after:border-t after:border-[#e7ebf2]">{rows.map((row,index)=><div className="relative z-10 flex h-full min-w-12 flex-col items-center justify-end" key={row.status}><span className="mb-0.5 text-[8px] font-semibold">{number.format(row.count)}</span><div className="w-8 rounded-t-sm" style={{height:`${Math.max(4,row.count/max*82)}%`,background:colors[index%colors.length]}}/><span className="absolute -bottom-5 whitespace-nowrap text-[9px]">{statusLabels[row.status]??row.status}</span></div>)}{rows.length===0&&<span className="self-center text-[10px]">Chưa có dữ liệu tháng này</span>}</div>;
}

function RiskTable({ rows, review = false, onView }: { rows: RiskRow[]; review?: boolean; onView: (row: RiskRow) => void }) {
  const headers = review ? ["Mã review","Mã giao dịch","Khách hàng","Số tiền","RuleScore","ML","Thời gian","Thao tác"] : ["Mã giao dịch","Khách hàng","Số tiền","RuleScore","ML","Decision","Thao tác"];
  return <div className="overflow-hidden"><table className="w-full table-fixed text-left text-[10px]"><thead className="bg-[#f4f6fa] text-[#17418d]"><tr>{headers.map(x=><th className="truncate px-1.5 py-0.5 font-semibold" title={x} key={x}>{x}</th>)}</tr></thead><tbody className="divide-y divide-[#edf0f5]">{rows.map(row=><tr key={row.reviewId??row.transactionId}>{review&&<td className="truncate px-1.5 py-0.5">{row.reviewId}</td>}<td className="truncate px-1.5 py-0.5">{row.transactionId}</td><td className="truncate px-1.5 py-0.5" title={row.customer}>{row.customer}</td><td className="truncate px-1.5 py-0.5">{money.format(row.amount)}</td><td className="px-1.5 py-0.5"><b className="rounded-md bg-[#ffe5e8] px-1.5 text-[#f80820]">{row.ruleScore}</b></td><td className="px-1.5 py-0.5">{Math.round(row.modelProbability*100)}%</td>{review?<td className="px-1.5 py-0.5">{row.time}</td>:<td className="px-1.5 py-0.5"><span className={`rounded-md px-1.5 font-semibold ${decisionTone[row.decision]}`}>{row.decision}</span></td>}<td className="px-1.5 py-0.5"><button className="rounded-md bg-[#fff0f0] px-3 py-0.5 font-medium text-[#f80820] hover:bg-[#ffe0e4]" onClick={()=>onView(row)}>Xem</button></td></tr>)}{rows.length===0&&<tr><td className="py-4 text-center text-slate-400" colSpan={headers.length}>Không có dữ liệu</td></tr>}</tbody></table></div>;
}

function toRiskRows(rows: AdminOverviewData["recentRisks"] | AdminOverviewData["pendingReviews"]): RiskRow[] {
  return rows.map((row)=>({transactionId:row.transactionCode,reviewId:"reviewId" in row?`RVW${row.reviewId}`:undefined,customer:row.customer,amount:Number(row.amount),ruleScore:Number(row.ruleScore),modelProbability:Number(row.modelProbability),time:new Date("assessed_at" in row?row.assessed_at:row.created_at).toLocaleString("vi-VN"),decision:row.decision}));
}

export function AdminOverview({ role = "admin" }: { role?: "admin" | "employee" }) {
  const [selected,setSelected]=useState<RiskRow|null>(null);
  const {name:adminName}=useSessionUser();
  const query=useQuery({queryKey:["admin-overview"],queryFn:bankService.adminOverview,refetchInterval:30_000});
  if(query.isLoading)return <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{[1,2,3,4,5].map(x=><div className="h-20 animate-pulse rounded-xl bg-white" key={x}/>)}</div>;
  if(query.isError||!query.data)return <div className="card p-6 text-sm text-red-600">Không thể tải dữ liệu tổng quan từ PostgreSQL: {query.error instanceof Error?query.error.message:"Lỗi không xác định"}</div>;
  const data=query.data,recentRisks=toRiskRows(data.recentRisks),pendingReviews=toRiskRows(data.pendingReviews);
  return <div className="admin-overview-fit space-y-2 text-[#000064]">
    <section className="grid gap-3 lg:grid-cols-[2.15fr_1fr]"><article className="d4-banner relative min-h-[70px] overflow-hidden rounded-xl border border-[#ffe3e7] px-3 py-1.5"><div className="d4-city"/><div className="relative"><p className="text-[13px] text-[#f80820]">Chào mừng trở lại,</p><h1 className="text-[24px] font-black leading-none text-[#f80820]">{adminName}!</h1><p className="mt-0.5 text-[10px]">{role==="employee"?"Cùng D4 Bank vận hành chi nhánh an toàn – chính xác – hiệu quả.":"Cùng D4 Bank quản trị hệ thống an toàn – hiệu quả – bền vững."}</p></div><p className="absolute right-5 top-1 hidden rotate-[-8deg] text-center text-[10px] font-bold italic leading-4 text-[#f80820] md:block">Dữ liệu hôm nay<br/>Tạo nên một ngân hàng<br/>thông minh hơn ngày mai!</p></article><article className="d4-banner relative min-h-[70px] overflow-hidden rounded-xl border border-[#ffe3e7] px-2.5 py-1.5"><div className="d4-city"/><div className="relative mt-1 inline-block rounded-xl bg-white/90 px-2.5 py-1.5"><h2 className="text-[12px] font-black text-[#f80820]">{role==="employee"?"Vận hành trong phạm vi chi nhánh":"Kiểm soát toàn hệ thống"}</h2><p className="mt-0.5 text-[10px]">Cập nhật {new Date(data.generatedAt).toLocaleString("vi-VN")}</p></div></article></section>
    <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{data.kpis.map((item)=>{const Icon=icons[item.key],up=item.changePercent>=0;return <article className="card flex min-h-[60px] min-w-0 items-center gap-2 p-2.5" key={item.key}><span className={`grid size-8 shrink-0 place-items-center rounded-full ${item.key==="loans"?"bg-[#fff1da] text-[#f59e0b]":"bg-[#ffe7e9] text-[#f80820]"}`}><Icon size={18}/></span><div className="min-w-0"><p className="truncate text-[12px]">{item.label}</p><strong className="mt-1 block text-[16px] font-black leading-none">{number.format(item.value)}</strong><p className={`mt-1 truncate text-[9px] ${up?"text-[#08ad57]":"text-[#f80820]"}`} title={`Tháng này: ${item.currentPeriod}; tháng trước: ${item.previousPeriod}`}>{up?"↑":"↓"} <b>{Math.abs(item.changePercent).toLocaleString("vi-VN")}%</b> <span className="font-normal text-[#17418d]">so với tháng trước</span></p></div></article>})}</section>
    <section className="grid gap-2 xl:grid-cols-[1.24fr_.82fr_1fr]"><article className="card p-2"><Heading>Số lượng giao dịch theo ngày</Heading><LineChart rows={data.dailyTransactions}/></article><article className="card p-2"><Heading>Tỷ lệ loại giao dịch tháng này</Heading><Donut rows={data.transactionTypes}/></article><article className="card p-2"><Heading>Trạng thái giao dịch tháng này</Heading><Bars rows={data.transactionStatuses}/></article></section>
    <section className="grid gap-2 xl:grid-cols-2"><article className="card p-2"><Heading href={`/${role}/fraud`}>Giao dịch rủi ro gần đây</Heading><RiskTable rows={recentRisks} onView={setSelected}/></article><article className="card p-2"><Heading href={`/${role}/fraud?status=review`}>Danh sách review đang chờ</Heading><RiskTable review rows={pendingReviews} onView={setSelected}/></article></section>
    <section className="grid gap-2 xl:grid-cols-[1.15fr_1fr]"><article className="card p-2"><Heading href={role==="admin"?"/admin/branches":undefined}>Thống kê theo chi nhánh</Heading><table className="w-full table-fixed text-left text-[10px]"><thead className="bg-[#f4f6fa]"><tr>{["Chi nhánh","Khách hàng","Tài khoản","Giao dịch","Khoản vay","Giao dịch rủi ro"].map(x=><th className="px-2 py-0.5 font-medium" key={x}>{x}</th>)}</tr></thead><tbody className="divide-y divide-[#edf0f5]">{data.branches.slice(0,5).map(row=><tr key={row.branchId}>{[row.branchName,row.customers,row.accounts,row.transactions,row.loans,row.risks].map((value,index)=><td className={`truncate px-2 py-0.5 ${index===5?"font-bold text-[#f80820]":""}`} title={String(value)} key={`${row.branchId}-${index}`}>{typeof value==="number"?number.format(value):value}</td>)}</tr>)}</tbody></table></article><article className="card p-2"><Heading href={`/${role}/audit-logs`}>Hoạt động gần đây</Heading><div className="space-y-0.5">{data.recentActivities.map((item,index)=><div className="grid grid-cols-[25px_95px_1fr_auto] items-center gap-2 text-[10px]" key={item.auditId}><span className={`grid size-6 place-items-center rounded-full text-white ${index%2?"bg-[#39c991]":"bg-[#ff5366]"}`}>●</span><b className="truncate" title={item.actor}>{item.actor}</b><span className="truncate" title={item.description}>{item.description}</span><time className="whitespace-nowrap">{new Date(item.created_at).toLocaleString("vi-VN")}</time></div>)}{data.recentActivities.length===0&&<p className="py-4 text-center text-[10px] text-slate-400">Chưa có audit log</p>}</div></article></section>
    <Modal open={Boolean(selected)} onOpenChange={(open)=>!open&&setSelected(null)} title="Chi tiết đánh giá rủi ro">{selected&&<div className="divide-y rounded-xl bg-slate-50 px-4">{[["Mã giao dịch",selected.transactionId],["Khách hàng",selected.customer],["Số tiền",money.format(selected.amount)],["RuleScore",`${selected.ruleScore}/100`],["ModelProbability",`${Math.round(selected.modelProbability*100)}%`],["Decision",selected.decision],["Thời gian",selected.time]].map(([label,value])=><div className="flex items-center justify-between gap-6 py-3 text-sm" key={label}><span className="text-slate-500">{label}</span><b className={label==="Decision"?decisionTone[selected.decision]+" rounded-md px-2 py-1":""}>{value}</b></div>)}</div>}</Modal>
  </div>;
}
