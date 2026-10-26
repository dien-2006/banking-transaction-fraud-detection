"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ChevronLeft, ChevronRight, Database, RefreshCw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { bankService, type ApiTransaction, type PageResult } from "@/services/bank.service";
import { ResourceCreateDialog } from "./resource-create-dialog";
import { useSessionUser } from "@/components/session-context";

type Row = Record<string, unknown>;
type Resource = "customers" | "employees" | "accounts" | "transactions" | "loans" | "cards" | "branches" | "fraud" | "audit";

interface Definition {
  title: string;
  description: string;
  columns: { key: string; label: string; format?: "money" | "date" | "percent" | "status" }[];
  load: (params: Record<string, string | number | undefined>) => Promise<PageResult<Row>>;
}

const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const definitions: Record<Resource, Definition> = {
  customers: { title: "Quản lý khách hàng", description: "Hồ sơ và trạng thái khách hàng từ PostgreSQL", load: bankService.customers, columns: [
    { key: "customercode", label: "Mã KH" }, { key: "fullname", label: "Họ tên" }, { key: "phone", label: "Điện thoại" }, { key: "customersegment", label: "Phân khúc" }, { key: "status", label: "Trạng thái", format: "status" },
  ] },
  employees: { title: "Quản lý nhân viên", description: "Nhân sự, vai trò và chi nhánh", load: bankService.employees, columns: [
    { key: "employeecode", label: "Mã NV" }, { key: "fullname", label: "Họ tên" }, { key: "branchname", label: "Chi nhánh" }, { key: "rolename", label: "Vai trò" }, { key: "status", label: "Trạng thái", format: "status" },
  ] },
  accounts: { title: "Quản lý tài khoản", description: "Số dư và trạng thái tài khoản nguồn", load: bankService.accounts as Definition["load"], columns: [
    { key: "accountnumber", label: "Số tài khoản" }, { key: "accounttypename", label: "Loại" }, { key: "branchname", label: "Chi nhánh" }, { key: "balance", label: "Số dư", format: "money" }, { key: "status", label: "Trạng thái", format: "status" },
  ] },
  transactions: { title: "Quản lý giao dịch", description: "Tra cứu giao dịch và quyết định rủi ro", load: (p) => bankService.listTransactions(p) as Promise<PageResult<Row>>, columns: [
    { key: "transactioncode", label: "Mã giao dịch" }, { key: "typename", label: "Loại" }, { key: "amount", label: "Số tiền", format: "money" }, { key: "decision", label: "Fraud" }, { key: "transactiondate", label: "Thời gian", format: "date" }, { key: "status", label: "Trạng thái", format: "status" },
  ] },
  loans: { title: "Quản lý khoản vay", description: "Dư nợ, kỳ hạn và trạng thái khoản vay", load: bankService.loans, columns: [
    { key: "loancode", label: "Mã khoản vay" }, { key: "loantypename", label: "Sản phẩm" }, { key: "principalamount", label: "Tiền vay", format: "money" }, { key: "outstandingamount", label: "Dư nợ", format: "money" }, { key: "interestrate", label: "Lãi suất", format: "percent" }, { key: "status", label: "Trạng thái", format: "status" },
  ] },
  cards: { title: "Quản lý thẻ", description: "Thông tin thẻ đã được che số nhạy cảm", load: bankService.cards, columns: [
    { key: "maskedcardnumber", label: "Số thẻ" }, { key: "cardtype", label: "Loại" }, { key: "accountid", label: "Tài khoản" }, { key: "dailylimit", label: "Hạn mức", format: "money" }, { key: "expirydate", label: "Hết hạn", format: "date" }, { key: "status", label: "Trạng thái", format: "status" },
  ] },
  branches: { title: "Quản lý chi nhánh", description: "Mạng lưới và quy mô hoạt động", load: bankService.branches, columns: [
    { key: "branchcode", label: "Mã" }, { key: "branchname", label: "Tên chi nhánh" }, { key: "city", label: "Thành phố" }, { key: "employeecount", label: "Nhân viên" }, { key: "customercount", label: "Khách hàng" }, { key: "status", label: "Trạng thái", format: "status" },
  ] },
  fraud: { title: "Fraud & Review", description: "Các giao dịch cần nhân viên xem xét", load: (p) => bankService.fraudCases(p) as Promise<PageResult<Row>>, columns: [
    { key: "reviewcaseid", label: "Review" }, { key: "transactioncode", label: "Giao dịch" }, { key: "amount", label: "Số tiền", format: "money" }, { key: "rulescore", label: "Rule score" }, { key: "modelprobability", label: "ML", format: "percent" }, { key: "reviewstatus", label: "Trạng thái", format: "status" },
  ] },
  audit: { title: "Nhật ký hoạt động", description: "Dấu vết thay đổi dữ liệu nghiệp vụ", load: bankService.auditLogs, columns: [
    { key: "auditid", label: "ID" }, { key: "userid", label: "User" }, { key: "entitytype", label: "Đối tượng" }, { key: "entityid", label: "Mã đối tượng" }, { key: "action", label: "Hành động" }, { key: "ipaddress", label: "IP" }, { key: "createdat", label: "Thời gian", format: "date" },
  ] },
};

