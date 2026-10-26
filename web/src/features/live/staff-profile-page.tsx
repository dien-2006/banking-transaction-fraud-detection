"use client";
import {useMutation} from "@tanstack/react-query";
import {CircleUserRound,KeyRound} from "lucide-react";
import {useSessionUser} from "@/components/session-context";
import {authService} from "@/services/auth.service";

export function StaffProfilePage(){
  const user=useSessionUser();
  const mutation=useMutation({mutationFn:({oldPassword,newPassword}:{oldPassword:string;newPassword:string})=>authService.changePassword(oldPassword,newPassword)});
  const change=()=>{const oldPassword=window.prompt("Mật khẩu hiện tại:");if(!oldPassword)return;const newPassword=window.prompt("Mật khẩu mới (ít nhất 8 ký tự):");if(!newPassword)return;mutation.mutate({oldPassword,newPassword});};
  return <div className="space-y-4 text-navy"><section className="d4-banner relative overflow-hidden rounded-xl border border-red-50 p-6"><div className="d4-city"/><div className="relative flex items-center gap-4"><span className="grid size-12 place-items-center rounded-xl bg-[#fff0f0] text-coral"><CircleUserRound/></span><div><p className="text-xs font-bold text-coral">D4 BANK</p><h1 className="text-3xl font-black">Hồ sơ nhân viên</h1></div></div></section><section className="card p-6"><div className="grid gap-4 sm:grid-cols-2">{[["Họ tên",user.name],["Vai trò",user.subtitle],["Mã nhân viên",user.employeeCode],["Email",user.email??"—"],["Điện thoại",user.phone??"—"],["Chi nhánh",user.branchId??"—"]].map(([label,value])=><p className="rounded-xl bg-slate-50 p-4" key={String(label)}><small className="block text-slate-500">{label}</small><b>{value}</b></p>)}</div><button className="btn-primary mt-5" onClick={change} disabled={mutation.isPending}><KeyRound size={16}/>{mutation.isPending?"Đang đổi...":"Đổi mật khẩu"}</button>{mutation.isError&&<p className="mt-3 text-sm text-red-600">{mutation.error.message}</p>}{mutation.isSuccess&&<p className="mt-3 text-sm text-emerald-700">Đổi mật khẩu thành công.</p>}</section></div>;
}
