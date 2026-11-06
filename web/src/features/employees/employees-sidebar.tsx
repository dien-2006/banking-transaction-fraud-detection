"use client";
import { DistributionChart } from "@/components/distribution-chart";

import { UsersRound } from "lucide-react";
import type { EmployeeRow } from "./employee-data";

export function EmployeesSidebar({
  rows,
  ready,
  error = false,
  onShowAll,
}: {
  rows: EmployeeRow[];
  ready: boolean;
  error?: boolean;
  onShowAll: () => void;
}) {
  const counts = new Map<string, number>();
  rows.forEach((row) =>
    counts.set(row.branch, (counts.get(row.branch) ?? 0) + 1),
  );
  const branches = Array.from(counts, ([label, count]) => ({
    label,
    count,
  })).sort((a, b) => b.count - a.count);
  const groups =
    branches.length > 4
      ? [
          ...branches.slice(0, 4),
          {
            label: "Các chi nhánh khác",
            count: branches.slice(4).reduce((sum, row) => sum + row.count, 0),
          },
        ]
      : branches;
  const latest = [...rows]
    .sort(
      (a, b) =>
        (Date.parse(b.hireDate) || 0) - (Date.parse(a.hireDate) || 0) ||
        Number(b.id) - Number(a.id),
    )
    .slice(0, 3);
  return (
    <aside className="employee-summary-panels grid min-h-0 grid-rows-2 gap-3">
      <article className="card p-3">
        <h2 className="text-base font-black">Phân bổ nhân sự theo chi nhánh</h2>
        <DistributionChart
          items={groups.map((group) => ({
            label: group.label,
            value: group.count,
          }))}
          label="nhân viên"
          ready={ready}
          error={error}
        />
        <p className="mt-1 text-xs text-slate-500">
          {ready
            ? rows.filter((row) => row.status === "Đang làm việc").length
            : "—"}{" "}
          đang làm việc
        </p>
      </article>
      <article className="card flex min-h-0 flex-col p-3">
        <h2 className="text-base font-black">Nhân viên mới nhất</h2>
        <div className="mt-2 space-y-2">
          {latest.map((row, i) => (
            <div className="flex items-center gap-2" key={row.id}>
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-coral text-[10px] font-bold text-white">
                {i + 1}
              </span>
              <span className="grid size-8 shrink-0 place-items-center rounded bg-[#fff0f0] text-coral">
                <UsersRound size={15} />
              </span>
              <p className="min-w-0 text-[10px]">
                <b className="block truncate">{row.name}</b>
                <span className="block truncate text-slate-500">
                  {row.position} · {row.branch}
                </span>
              </p>
            </div>
          ))}
        </div>
        <button
          onClick={onShowAll}
          className="mt-auto h-7 rounded-md border border-coral text-[10px] text-coral"
        >
          Xem tất cả nhân viên →
        </button>
      </article>
    </aside>
  );
}
