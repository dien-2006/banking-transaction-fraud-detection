"use client";
import dynamic from "next/dynamic";
const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false, loading: () => <div className="h-72 animate-pulse rounded-xl bg-slate-100" /> });
export function TrendChart({ role }: { role: string }) {
  const customer = role === "customer";
  const option = { tooltip: { trigger: "axis" }, grid: { left: 18, right: 18, top: 25, bottom: 18, containLabel: true }, xAxis: { type: "category", boundaryGap: false, data: ["T2","T3","T4","T5","T6","T7","CN"], axisLine: { lineStyle: { color: "#e7ebf2" } } }, yAxis: { type: "value", splitLine: { lineStyle: { color: "#eef1f6" } } }, series: [{ name: customer ? "Chi tiêu" : "Giao dịch", type: "line", smooth: true, symbol: "circle", symbolSize: 8, data: customer ? [4.2,6.8,5.4,8.9,7.1,10.4,8.2] : [12,16,14,21,18,27,24], lineStyle: { width: 4, color: "#f80820" }, itemStyle: { color: "#f80820" }, areaStyle: { color: "rgba(248,8,32,.12)" } }] };
  return <ReactECharts option={option} style={{ height: 285 }} />;
}
