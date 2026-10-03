import { ChevronRight } from "lucide-react";
import Image from "next/image";
import { branchRows } from "./branch-data";

export function BranchSidebar() {
  const best = [branchRows[2], branchRows[0], branchRows[1]];
  return <aside className="grid min-h-0 grid-rows-2 gap-3">
    <article className="card p-3"><h2 className="text-base font-black">Phân bố chi nhánh theo khu vực</h2><div className="mt-3 flex items-center gap-4"><div className="grid size-28 place-items-center rounded-full" style={{ background: "conic-gradient(#ff2442 0 40%,#ffabb7 40% 60%,#ffba4b 60% 100%)" }}><div className="grid size-16 place-items-center rounded-full bg-white text-center"><b className="text-xl">5</b><small>chi nhánh</small></div></div><div className="text-[10px] leading-7">🔴 Miền Bắc　40% (2)<br/>🩷 Miền Trung　20% (1)<br/>🟠 Miền Nam　40% (2)</div></div></article>
    <article className="card p-3"><h2 className="text-base font-black">Chi nhánh hoạt động hiệu quả nhất</h2>{best.map((item, index) => <div className="mt-2 flex items-center gap-2" key={item.code}><b className="grid size-5 place-items-center rounded-full bg-coral text-[9px] text-white">{index + 1}</b><span className="relative size-10 overflow-hidden rounded"><Image alt={item.name} className="object-cover" fill sizes="40px" src={item.image}/></span><span className="min-w-0 flex-1 text-[10px]"><b>{item.name}</b><br/>{item.customers.toLocaleString("vi-VN")} khách hàng</span><ChevronRight className="text-coral" size={15}/></div>)}<button className="mt-3 w-full rounded-lg border border-coral py-2 text-[10px] text-coral">Xem tất cả chi nhánh　→</button></article>
  </aside>;
}
