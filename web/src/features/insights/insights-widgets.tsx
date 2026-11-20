"use client";
import {
  DistributionChart,
  distributionColors,
} from "@/components/distribution-chart";
import { recordStatusLabels } from "@/lib/record-status";
import { riskLabels, reviewLabels } from "@/lib/fraud-data";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AnalyticsRow, AnalyticsState } from "@/lib/insights-data";

export function InsightPanel({
  title,
  children,
  className = "",
  description,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  description?: string;
}) {
  return (
    <article
      className={`card insight-panel flex min-h-0 min-w-0 flex-col p-3 ${className}`}
    >
      <header className="insight-panel-heading">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </header>
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

export const insightColors = distributionColors;
const statusColors: Record<string, string> = {
  LOW: "#18a777", MEDIUM: "#e9a521", HIGH: "#f07835", CRITICAL: "#ed3758",
  ALLOW: "#18a777", REVIEW: "#e9a521", BLOCK: "#ed3758",
  Success: "#18a777", Failed: "#ed3758", Pending: "#438dec", Cancelled: "#94a3b8",
  APPROVED: "#18a777", REJECTED: "#ed3758", OPEN: "#e9a521", IN_REVIEW: "#438dec", CLOSED: "#94a3b8",
};
const insightLabel = (name: string) => recordStatusLabels[name] ?? riskLabels[name] ?? reviewLabels[name] ?? name;
const insightPercent = (percent: number) => percent > 0 && percent < 0.01
  ? "<0,01%" : percent.toLocaleString("vi-VN", {maximumFractionDigits: 2}) + "%";

export function InsightDonut({
  items,
  label,
}: {
  items: { name: string; value: number }[];
  label: string;
}) {
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
  return (
    <DistributionChart
      items={shown.map((item) => ({
        label: insightLabel(item.name),
        color: statusColors[item.name],
        value: item.value,
      }))}
      label={label}
      formatPercentage={insightPercent}

    />
  );
}

export function InsightBars({
  items,
}: {
  items: { name: string; value: number }[];
}) {
  const maximum = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="insight-bars">
      {items.slice(0, 5).map((item, index) => (
        <div className="insight-bar-row" key={item.name}>
          <div className="insight-bar-label">
            <span>{insightLabel(item.name)}</span>
            <b>{item.value.toLocaleString("vi-VN")}</b>
          </div>
          <div className="insight-bar-track" aria-hidden="true">
            <i style={{width: `${(item.value / maximum) * 100}%`,
              background: statusColors[item.name] ?? insightColors[index % insightColors.length]}} />
          </div>
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
    <div ref={hostRef} className="insight-table-host flex h-full min-h-0 flex-col">
      <div className="insight-table-scroll min-h-0 flex-1 overflow-auto">
        <table className="insight-table w-full text-left">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} title={column.label} className={column.format ? "insight-number" : undefined}>
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
                      <td key={column.key} title={text} className={column.format ? "insight-number" : undefined}>
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
