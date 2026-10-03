"use client";

import { Building2, CalendarDays, Camera, Mail, Phone, ShieldCheck, UserRound, X } from "lucide-react";
import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { SessionUser } from "@/types";

export function ProfilePanel({ user, roleLabel, avatarUrl, onAvatarChange, onClose }: { user: SessionUser; roleLabel: string; avatarUrl: string | null; onAvatarChange: (url: string) => void; onClose: () => void }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ pointerX: number; pointerY: number; offsetX: number; offsetY: number } | null>(null);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, label, input")) return;
    drag.current = { pointerX: event.clientX, pointerY: event.clientY, offsetX: offset.x, offsetY: offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePanel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setOffset({
      x: drag.current.offsetX + event.clientX - drag.current.pointerX,
      y: drag.current.offsetY + event.clientY - drag.current.pointerY,
    });
  };

  const stopDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const details = [
    ["Tên đăng nhập", user.username, UserRound],
    [user.role === "customer" ? "Mã khách hàng" : "Mã nhân viên", user.employeeCode, ShieldCheck],
    ["Điện thoại", user.phone, Phone],
    ["Email", user.email, Mail],
    ["Ngày sinh", user.dateOfBirth, CalendarDays],
    ["Giới tính", user.gender, UserRound],
  ] as const;

  return <section aria-label="Hồ sơ người dùng" className="fixed right-5 top-20 z-50 flex size-[min(32rem,calc(100vw-2rem))] max-h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-xl border border-red-100 bg-white shadow-[0_24px_70px_rgba(248,8,32,.2)]" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
    <div aria-label="Kéo để di chuyển" className="h-2 shrink-0 touch-none cursor-move bg-gradient-to-r from-[#f80820] to-[#ff4f61]" onPointerDown={startDrag} onPointerMove={movePanel} onPointerUp={stopDrag} onPointerCancel={stopDrag}/>
    <div className="relative cursor-move overflow-hidden bg-gradient-to-br from-[#fff1f3] via-white to-[#fff7f8] px-5 py-4" onPointerDown={startDrag} onPointerMove={movePanel} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
      <div className="absolute -right-10 -top-12 size-36 rounded-full bg-coral/10"/>
      <button aria-label="Đóng hồ sơ" className="absolute right-3 top-3 z-10 grid size-8 cursor-pointer place-items-center rounded-lg text-slate-500 transition hover:bg-[#ffe9ec] hover:text-coral" onClick={onClose}><X size={18}/></button>
      <div className="relative flex items-center gap-4">
        <label className="group relative grid size-[76px] shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-coral to-[#ff5c6d] text-2xl font-black text-white shadow-lg shadow-red-200" title="Thay đổi ảnh đại diện">{avatarUrl ? <img alt={`Ảnh đại diện ${user.name}`} className="size-full object-cover" src={avatarUrl}/> : user.name.slice(0, 1)}<span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-1 text-[9px] font-semibold opacity-0 transition group-hover:opacity-100"><Camera size={11}/>Đổi ảnh</span><input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>{const file=event.target.files?.[0]; if(file && file.size<=5*1024*1024) onAvatarChange(URL.createObjectURL(file));}}/></label>
        <div className="min-w-0 pr-9"><h2 className="truncate text-xl font-black text-slate-900">{user.name}</h2><p className="mt-1 text-sm font-semibold text-slate-500">{roleLabel}</p><button className="mt-2 inline-flex cursor-pointer items-center gap-1 text-[11px] font-bold text-coral" onClick={()=>document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}><Camera size={13}/>Thay ảnh đại diện</button></div>
      </div>
    </div>
    <div className="flex-1 p-4 pt-3">
      <div className="grid grid-cols-2 gap-2">{details.map(([label,value,Icon])=><div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5" key={label}><span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400"><Icon className="text-coral" size={12}/>{label}</span><p className="mt-1 truncate text-[13px] font-bold text-slate-900" title={value}>{value ?? "Chưa cập nhật"}</p></div>)}</div>
      <div className="mt-2 rounded-lg border border-red-100 bg-[#fffafa] px-3 py-2.5"><p className="flex items-center gap-2 text-[10px] font-semibold text-slate-400"><Building2 className="text-coral" size={13}/>Chi nhánh công tác</p><div className="mt-1 flex items-center justify-between gap-4"><b className="truncate text-[13px] text-slate-900" title={user.branchName}>{user.branchName ?? "Chưa cập nhật"}</b><span className="shrink-0 rounded-md bg-[#ffe9ec] px-2 py-1 text-[10px] font-bold text-coral">{user.branchCode ?? "—"}</span></div></div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]"><div className="rounded-lg bg-slate-50 px-3 py-2.5"><dt className="text-slate-400">Đăng nhập gần nhất</dt><dd className="mt-1 font-bold text-slate-900">{user.lastLogin ?? "Chưa ghi nhận"}</dd></div><div className="rounded-lg bg-slate-50 px-3 py-2.5"><dt className="text-slate-400">Ngày {user.role === "customer" ? "đăng ký" : "vào làm"}</dt><dd className="mt-1 font-bold text-slate-900">{user.role === "customer" ? user.createdAt : user.hireDate}</dd></div></dl>
      <p className="mt-2 text-center text-[10px] text-slate-400">Giữ thanh tiêu đề để di chuyển cửa sổ</p>
    </div>
  </section>;
}
