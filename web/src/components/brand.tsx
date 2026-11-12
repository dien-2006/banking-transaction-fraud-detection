import { cn } from "@/lib/utils";
import { useId } from "react";

export function BrandMark() {
  const gradientId = useId();
  return <span aria-hidden="true" className="flex h-[34px] w-7 shrink-0">
    <svg viewBox="0 0 55 65" width="100%" height="100%" fill="none">
      <defs>
        <linearGradient id={gradientId} x1="27.5" y1="0" x2="27.5" y2="65" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff0024" />
          <stop offset=".6" stopColor="#ff6b82" />
          <stop offset="1" stopColor="#0648f5" />
        </linearGradient>
      </defs>
      <rect x="0" y="35" width="15" height="30" rx="7.5" fill="#0648f5" />
      <rect x="20" y="19" width="15" height="46" rx="7.5" fill="#ff0024" />
      <rect x="40" y="0" width="15" height="65" rx="7.5" fill="#0648f5" />
      <rect x="0" y="35" width="15" height="22" rx="7.5" fill="#ff6b82" />
      <rect x="20" y="19" width="15" height="37" rx="7.5" fill={`url(#${gradientId})`} />
      <rect x="40" y="0" width="15" height="55" rx="7.5" fill={`url(#${gradientId})`} />
    </svg>
  </span>;
}

export function Brand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return <div className="flex min-w-0 items-center gap-1.5" aria-label="D4 Bank — Data for a brighter tomorrow">
    <BrandMark />
    {!compact && <span className="min-w-0"><span className={cn("block whitespace-nowrap text-[18px] font-extrabold leading-none tracking-[-1px]", inverse ? "text-white" : "text-[#0648f5]")}>D4 <span className="text-[#ff0024]">Bank</span></span><small className={cn("mt-1 block text-[8px] leading-snug", inverse ? "text-blue-100" : "text-[#1041d6]")}>Data for a brighter tomorrow</small></span>}
  </div>;
}
