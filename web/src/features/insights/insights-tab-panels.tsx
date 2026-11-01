"use client";

import { useState } from "react";
import { Download, Play } from "lucide-react";
import {
  analyticsCsv,
  analyticsDatasets,
  dailyMetrics,
  groupMetric,
  type AnalyticsDataset,
  type InsightsData,
} from "@/lib/insights-data";
import {
  MetricChart,
  ProductGrowth,
  TransactionTrend,
} from "./insights-charts";
import {
  AnalyticsBoundary,
  InsightBars,
  InsightDonut,
  InsightPanel as Panel,
  InsightTable,
  UnsupportedInsight,
} from "./insights-widgets";

const number = (value: unknown) => Number(value).toLocaleString("vi-VN");
const money = (value: unknown) => number(value) + " ₫";
const probability = (value: unknown) =>
  (Number(value) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) +
  "%";
const layout = "insights-tab-grid grid min-h-0 grid-cols-12 grid-rows-2 gap-2";

export function CustomerAnalytics({ data }: { data: InsightsData }) {
  const state = data.logins;
  return (
    <div className={layout}>
      <Panel title="Lượt đăng nhập theo ngày" className="col-span-7">
        <AnalyticsBoundary state={state}>
          <MetricChart
            rows={state.rows}
            metrics={[
              { key: "login_count", name: "Lượt đăng nhập", color: "#f5223e" },
            ]}
          />
        </AnalyticsBoundary>
      </Panel>
      <Panel title="Kết quả đăng nhập" className="col-span-5">
        <AnalyticsBoundary state={state}>
          <InsightDonut
            items={groupMetric(state.rows, "status", "login_count")}
            label="lượt"
          />
        </AnalyticsBoundary>
      </Panel>
      <Panel
        title="Khách hàng đăng nhập theo ngày và trạng thái"
        className="col-span-7"
      >
        <AnalyticsBoundary state={state}>
          <InsightTable
            rows={state.rows}
            columns={[
              { key: "full_date", label: "Ngày" },
              { key: "status", label: "Trạng thái" },
              { key: "login_count", label: "Lượt đăng nhập", format: number },
              {
                key: "customer_count",
                label: "Số KH trong nhóm",
                format: number,
              },
            ]}
          />
        </AnalyticsBoundary>
      </Panel>
      <Panel title="Phân khúc và khách hàng duy nhất" className="col-span-5">
        <UnsupportedInsight>
          API Gold chưa cung cấp phân khúc hoặc số khách hàng duy nhất cho toàn
          kỳ. Số khách hàng theo từng ngày không được cộng thành số khách hàng
          duy nhất.
        </UnsupportedInsight>
      </Panel>
    </div>
  );
}

export function TransactionAnalytics({ data }: { data: InsightsData }) {
  const state = data.transactions;
  return (
    <div className={layout}>
      <Panel title="Số lượng và giá trị giao dịch" className="col-span-8">
        <AnalyticsBoundary state={state}>
          <TransactionTrend rows={state.rows} />
        </AnalyticsBoundary>
      </Panel>
      <Panel title="Giao dịch theo kênh" className="col-span-4">
        <AnalyticsBoundary state={state}>
          <InsightDonut
            items={groupMetric(
              state.rows,
              "channel_key",
              "transaction_count",
            ).map((item) => ({ ...item, name: "Kênh #" + item.name }))}
            label="giao dịch"
          />
        </AnalyticsBoundary>
      </Panel>
      <Panel title="Loại giao dịch theo mã Gold" className="col-span-6">
        <AnalyticsBoundary state={state}>
          <InsightBars
            items={groupMetric(
              state.rows,
              "transaction_type_key",
              "transaction_count",
            ).map((item) => ({ ...item, name: "Loại #" + item.name }))}
          />
        </AnalyticsBoundary>
      </Panel>
      <Panel title="Tổng hợp theo ngày" className="col-span-6">
        <AnalyticsBoundary state={state}>
          <InsightTable
            rows={dailyMetrics(state.rows, [
              "transaction_count",
              "total_amount",
              "total_fee",
            ]).reverse()}
            columns={[
              { key: "day", label: "Ngày" },
              {
                key: "transaction_count",
                label: "Số giao dịch",
                format: number,
              },
              { key: "total_amount", label: "Giá trị", format: money },
              { key: "total_fee", label: "Phí", format: money },
            ]}
          />
        </AnalyticsBoundary>
      </Panel>
    </div>
  );
}

export function ProductAnalytics({ data }: { data: InsightsData }) {
  const state = data.loans;
  return (
    <div className={layout}>
      <Panel title="Thanh toán khoản vay theo ngày" className="col-span-8">
        <AnalyticsBoundary state={state}>
          <ProductGrowth rows={state.rows} />
        </AnalyticsBoundary>
      </Panel>
      <Panel title="Thanh toán theo kênh" className="col-span-4">
        <AnalyticsBoundary state={state}>
          <InsightDonut
            items={groupMetric(state.rows, "payment_channel", "payment_count")}
            label="lượt"
          />
        </AnalyticsBoundary>
      </Panel>
      <Panel title="Chi tiết thanh toán khoản vay" className="col-span-8">
        <AnalyticsBoundary state={state}>
          <InsightTable
            rows={state.rows}
            columns={[
              { key: "full_date", label: "Ngày" },
              { key: "payment_channel", label: "Kênh" },
              { key: "payment_count", label: "Số lượt", format: number },
              { key: "total_paid", label: "Đã trả", format: money },
              { key: "principal_paid", label: "Gốc", format: money },
              { key: "interest_paid", label: "Lãi", format: money },
            ]}
          />
        </AnalyticsBoundary>
      </Panel>
      <Panel title="Hiệu quả và doanh thu sản phẩm" className="col-span-4">
        <UnsupportedInsight>
          Chưa có dataset doanh thu, chi phí và lợi nhuận theo sản phẩm. Tiền
          gốc khách hàng trả không được tính là doanh thu.
        </UnsupportedInsight>
      </Panel>
    </div>
  );
}

