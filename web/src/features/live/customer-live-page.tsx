"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CreditCard, Landmark, ReceiptText, RefreshCw, UserRound, WalletCards } from "lucide-react";
import { bankService, type ApiTransaction } from "@/services/bank.service";

type CustomerResource = "accounts" | "transactions" | "loans" | "cards" | "notifications" | "profile";
const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

const config = {
  accounts: { title: "Tài khoản của tôi", icon: WalletCards, load: bankService.customerAccounts },
  transactions: { title: "Lịch sử giao dịch", icon: ReceiptText, load: () => bankService.listTransactions({ page: 1, pageSize: 100 }) },
  loans: { title: "Khoản vay của tôi", icon: Landmark, load: bankService.customerLoans },
  cards: { title: "Thẻ của tôi", icon: CreditCard, load: bankService.customerCards },
  notifications: { title: "Thông báo", icon: AlertCircle, load: () => bankService.customerNotifications(1, 100) },
  profile: { title: "Hồ sơ cá nhân", icon: UserRound, load: bankService.customerProfile },
} satisfies Record<CustomerResource, { title: string; icon: typeof WalletCards; load: () => Promise<unknown> }>;

function rows(resource: CustomerResource, value: unknown): Record<string, unknown>[] {
  if (!value) return [];
  if (resource === "profile") return [value as Record<string, unknown>];
  if (typeof value === "object" && value !== null && "items" in value) return ((value as { items?: Record<string, unknown>[] }).items ?? []);
  return Array.isArray(value) ? value as Record<string, unknown>[] : [];
}

function line(resource: CustomerResource, item: Record<string, unknown>): { title: string; subtitle: string; value?: string; status?: string } {
  if (resource === "accounts") return { title: String(item.accountnumber), subtitle: `${item.accounttypename} • ${item.branchname}`, value: money.format(Number(item.balance)), status: String(item.status) };
  if (resource === "transactions") { const tx=item as unknown as ApiTransaction; return { title: tx.transactioncode, subtitle: `${tx.typename} • ${new Date(tx.transactiondate).toLocaleString("vi-VN")}`, value: money.format(Number(tx.amount)), status: tx.status }; }
  if (resource === "loans") return { title: String(item.loancode), subtitle: `${item.loantypename} • Lãi suất ${item.interestrate}%`, value: money.format(Number(item.outstandingamount)), status: String(item.status) };
  if (resource === "cards") return { title: String(item.maskedcardnumber), subtitle: `${item.cardtype} • Hết hạn ${new Date(String(item.expirydate)).toLocaleDateString("vi-VN")}`, value: `Hạn mức ${money.format(Number(item.dailylimit))}`, status: String(item.status) };
  if (resource === "notifications") return { title: String(item.notificationtype).replaceAll("_"," "), subtitle: new Date(String(item.createdat)).toLocaleString("vi-VN"), status: String(item.status) };
  return { title: String(item.fullname), subtitle: `${item.customercode} • ${item.email??"Chưa có email"}`, value: String(item.phone??""), status: String(item.status) };
}

export function CustomerLivePage({ resource }: { resource: CustomerResource }) {
  const queryClient=useQueryClient();
  const definition=config[resource],Icon=definition.icon;
  const query=useQuery({queryKey:["customer",resource],queryFn:definition.load});
  const items=rows(resource,query.data);
  const action=useMutation({mutationFn:(run:()=>Promise<unknown>)=>run(),onSuccess:()=>queryClient.invalidateQueries({queryKey:["customer",resource]})});
  const changePassword=()=>{const oldPassword=window.prompt("Mật khẩu hiện tại:");if(!oldPassword)return;const newPassword=window.prompt("Mật khẩu mới (ít nhất 8 ký tự):");if(!newPassword)return;action.mutate(()=>bankService.changePassword(oldPassword,newPassword));};
  const changePin=(item:Record<string,unknown>)=>{const oldPin=window.prompt("PIN hiện tại:");if(!oldPin)return;const newPin=window.prompt("PIN mới (4-6 chữ số):");if(!newPin)return;action.mutate(()=>bankService.changeCardPin(Number(item.cardid),oldPin,newPin));};
  const payLoan=(item:Record<string,unknown>)=>{const scheduleId=window.prompt("ID kỳ thanh toán:");const sourceAccountId=window.prompt("ID tài khoản thanh toán:");const internalCreditAccountId=window.prompt("ID tài khoản thu nợ nội bộ:");const amount=window.prompt("Tổng tiền đúng theo kỳ thanh toán:");if(!scheduleId||!sourceAccountId||!internalCreditAccountId||!amount)return;action.mutate(()=>bankService.payLoan({loanId:Number(item.loanid),scheduleId:Number(scheduleId),sourceAccountId:Number(sourceAccountId),internalCreditAccountId:Number(internalCreditAccountId),amount,transactionCode:`LOAN-${Date.now()}`}));};
  return <div className="space-y-4 text-navy"><section className="d4-banner relative overflow-hidden rounded-xl border border-red-50 p-6"><div className="d4-city"/><div className="relative flex items-center gap-4"><span className="grid size-12 place-items-center rounded-xl bg-[#fff0f0] text-coral"><Icon/></span><div><p className="text-xs font-bold text-coral">D4 BANK</p><h1 className="text-3xl font-black">{definition.title}</h1><p className="mt-1 text-sm text-slate-500">Dữ liệu được lấy trực tiếp từ hệ thống ngân hàng.</p></div>{resource==="profile"&&<button className="btn-primary ml-auto" onClick={changePassword}>Đổi mật khẩu</button>}</div></section><section className="card overflow-hidden"><header className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-black">{items.length} bản ghi</h2><p className="text-xs text-slate-500">Cập nhật theo PostgreSQL</p></div><button className="btn-secondary h-9" onClick={()=>void query.refetch()}><RefreshCw size={15}/>Làm mới</button></header>{query.isLoading?<div className="grid h-56 place-items-center text-sm text-slate-500">Đang tải dữ liệu...</div>:query.isError?<div className="grid h-56 place-items-center text-sm text-red-600">Không thể tải dữ liệu: {query.error.message}</div>:<div className="divide-y">{items.map((item,index)=>{const view=line(resource,item);return <article className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50" key={String(item.transactionid??item.accountid??item.loanid??item.cardid??item.notificationoutboxid??item.customerid??index)}><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#fff0f0] text-coral"><Icon size={18}/></span><div className="min-w-0 flex-1"><b className="block truncate text-sm">{view.title}</b><span className="mt-1 block truncate text-xs text-slate-500">{view.subtitle}</span></div>{view.value&&<strong className="text-sm">{view.value}</strong>}{view.status&&<span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold">{view.status}</span>}{resource==="cards"&&<button className="btn-secondary h-8" onClick={()=>changePin(item)}>Đổi PIN</button>}{resource==="loans"&&String(item.status)==="Active"&&<button className="btn-primary h-8" onClick={()=>payLoan(item)}>Thanh toán kỳ</button>}</article>})}{action.isError&&<p className="p-4 text-sm text-red-600">{action.error.message}</p>}{action.isSuccess&&<p className="p-4 text-sm text-emerald-700">Thao tác đã được xử lý.</p>}{items.length===0&&<div className="grid h-48 place-items-center text-sm text-slate-400">Chưa có dữ liệu.</div>}</div>}</section></div>;
}
