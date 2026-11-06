import { DistributionChart } from "@/components/distribution-chart";
import { ChevronRight } from "lucide-react";
import Image from "next/image";

export type BranchView = {
  id: number;
  code: string;
  name: string;
  address: string;
  city: string;
  region: string;
  staff: number;
  customers: number;
  status: string;
  image: string;
};
export function BranchSidebar({
  rows,
  ready = true,
  error = false,
}: {
  rows: BranchView[];
  ready?: boolean;
  error?: boolean;
}) {
  const regions = ["Miền Bắc", "Miền Trung", "Miền Nam"].map((name) => ({
    name,
    count: rows.filter((row) => row.region === name).length,
  }));
  const best = [...rows].sort((a, b) => b.customers - a.customers).slice(0, 3);
  return (
    <aside className="grid min-h-0 grid-rows-2 gap-3">
      <article className="card p-3">
        <h2 className="text-base font-black">Phân bố chi nhánh theo khu vực</h2>
        <DistributionChart
          items={regions.map((item) => ({
            label: item.name,
            value: item.count,
          }))}
          label="chi nhánh"
          ready={ready}
          error={error}
        />
      </article>
      <article className="card p-3">
        <h2 className="text-base font-black">
          Chi nhánh có nhiều khách hàng nhất
        </h2>
        {best.map((item, index) => (
          <div className="mt-2 flex items-center gap-2" key={item.code}>
            <b className="grid size-5 place-items-center rounded-full bg-coral text-[9px] text-white">
              {index + 1}
            </b>
            <span className="relative size-10 overflow-hidden rounded">
              <Image
                alt={item.name}
                className="object-cover"
                fill
                sizes="40px"
                src={item.image}
              />
            </span>
            <span className="min-w-0 flex-1 text-[10px]">
              <b>{item.name}</b>
              <br />
              {item.customers.toLocaleString("vi-VN")} khách hàng
            </span>
            <ChevronRight className="text-coral" size={15} />
          </div>
        ))}
      </article>
    </aside>
  );
}