export function RiskAnalytics({ data }: { data: InsightsData }) {
  return (
    <div className={layout}>
      <Panel title="Phân bố mức rủi ro" className="col-span-5">
        <AnalyticsBoundary state={data.risk}>
          <InsightDonut
            items={groupMetric(
              data.risk.rows,
              "risk_level",
              "assessment_count",
            )}
            label="đánh giá"
          />
        </AnalyticsBoundary>
      </Panel>
      <Panel title="Quyết định ALLOW / REVIEW / BLOCK" className="col-span-7">
        <AnalyticsBoundary state={data.risk}>
          <InsightBars
            items={groupMetric(data.risk.rows, "decision", "assessment_count")}
          />
        </AnalyticsBoundary>
      </Panel>
      <Panel
        title="Model theo nhãn đã xác minh (không lọc ngày)"
        className="col-span-7"
      >
        <AnalyticsBoundary state={data.models}>
          <InsightTable
            rows={data.models.rows}
            columns={[
              { key: "model_name", label: "Model" },
              { key: "label", label: "Nhãn" },
              {
                key: "labeled_transactions",
                label: "Số giao dịch",
                format: number,
              },
              {
                key: "average_probability",
                label: "Xác suất TB",
                format: probability,
              },
            ]}
          />
        </AnalyticsBoundary>
      </Panel>
      <Panel title="Hiệu suất review" className="col-span-5">
        <AnalyticsBoundary state={data.reviews}>
          <InsightTable
            rows={data.reviews.rows}
            columns={[
              { key: "full_date", label: "Ngày" },
              { key: "status", label: "Trạng thái" },
              { key: "review_count", label: "Số review", format: number },
              {
                key: "average_resolution_seconds",
                label: "Xử lý TB (giây)",
                format: number,
              },
            ]}
          />
        </AnalyticsBoundary>
      </Panel>
    </div>
  );
}

export function CustomReports({ data }: { data: InsightsData }) {
  const [dataset, setDataset] = useState<AnalyticsDataset>("transactions");
  const [name, setName] = useState("Báo cáo D4 Insights");
  const [selected, setSelected] = useState<string[]>([]);
  const [generated, setGenerated] = useState(false);
  const state = data[dataset];
  const columns = Array.from(
    new Set(state.rows.flatMap((row) => Object.keys(row))),
  );
  const fields = selected.length
    ? columns.filter((key) => selected.includes(key))
    : columns;
  const exportCsv = () => {
    const blob = new Blob([analyticsCsv(state.rows, fields)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      (name.trim().replace(/[^\p{L}\p{N} _-]/gu, "") || "d4-insights") + ".csv";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const toggle = (key: string) => {
    setGenerated(false);
    setSelected((current) =>
      current.includes(key)
        ? current.filter((field) => field !== key)
        : [...current, key],
    );
  };
  return (
    <div className="insights-report-grid grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)] gap-2">
      <Panel title="Cấu hình báo cáo">
        <div className="flex h-full min-h-0 flex-col gap-3 pt-3">
          <label className="text-xs">
            Tên báo cáo
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border px-2"
            />
          </label>
          <label className="text-xs">
            Bộ dữ liệu
            <select
              value={dataset}
              onChange={(event) => {
                setDataset(event.target.value as AnalyticsDataset);
                setSelected([]);
                setGenerated(false);
              }}
              className="mt-1 h-9 w-full rounded-lg border px-2"
            >
              {Object.entries(analyticsDatasets).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[10px] text-slate-500">
            Để trống lựa chọn cột để xuất toàn bộ cột. Model không có bộ lọc
            ngày.
          </p>
          <div className="min-h-0 flex-1 overflow-auto">
            {columns.map((key) => (
              <label className="flex items-center gap-2 py-1 text-xs" key={key}>
                <input
                  type="checkbox"
                  checked={selected.includes(key)}
                  onChange={() => toggle(key)}
                />
                <span className="truncate" title={key}>
                  {key}
                </span>
              </label>
            ))}
          </div>
          <button
            disabled={state.loading || !!state.error || !state.rows.length}
            onClick={() => setGenerated(true)}
            className="btn-primary h-9 shrink-0 disabled:opacity-40"
          >
            <Play size={14} />
            Tạo báo cáo
          </button>
        </div>
      </Panel>
      <Panel title={name || "Xem trước báo cáo"}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 justify-end py-2">
            <button
              disabled={!generated || !state.rows.length || !!state.error}
              onClick={exportCsv}
              className="btn-secondary h-8 disabled:opacity-40"
            >
              <Download size={14} />
              Xuất CSV
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <AnalyticsBoundary state={state}>
              {generated ? (
                <InsightTable
                  rows={state.rows}
                  columns={fields.map((key) => ({ key, label: key }))}
                  pageSize={10}
                />
              ) : (
                <UnsupportedInsight>
                  Chọn bộ dữ liệu và nhấn “Tạo báo cáo” để xem trước.
                </UnsupportedInsight>
              )}
            </AnalyticsBoundary>
          </div>
        </div>
      </Panel>
    </div>
  );
}
