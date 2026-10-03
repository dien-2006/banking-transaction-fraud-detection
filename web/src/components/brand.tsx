import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ compact = false, inverse = false, customer = false }: { compact?: boolean; inverse?: boolean; customer?: boolean }) {
  if (customer) return <div className="customer-brand"><span className="customer-brand-bars" aria-hidden="true"><i/><i/><i/></span><span><b>D4 <span>Bank</span></b><small>Data for a brighter tomorrow</small></span></div>;
  return <div className="flex min-w-0 items-center gap-2">
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-coral text-white shadow-lg shadow-red-200"><BarChart3 size={21} /></span>
    {!compact && <span><span className={cn("block text-base font-black tracking-tight", inverse ? "text-white" : "text-navy")}>D4 <span className="text-coral">Bank</span></span><small className={cn("block text-[7px] font-semibold", inverse ? "text-blue-100" : "text-slate-400")}>Data for a brighter tomorrow</small></span>}
  </div>;
}