function display(value: unknown, format?: Definition["columns"][number]["format"]): string {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "money") return money.format(Number(value));
  if (format === "date") return new Date(String(value)).toLocaleString("vi-VN");
  if (format === "percent") return `${Number(value) <= 1 ? (Number(value) * 100).toFixed(1) : value}%`;
  return String(value);
}

export function LiveResourcePage({ resource }: { resource: Resource }) {
  const session=useSessionUser();
  const queryClient=useQueryClient();
  const definition = definitions[resource];
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [type,setType]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState(""),[customerId,setCustomerId]=useState(""),[accountId,setAccountId]=useState("");
  const [page, setPage] = useState(1);
  const[selectedTransaction,setSelectedTransaction]=useState<number|null>(null);
  const result = useQuery({
    queryKey: ["live-resource", resource, query, status, type, from, to, customerId, accountId, page],
    queryFn: () => definition.load({ query, status, type, from:from||undefined, to:to?`${to}T23:59:59.999`:undefined, customerId:customerId||undefined, accountId:accountId||undefined, page, pageSize: 20 }),
  });
  const rows = useMemo(() => result.data?.items ?? [], [result.data]);
  const detail=useQuery({queryKey:["transaction-detail",selectedTransaction],queryFn:()=>bankService.transactionDetail(selectedTransaction!),enabled:selectedTransaction!==null});
  const review=useMutation({mutationFn:({id,action}:{id:number;action:"APPROVE"|"REJECT"})=>bankService.resolveReview(id,action),onSuccess:()=>queryClient.invalidateQueries({queryKey:["live-resource","fraud"]})});
  const action=useMutation({mutationFn:(run:()=>Promise<unknown>)=>run(),onSuccess:()=>queryClient.invalidateQueries({queryKey:["live-resource",resource]})});
  const creatable=["branches","customers","employees","accounts","cards","loans"].includes(resource)&&!(session.role==="employee"&&["branches","employees"].includes(resource));
  const rowId=(row:Row)=>Number(row.customerid??row.employeeid??row.accountid??row.transactionid??row.loanid??row.cardid??row.branchid);
  const changeStatus=(row:Row)=>{const current=String(row.status),next=resource==="accounts"?(current==="Active"?"Frozen":"Active"):resource==="cards"?(current==="Active"?"Blocked":"Active"):(current==="Active"?"Inactive":"Active");const reason=resource==="accounts"?window.prompt(`Lý do chuyển trạng thái sang ${next}:`,"Cập nhật bởi nhân viên")??undefined:undefined;if(resource==="accounts"&&!reason)return;action.mutate(()=>bankService.managementStatus(resource as "branches"|"customers"|"employees"|"accounts"|"cards",rowId(row),next,reason));};
  const registerLogin=(row:Row)=>{const username=window.prompt("Tên đăng nhập mới:");if(!username)return;const password=window.prompt("Mật khẩu ban đầu (ít nhất 8 ký tự):");if(!password)return;action.mutate(()=>bankService.registerLogin(resource as "customers"|"employees",rowId(row),username,password));};
  const reverse=(row:Row)=>{const code=window.prompt("Mã giao dịch reversal:",`REV-${Date.now()}`);if(!code)return;const reason=window.prompt("Lý do hoàn giao dịch:");if(!reason)return;action.mutate(()=>bankService.reverseTransaction(rowId(row),code,reason));};
  const movement=()=>{const requested=window.prompt("Loại giao dịch: DEPOSIT, WITHDRAWAL hoặc OPENING_BALANCE","DEPOSIT")?.toUpperCase();if(!requested||!["DEPOSIT","WITHDRAWAL","OPENING_BALANCE"].includes(requested))return;const debit=window.prompt("ID tài khoản ghi nợ:");const credit=window.prompt("ID tài khoản ghi có:");const amount=window.prompt("Số tiền:");if(!debit||!credit||!amount)return;action.mutate(()=>bankService.createMovement({type:requested as "DEPOSIT"|"WITHDRAWAL"|"OPENING_BALANCE",debitAccountId:Number(debit),creditAccountId:Number(credit),amount,transactionCode:`${requested}-${Date.now()}`,channel:"Counter",description:"Giao dịch tại quầy"}));};
  const labelFraud=(row:Row)=>{const label=window.prompt("Nhãn: FRAUD, LEGITIMATE hoặc UNKNOWN","LEGITIMATE")?.toUpperCase();if(!label||!["FRAUD","LEGITIMATE","UNKNOWN"].includes(label))return;const note=window.prompt("Ghi chú:")??undefined;action.mutate(()=>bankService.labelTransaction(Number(row.transactionid),label as "FRAUD"|"LEGITIMATE"|"UNKNOWN",note));};
  const hasActions=["branches","customers","employees","accounts","transactions","loans","cards","fraud"].includes(resource);
  return <div className="space-y-4 text-navy">
    <section className="d4-banner relative overflow-hidden rounded-xl border border-red-50 p-6"><div className="d4-city"/><div className="relative flex items-end justify-between gap-4"><div><p className="text-xs font-bold text-coral">D4 BANK • LIVE DATA</p><h1 className="mt-1 text-3xl font-black">{definition.title}</h1><p className="mt-2 text-sm text-slate-500">{definition.description}</p></div><div className="flex gap-2">{resource==="transactions"&&<button className="btn-primary h-9" onClick={movement}>Nạp / rút tiền</button>}{creatable&&<ResourceCreateDialog resource={resource as "branches"|"customers"|"employees"|"accounts"|"cards"|"loans"} onCreated={()=>void result.refetch()}/>}</div></div></section>
    <section className="grid gap-3 sm:grid-cols-3"><article className="card p-4"><small className="text-slate-500">Tổng bản ghi</small><b className="mt-1 block text-2xl">{result.data?.total ?? 0}</b></article><article className="card p-4"><small className="text-slate-500">Trang hiện tại</small><b className="mt-1 block text-2xl">{page}</b></article><article className="card p-4"><small className="text-slate-500">Nguồn dữ liệu</small><b className="mt-1 flex items-center gap-2 text-sm"><Database size={18}/>PostgreSQL</b></article></section>
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b p-4"><label className="relative min-w-64 flex-1"><Search className="absolute left-3 top-2.5 text-slate-400" size={16}/><input className="field h-9 pl-9" value={query} onChange={(event)=>{setQuery(event.target.value);setPage(1);}} placeholder="Tìm kiếm..."/></label><select className="field h-9 w-44" value={status} onChange={(event)=>{setStatus(event.target.value);setPage(1);}}><option value="">Tất cả trạng thái</option>{["Active","Inactive","Pending","Success","Failed","Cancelled","Frozen","Blocked","OPEN","IN_REVIEW","APPROVED","REJECTED"].map(value=><option key={value}>{value}</option>)}</select>{resource==="transactions"&&<><select className="field h-9 w-44" value={type} onChange={event=>{setType(event.target.value);setPage(1);}}><option value="">Tất cả loại</option>{["TRANSFER","DEPOSIT","WITHDRAWAL","LOAN_PAYMENT","OPENING_BALANCE","REVERSAL"].map(value=><option key={value}>{value}</option>)}</select><input aria-label="Từ ngày" className="field h-9 w-36" type="date" value={from} onChange={event=>{setFrom(event.target.value);setPage(1);}}/><input aria-label="Đến ngày" className="field h-9 w-36" type="date" value={to} onChange={event=>{setTo(event.target.value);setPage(1);}}/><input aria-label="ID khách hàng" className="field h-9 w-32" inputMode="numeric" placeholder="ID khách hàng" value={customerId} onChange={event=>{setCustomerId(event.target.value.replace(/\D/g,""));setPage(1);}}/><input aria-label="ID tài khoản" className="field h-9 w-32" inputMode="numeric" placeholder="ID tài khoản" value={accountId} onChange={event=>{setAccountId(event.target.value.replace(/\D/g,""));setPage(1);}}/></>}<button className="btn-secondary h-9" onClick={()=>void result.refetch()}><RefreshCw size={15}/>Làm mới</button></div>
      {result.isLoading?<div className="grid h-52 place-items-center text-sm text-slate-500">Đang tải dữ liệu...</div>:result.isError?<div className="grid h-52 place-items-center text-sm text-red-600"><span className="flex items-center gap-2"><AlertCircle/>Không thể tải dữ liệu: {result.error.message}</span></div>:<div className="overflow-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50"><tr>{definition.columns.map(column=><th className="whitespace-nowrap px-4 py-3" key={column.key}>{column.label}</th>)}{hasActions&&<th className="px-4 py-3">Xử lý</th>}</tr></thead><tbody>{rows.map((row,index)=><tr className="border-t hover:bg-slate-50" key={String(row[definition.columns[0].key]??index)}>{definition.columns.map(column=><td className="whitespace-nowrap px-4 py-3" key={column.key}>{column.format==="status"?<span className="rounded-full bg-slate-100 px-2 py-1 font-semibold">{display(row[column.key])}</span>:display(row[column.key],column.format)}</td>)}{hasActions&&<td className="whitespace-nowrap px-4 py-3">{resource==="fraud"?<span className="flex gap-2">{["OPEN","IN_REVIEW"].includes(String(row.reviewstatus))&&<><button className="rounded bg-emerald-600 px-2 py-1 font-bold text-white disabled:opacity-50" disabled={review.isPending} onClick={()=>review.mutate({id:Number(row.reviewcaseid),action:"APPROVE"})}>Duyệt</button><button className="rounded bg-red-600 px-2 py-1 font-bold text-white disabled:opacity-50" disabled={review.isPending} onClick={()=>review.mutate({id:Number(row.reviewcaseid),action:"REJECT"})}>Từ chối</button></>}<button className="rounded bg-violet-700 px-2 py-1 font-bold text-white" onClick={()=>labelFraud(row)}>Gắn nhãn</button></span>:resource==="loans"&&String(row.status)==="Pending"?<button className="rounded bg-emerald-600 px-2 py-1 font-bold text-white" onClick={()=>action.mutate(()=>bankService.approveLoan(rowId(row)))}>Phê duyệt</button>:resource==="transactions"?<span className="flex gap-2"><button className="rounded bg-sky-700 px-2 py-1 font-bold text-white" onClick={()=>setSelectedTransaction(rowId(row))}>Chi tiết</button>{String(row.status)==="Success"&&<button className="rounded bg-amber-600 px-2 py-1 font-bold text-white" onClick={()=>reverse(row)}>Hoàn giao dịch</button>}</span>:["customers","employees"].includes(resource)?<span className="flex gap-2"><button className="rounded bg-sky-700 px-2 py-1 font-bold text-white" onClick={()=>registerLogin(row)}>Tạo đăng nhập</button><button className="rounded bg-slate-700 px-2 py-1 font-bold text-white" onClick={()=>changeStatus(row)}>Đổi trạng thái</button></span>:["branches","accounts","cards"].includes(resource)?<button className="rounded bg-slate-700 px-2 py-1 font-bold text-white" onClick={()=>changeStatus(row)}>Đổi trạng thái</button>:"—"}</td>}</tr>)}</tbody></table>{(review.isError||action.isError)&&<p className="p-3 text-xs text-red-600">{review.error?.message??action.error?.message}</p>}{rows.length===0&&<div className="grid h-40 place-items-center text-sm text-slate-400">Không có dữ liệu phù hợp.</div>}</div>}
      <footer className="flex items-center justify-between border-t px-4 py-3 text-xs text-slate-500"><span>{result.data?.total ?? 0} bản ghi</span><div className="flex items-center gap-2"><button className="btn-secondary h-8 px-2" disabled={page<=1} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={15}/></button><b>{page}</b><button className="btn-secondary h-8 px-2" disabled={page*(result.data?.pageSize??20)>=(result.data?.total??0)} onClick={()=>setPage(value=>value+1)}><ChevronRight size={15}/></button></div></footer>
    </section>{selectedTransaction!==null&&<div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" onMouseDown={event=>{if(event.target===event.currentTarget)setSelectedTransaction(null);}}><section className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl"><header className="flex items-center justify-between"><div><h2 className="text-xl font-black">Chi tiết giao dịch</h2><p className="text-xs text-slate-500">Transaction, risk và debit/credit posting</p></div><button aria-label="Đóng" onClick={()=>setSelectedTransaction(null)}><X/></button></header>{detail.isLoading?<p className="py-10 text-center text-sm text-slate-500">Đang tải...</p>:detail.isError?<p className="py-10 text-center text-sm text-red-600">{detail.error.message}</p>:detail.data?<><div className="mt-5 grid gap-3 sm:grid-cols-3">{Object.entries(detail.data.transaction).map(([key,value])=><p className="rounded-lg bg-slate-50 p-3" key={key}><small className="block text-slate-400">{key}</small><b className="break-words text-xs">{display(value,key.includes("date")||key.endsWith("at")?"date":undefined)}</b></p>)}</div><h3 className="mb-2 mt-5 font-black">Postings</h3><div className="overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Account</th><th className="p-2">Loại</th><th className="p-2">Số tiền</th><th className="p-2">Thời gian</th></tr></thead><tbody>{detail.data.postings.map((posting,index)=><tr className="border-t" key={String(posting.postingid??index)}><td className="p-2">{display(posting.accountid)}</td><td className="p-2">{display(posting.postingtype)}</td><td className="p-2">{display(posting.amount,"money")}</td><td className="p-2">{display(posting.postingdate,"date")}</td></tr>)}</tbody></table></div></>:null}</section></div>}
  </div>;
}
