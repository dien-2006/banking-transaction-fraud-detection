"use client";
import { UsersRound } from "lucide-react";
import type { EmployeeRow } from "./employee-data";

export function EmployeesSidebar({
  rows,
  ready,
  onShowAll,
}: {
  rows: EmployeeRow[];
  ready: boolean;
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
  const colors = ["#ff2143", "#ff9dad", "#ffbb4b", "#459cdb", "#8459e5"];
  let cursor = 0;
  const gradient = groups
    .map((group, i) => {
      const start = cursor;
      cursor += (group.count / Math.max(rows.length, 1)) * 100;
      return `${colors[i]} ${start}% ${cursor}%`;
    })
    .join(",");
  const latest = [...rows]
    .sort(
      (a, b) =>
        (Date.parse(b.hireDate) || 0) - (Date.parse(a.hireDate) || 0) ||
        Number(b.id) - Number(a.id),
    )
    .slice(0, 3);
  return (
    <aside className="grid min-h-0 grid-rows-2 gap-3">
      <article className="card p-3">
        <h2 className="text-base font-black">Phân bổ nhân sự theo chi nhánh</h2>
        <div className="flex items-center gap-4 pt-2">
          <div
            className="grid size-28 shrink-0 place-items-center rounded-full"
            style={{
              background: rows.length
                ? `conic-gradient(${gradient})`
                : "#edf0f5",
            }}
          >
            <div className="grid size-16 place-items-center rounded-full bg-white text-center">
              <b className="text-xl">{ready ? rows.length : "—"}</b>
              <span className="text-[9px]">nhân viên</span>
            </div>
          </div>
          <div className="min-w-0 space-y-2 text-[10px]">
            {groups.map((group, i) => (
              <p key={group.label} title={group.label} className="truncate">
                <i
                  className="mr-1 inline-block size-2 rounded-full"
                  style={{ background: colors[i] }}
                />
                {group.label}{" "}
                <b>
                  {Math.round((group.count / rows.length) * 100)}% (
                  {group.count})
                </b>
              </p>
            ))}
            {ready && !rows.length && <p>Chưa có dữ liệu nhân viên.</p>}
            <p className="text-slate-500">
              {ready
                ? rows.filter((row) => row.status === "Đang làm việc").length
                : "—"}{" "}
              đang làm việc
            </p>
          </div>
        </div>
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
