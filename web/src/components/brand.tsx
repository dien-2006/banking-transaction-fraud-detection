import { cn } from "@/lib/utils";

export function BrandMark() {
  return <span aria-hidden="true" className="flex h-[34px] w-7 shrink-0 items-end gap-[3px]">
    {[46, 72, 100].map(height => <i key={height} className="block flex-1 rounded-full" style={{height: `${height}%`, background: "linear-gradient(180deg, #ff0829 0%, #ff6a81 69%, #0648f5 70%)"}} />)}
  </span>;
}

export function Brand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return <div className="flex min-w-0 items-center gap-1.5" aria-label="D4 Bank — Data for a brighter tomorrow">
    <BrandMark />
    {!compact && <span className="min-w-0"><span className={cn("block whitespace-nowrap text-[18px] font-extrabold leading-none tracking-[-1px]", inverse ? "text-white" : "text-[#0648f5]")}>D4 <span className="text-[#ff0024]">Bank</span></span><small className={cn("mt-1 block text-[8px] leading-snug", inverse ? "text-blue-100" : "text-[#1041d6]")}>Data for a brighter tomorrow</small></span>}
  </div>;
}
