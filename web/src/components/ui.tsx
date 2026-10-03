"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Stat } from "@/types";

const statTones = { red: "bg-[#fff0f0] text-[#f80820]", blue: "bg-[#eef4ff] text-[#2368d7]", green: "bg-[#eafaf2] text-[#12a761]", orange: "bg-[#fff7e8] text-[#e78300]" };
export function StatCard({ item, icon: Icon }: { item: Stat; icon: React.ComponentType<{ size?: number }>; }) {
  return <article className="card p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-slate-500">{item.label}</p><strong className="mt-2 block text-2xl text-navy">{item.value}</strong><span className="mt-2 block text-xs text-slate-500">{item.change}</span></div><span className={cn("grid size-11 place-items-center rounded-xl", statTones[item.tone])}><Icon size={21} /></span></div></article>;
}

export function StatusBadge({ value }: { value: string }) {
  const tone = /Thành công|hoạt động|Đã xác minh|Đã xử lý|Đang trả/.test(value) ? "bg-[#eafaf2] text-[#128653]" : /Thất bại|Cao|khóa|Rất cao/.test(value) ? "bg-[#fff0f0] text-[#e0001b]" : /Chờ|Trung bình|thẩm định|xử lý/.test(value) ? "bg-[#fff7e8] text-[#c66b00]" : "bg-[#eef4ff] text-[#1858b8]";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-bold", tone)}>{value}</span>;
}

export function SearchField({ value, onChange, placeholder = "Tìm kiếm..." }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="relative block min-w-56"><Search className="absolute left-3 top-3 text-slate-400" size={18} /><input className="field pl-10" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>;
}

export function DataTable({ headers, rows, searchable = true }: { headers: string[]; rows: string[][]; searchable?: boolean }) {
  const [query, setQuery] = useState(""); const [page, setPage] = useState(1); const size = 5;
  const filtered = useMemo(() => rows.filter((r) => r.join(" ").toLowerCase().includes(query.toLowerCase())), [rows, query]);
  const total = Math.max(1, Math.ceil(filtered.length / size)); const visible = filtered.slice((page - 1) * size, page * size);
  return <div className="card overflow-hidden">
    {searchable && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><SearchField value={query} onChange={(v) => { setQuery(v); setPage(1); }} /><button className="btn-secondary">Bộ lọc</button></div>}
    <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-[#f8f8f8] text-xs uppercase tracking-wide text-[#67708a]"><tr>{headers.map((h) => <th className="px-5 py-4 font-bold" key={h}>{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{visible.map((row, i) => <tr className="transition hover:bg-[#fff7f8]" key={`${row[0]}-${i}`}>{row.map((cell, j) => <td className={cn("px-5 py-4", j === 0 && "font-bold text-navy")} key={`${cell}-${j}`}>{j === row.length - 1 ? <StatusBadge value={cell} /> : cell}</td>)}</tr>)}</tbody></table></div>
    {!visible.length && <div className="p-12 text-center text-sm text-slate-500">Không tìm thấy dữ liệu phù hợp.</div>}
    <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-sm text-slate-500"><span>Hiển thị {visible.length}/{filtered.length} kết quả</span><div className="flex items-center gap-2"><button className="grid size-9 place-items-center rounded-lg border disabled:opacity-30" disabled={page === 1} onClick={() => setPage((x) => x - 1)}><ChevronLeft size={16} /></button><span className="font-bold text-navy">{page}/{total}</span><button className="grid size-9 place-items-center rounded-lg border disabled:opacity-30" disabled={page === total} onClick={() => setPage((x) => x + 1)}><ChevronRight size={16} /></button></div></div>
  </div>;
}

export function Modal({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: React.ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-sm" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><Dialog.Title className="text-xl font-black text-navy">{title}</Dialog.Title><Dialog.Close className="grid size-9 place-items-center rounded-lg hover:bg-slate-100"><X size={18} /></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
