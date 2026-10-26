"use client";
import dynamic from "next/dynamic";
import type {Transaction} from "@/types";
const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false, loading: () => <div className="h-72 animate-pulse rounded-xl bg-slate-100" /> });
export function TrendChart({transactions=[]}: {role?:string;transactions?:Transaction[]}) {
  const points=transactions.slice().reverse();
  const option = { tooltip: { trigger: "axis" }, grid: { left: 18, right: 18, top: 25, bottom: 18, containLabel: true }, xAxis: { type: "category", boundaryGap: false, data: points.map(item=>item.id), axisLine: { lineStyle: { color: "#e7ebf2" } } }, yAxis: { type: "value", splitLine: { lineStyle: { color: "#eef1f6" } } }, series: [{ name: "Giá trị giao dịch", type: "line", smooth: true, symbol: "circle", symbolSize: 8, data: points.map(item=>item.amount), lineStyle: { width: 4, color: "#f80820" }, itemStyle: { color: "#f80820" }, areaStyle: { color: "rgba(248,8,32,.12)" } }] };
  return <ReactECharts option={option} style={{ height: 285 }} />;
}
