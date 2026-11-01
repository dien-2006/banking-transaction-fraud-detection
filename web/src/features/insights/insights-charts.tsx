"use client";

import dynamic from "next/dynamic";
import { dailyMetrics, type AnalyticsRow } from "@/lib/insights-data";

const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false,
  loading: () => (
    <div className="h-full animate-pulse rounded-lg bg-slate-50" />
  ),
});

export function MetricChart({
  rows,
  metrics,
  moneyAxis = false,
}: {
  rows: AnalyticsRow[];
  metrics: { key: string; name: string; color: string; axis?: number }[];
  moneyAxis?: boolean;
}) {
  const points = dailyMetrics(
    rows,
    metrics.map((metric) => metric.key),
  );
  const compact = (value: number) =>
    value.toLocaleString("vi-VN", {
      notation: "compact",
      maximumFractionDigits: 1,
    });
  return (
    <ReactECharts
      notMerge
      style={{ height: "100%", width: "100%" }}
      option={{
        animation: false,
        color: metrics.map((metric) => metric.color),
        tooltip: { trigger: "axis", confine: true },
        legend: {
          top: 0,
          right: 4,
          type: "scroll",
          textStyle: { fontSize: 10 },
        },
        grid: { left: 8, right: 8, top: 30, bottom: 8, containLabel: true },
        xAxis: {
          type: "category",
          data: points.map((point) => point.day),
          axisLabel: { fontSize: 9, hideOverlap: true },
        },
        yAxis: [
          {
            type: "value",
            min: 0,
            minInterval: 1,
            axisLabel: { fontSize: 9, formatter: compact },
            splitLine: { lineStyle: { color: "#eef1f6" } },
          },
          ...(moneyAxis
            ? [
                {
                  type: "value",
                  min: 0,
                  axisLabel: {
                    fontSize: 9,
                    formatter: (value: number) => compact(value) + " ₫",
                  },
                  splitLine: { show: false },
                },
              ]
            : []),
        ],
        series: metrics.map((metric) => ({
          name: metric.name,
          type: "line",
          smooth: false,
          showSymbol: points.length < 20,
          yAxisIndex: metric.axis ?? 0,
          data: points.map((point) =>
            Number((point as Record<string, unknown>)[metric.key] ?? 0),
          ),
        })),
        aria: { enabled: true },
      }}
    />
  );
}

export function TransactionTrend({ rows = [] }: { rows?: AnalyticsRow[] }) {
  return (
    <MetricChart
      rows={rows}
      moneyAxis
      metrics={[
        { key: "transaction_count", name: "Số giao dịch", color: "#f5223e" },
        { key: "total_amount", name: "Giá trị (₫)", color: "#45a7ee", axis: 1 },
      ]}
    />
  );
}

export function ProductGrowth({ rows = [] }: { rows?: AnalyticsRow[] }) {
  return (
    <MetricChart
      rows={rows}
      metrics={[
        { key: "principal_paid", name: "Gốc đã trả (₫)", color: "#f5223e" },
        { key: "interest_paid", name: "Lãi đã trả (₫)", color: "#ff9aa6" },
        { key: "penalty_fee", name: "Phí phạt (₫)", color: "#ffb83e" },
      ]}
    />
  );
}
