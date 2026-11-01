"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AnalyticsRow, AnalyticsState } from "@/lib/insights-data";

export function InsightPanel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={`card insight-panel flex min-h-0 min-w-0 flex-col p-3 ${className}`}
    >
      <h2 className="shrink-0 text-sm font-black" title={title}>
        {title}
      </h2>
      <div className="insight-panel-body min-h-0 min-w-0 flex-1">
        {children}
      </div>
    </article>
  );
}

export function AnalyticsBoundary({
  state,
  children,
}: {
  state: AnalyticsState;
  children: ReactNode;
}) {
  if (state.loading)
    return (
      <p
        className="grid h-full min-h-16 place-items-center text-xs text-slate-500"
        aria-busy="true"
      >
        Đang tải dữ liệu Gold…
      </p>
    );
  if (state.error)
    return (
      <p
        className="grid h-full min-h-16 place-items-center p-2 text-center text-xs text-red-600"
        role="alert"
      >
        Không thể tải dữ liệu Gold. Dùng nút làm mới để thử lại.
      </p>
    );
  if (!state.rows.length)
    return (
      <p className="grid h-full min-h-16 place-items-center text-center text-xs text-slate-500">
        Chưa có dữ liệu trong khoảng đã chọn.
      </p>
    );
  return <>{children}</>;
}

export const insightColors = [
  "#f5223e",
  "#ff9aa6",
  "#ffb83e",
  "#45a7ee",
  "#8257ed",
];

export function InsightDonut({
  items,
  label,
}: {
  items: { name: string; value: number }[];
  label: string;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const shown =
    items.length > 4
      ? [
          ...items.slice(0, 3),
          {
            name: "Khác",
            value: items.slice(3).reduce((sum, item) => sum + item.value, 0),
          },
        ]
      : items;
  let offset = 0;
  const gradient = shown
    .map((item, index) => {
      const start = offset;
      offset += total ? (item.value / total) * 100 : 0;
      return `${insightColors[index]} ${start}% ${offset}%`;
    })
    .join(",");
  return (
    <div className="insight-donut-layout flex h-full min-w-0 items-center justify-center gap-4 py-2">
      <div
        className="insight-donut grid size-24 shrink-0 place-items-center rounded-full"
        style={{
          background: total ? `conic-gradient(${gradient})` : "#edf0f5",
        }}
      >
        <div className="grid size-14 place-items-center rounded-full bg-white text-center">
          <b title={total.toLocaleString("vi-VN")}>
            {total.toLocaleString("vi-VN", {
              notation: "compact",
              maximumFractionDigits: 1,
            })}
          </b>
          <span className="text-[9px]">{label}</span>
        </div>
      </div>
      <div className="min-w-0 space-y-1.5 text-[10px]">
        {shown.map((item, index) => (
          <p className="flex min-w-0 items-center gap-2" key={item.name}>
            <i
              className="size-2 shrink-0 rounded-full"
              style={{ background: insightColors[index] }}
            />
            <span className="min-w-0 truncate" title={item.name}>
              {item.name}
            </span>
            <b className="shrink-0">
              {total ? Math.round((item.value / total) * 100) : 0}%
            </b>
          </p>
        ))}
      </div>
    </div>
  );
}

export function InsightBars({
  items,
}: {
  items: { name: string; value: number }[];
}) {
  const maximum = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="insight-bars space-y-2 pt-3 text-[10px]">
      {items.slice(0, 5).map((item, index) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_minmax(32px,1fr)_auto] items-center gap-2"
          key={item.name}
        >
          <span className="truncate" title={item.name}>
            {item.name}
          </span>
          <span className="h-2 rounded bg-slate-100">
            <i
              className="block h-full rounded"
              style={{
                width: `${(item.value / maximum) * 100}%`,
                background: insightColors[index % insightColors.length],
              }}
            />
          </span>
          <b>{item.value.toLocaleString("vi-VN")}</b>
        </div>
      ))}
    </div>
  );
}

export type InsightColumn = {
  key: string;
  label: string;
  format?: (value: unknown) => string;
};
export function InsightTable({
  rows,
  columns,
  pageSize = 5,
}: {
  rows: AnalyticsRow[];
  columns: InsightColumn[];
  pageSize?: number;
}) {
  const [page, setPage] = useState(1);
  const [capacity, setCapacity] = useState(pageSize);
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const header =
        host.querySelector("thead")?.getBoundingClientRect().height ?? 24;
      const row =
        host.querySelector("tbody tr")?.getBoundingClientRect().height ?? 24;
      const footer =
        host.querySelector("footer")?.getBoundingClientRect().height ?? 20;
      const height = host.getBoundingClientRect().height;
      if (height > 0 && row > 0)
        setCapacity(
          Math.max(
            1,
            Math.min(
              pageSize,
              Math.floor((height - header - footer - 8) / row),
            ),
          ),
        );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    measure();
    return () => observer.disconnect();
  }, [pageSize]);
  useEffect(() => setPage(1), [rows, capacity]);
  const pages = Math.max(1, Math.ceil(rows.length / capacity));
  const current = Math.min(page, pages);
  return (
    <div ref={hostRef} className="flex h-full min-h-0 flex-col pt-2">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed text-left text-[10px]">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} title={column.label}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows
              .slice((current - 1) * capacity, current * capacity)
              .map((row, index) => (
                <tr key={(current - 1) * capacity + index}>
                  {columns.map((column) => {
                    const text =
                      row[column.key] == null
                        ? "—"
                        : column.format
                          ? column.format(row[column.key])
                          : String(row[column.key]);
                    return (
                      <td key={column.key} title={text}>
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 pt-1 text-[10px] text-slate-500">
        <span>{rows.length.toLocaleString("vi-VN")} bản ghi</span>
        <div className="flex items-center gap-2">
          <button
            aria-label="Trang trước"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
            className="disabled:opacity-30"
          >
            <ChevronLeft size={14} />
          </button>
          <span>
            {current}/{pages}
          </span>
          <button
            aria-label="Trang sau"
            disabled={current >= pages}
            onClick={() => setPage(current + 1)}
            className="disabled:opacity-30"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </footer>
    </div>
  );
}

export function UnsupportedInsight({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full min-h-16 place-items-center p-3 text-center text-xs text-slate-500">
      {children}
    </div>
  );
}
