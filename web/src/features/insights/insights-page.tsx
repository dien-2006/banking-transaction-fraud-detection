"use client";

import {
  ArrowLeftRight,
  Coins,
  Filter,
  HandCoins,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { StaffHero } from "@/components/staff-hero";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { apiRequest, toQuery } from "@/services/api.client";
import { formatDateTime } from "@/lib/presentation";
import { reviewLabels } from "@/lib/fraud-data";
import {
  analyticsDatasets,
  validateAnalyticsSnapshot,
  dailyMetrics,
  filterAnalyticsRows,
  groupMetric,
  sumMetric,
  type AnalyticsDataset,
  type InsightsData,
} from "@/lib/insights-data";
import {
  MetricChart,
  ProductGrowth,
  TransactionTrend,
} from "./insights-charts";
import {
  CustomerAnalytics,
  CustomReports,
  ProductAnalytics,
  RiskAnalytics,
  TransactionAnalytics,
} from "./insights-tab-panels";
import {
  AnalyticsBoundary,
  InsightBars,
  InsightDonut,
  InsightPanel as Panel,
  InsightTable,
} from "./insights-widgets";

const datasets = Object.keys(analyticsDatasets) as AnalyticsDataset[];
const tabs = [
  "Tổng quan phân tích",
  "Phân tích khách hàng",
  "Phân tích giao dịch",
  "Phân tích sản phẩm",
  "Phân tích rủi ro",
  "Báo cáo tùy chỉnh",
];
const number = (value: unknown) => Number(value).toLocaleString("vi-VN");
const money = (value: unknown) => number(value) + " ₫";

function InsightHero() {
  return (
    <StaffHero
      kind="insights"
      eyebrow="D4 INSIGHTS"
      title="Phân tích"
      accent="dữ liệu"
      description="Theo dõi giao dịch, rủi ro và hiệu suất từ dữ liệu Gold."
    />
  );
}

export function InsightsPage({
  role = "admin",
}: {
  role?: "admin" | "employee";
}) {
  const [tab, setTab] = useState(tabs[0]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const [dateError, setDateError] = useState("");
  const snapshot = useQuery({
    queryKey: ["insights-gold", role, range.from, range.to],
    queryFn: () =>
      apiRequest<unknown>(
        "/analytics/snapshot" +
          toQuery({ limit: 1000, from: range.from, to: range.to }),
      ).then(validateAnalyticsSnapshot),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const queries = datasets.map((dataset) => ({
    ...snapshot,
    data: snapshot.data?.datasets[dataset],
  }));
  const data = useMemo(
    () =>
      Object.fromEntries(
        datasets.map((dataset, index) => {
          const query = queries[index];
          const rows = query.data ?? [];
          return [
            dataset,
            {
              rows:
                dataset === "models"
                  ? rows
                  : filterAnalyticsRows(rows, range.from, range.to),
              loading: query.isPending,
              error: query.isError ? query.error.message : null,
              truncated: rows.length >= 1000,
            },
          ];
        }),
      ) as InsightsData,
    [queries, range],
  );
  const applyRange = (event: FormEvent) => {
    event.preventDefault();
    if (from && to && from > to) {
      setDateError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
      return;
    }
    setDateError("");
    setRange({ from, to });
  };
  const metric = (
    dataset: AnalyticsDataset,
    field: string,
    monetary = false,
  ) => {
    const state = data[dataset];
    if (state.loading || state.error) return "—";
    const value = sumMetric(state.rows, field);
    return monetary
      ? value.toLocaleString("vi-VN", {
          notation: "compact",
          maximumFractionDigits: 2,
        }) + " ₫"
      : number(value);
  };
  const kpis = [
    {
      Icon: ArrowLeftRight,
      label: "Số giao dịch",
      value: metric("transactions", "transaction_count"),
    },
    {
      Icon: Coins,
      label: "Giá trị giao dịch",
      value: metric("transactions", "total_amount", true),
    },
    {
      Icon: ShieldAlert,
      label: "Đánh giá rủi ro",
      value: metric("risk", "assessment_count"),
    },
    {
      Icon: HandCoins,
      label: "Đã trả khoản vay",
      value: metric("loans", "total_paid", true),
    },
  ];
  const limited = datasets.some((dataset) => data[dataset].truncated);
  return (
    <div className="d4-insights-page insights-page-content flex flex-col gap-2.5 text-navy">
      <InsightHero />
      <p className="px-1 text-xs text-slate-500" role="note">
        Dữ liệu Gold được cập nhật sau mỗi lần batch hoàn tất. Sự kiện stream
        được lưu vào Bronze để đối soát; biểu đồ này không cập nhật trực tiếp từ
        Kafka.
      </p>
      <section className="grid grid-cols-4 gap-3">
        {kpis.map(({ Icon, label, value }) => (
          <article
            className="card flex min-w-0 items-center gap-3 p-3"
            key={label}
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#ffe9ec] text-coral">
              <Icon size={21} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs" title={label}>
                {label}
              </p>
              <b className="block truncate text-2xl" title={value}>
                {value}
              </b>
              <small className="block text-[9px] text-slate-500">
                Trong dữ liệu Gold đã tải
              </small>
            </div>
          </article>
        ))}
      </section>
      {snapshot.data?.release.published_at && (
        <p className="px-1 text-xs text-slate-500">
          Bản dữ liệu đã kiểm tra · Cập nhật:{" "}
          {formatDateTime(
            snapshot.data.release.published_at.replace(" ", "T") + "Z",
          )}
        </p>
      )}
      <section className="insights-toolbar card flex flex-wrap items-center gap-2 px-3">
        <nav
          aria-label="Các mục D4 Insights"
          className="insights-tabs flex min-w-0 flex-1 gap-2"
        >
          {tabs
            .filter(
              (label) => role !== "employee" || label !== "Báo cáo tùy chỉnh",
            )
            .map((label) => (
              <button
                key={label}
                aria-current={tab === label ? "page" : undefined}
                className={
                  "shrink-0 border-b-2 px-2 py-2 text-xs " +
                  (tab === label
                    ? "border-coral font-semibold text-coral"
                    : "border-transparent")
                }
                onClick={() => setTab(label)}
              >
                {label}
              </button>
            ))}
        </nav>
        <form
          className="insights-dates flex flex-wrap items-center gap-2"
          onSubmit={applyRange}
        >
          <input
            type="date"
            aria-label="Từ ngày"
            title="Từ ngày"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="h-8 rounded-lg border px-2 text-[10px]"
          />
          <span aria-hidden="true">–</span>
          <input
            type="date"
            aria-label="Đến ngày"
            title="Đến ngày"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="h-8 rounded-lg border px-2 text-[10px]"
          />
          <button type="submit" className="btn-secondary h-8 px-2 text-[10px]">
            <Filter size={13} />
            Lọc
          </button>
          <button
            type="button"
            aria-label="Làm mới dữ liệu Gold"
            title="Làm mới dữ liệu Gold"
            disabled={queries.some((query) => query.isFetching)}
            onClick={() => void snapshot.refetch()}
            className="btn-secondary h-8 px-2 disabled:opacity-40"
          >
            <RefreshCw size={13} />
          </button>
        </form>
        <p
          className={
            "insights-coverage w-full pb-1 text-[10px] " +
            (dateError || limited ? "text-amber-700" : "text-slate-500")
          }
          role={dateError ? "alert" : undefined}
        >
          {dateError ||
            (limited
              ? "Đã chạm giới hạn 1.000 bản ghi của ít nhất một tập Gold; thống kê có thể chưa đầy đủ."
              : "Nguồn: MinIO Gold qua Trino · Thống kê trên dữ liệu đã tải, theo ngày đã chọn; model không lọc ngày.")}
        </p>
      </section>
      {tab === "Phân tích khách hàng" ? (
        <CustomerAnalytics data={data} />
      ) : tab === "Phân tích giao dịch" ? (
        <TransactionAnalytics data={data} />
      ) : tab === "Phân tích sản phẩm" ? (
        <ProductAnalytics data={data} />
      ) : tab === "Phân tích rủi ro" ? (
        <RiskAnalytics data={data} />
      ) : tab === "Báo cáo tùy chỉnh" ? (
        <CustomReports data={data} />
      ) : (
        <div className="insights-overview-grid grid min-h-0 grid-cols-3 grid-rows-[minmax(0,18fr)_minmax(0,11fr)_minmax(0,11fr)] gap-2">
          <Panel title="Xu hướng giao dịch theo thời gian">
            <AnalyticsBoundary state={data.transactions}>
              <TransactionTrend rows={data.transactions.rows} />
            </AnalyticsBoundary>
          </Panel>
          <Panel title="Thanh toán khoản vay theo ngày">
            <AnalyticsBoundary state={data.loans}>
              <ProductGrowth rows={data.loans.rows} />
            </AnalyticsBoundary>
          </Panel>
          <Panel title="Lượt đăng nhập theo ngày">
            <AnalyticsBoundary state={data.logins}>
              <MetricChart
                rows={data.logins.rows}
                metrics={[
                  {
                    key: "login_count",
                    name: "Lượt đăng nhập",
                    color: "#45a7ee",
                  },
                ]}
              />
            </AnalyticsBoundary>
          </Panel>
          <Panel title="Trạng thái giao dịch">
            <AnalyticsBoundary state={data.transactions}>
              <InsightDonut
                items={groupMetric(
                  data.transactions.rows,
                  "status",
                  "transaction_count",
                )}
                label="giao dịch"
              />
            </AnalyticsBoundary>
          </Panel>
          <Panel title="Phân bố rủi ro giao dịch">
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
          <Panel title="Quyết định ALLOW / REVIEW / BLOCK">
            <AnalyticsBoundary state={data.risk}>
              <InsightBars
                items={groupMetric(
                  data.risk.rows,
                  "decision",
                  "assessment_count",
                )}
              />
            </AnalyticsBoundary>
          </Panel>
          <Panel title="Hiệu suất xử lý Review">
            <AnalyticsBoundary state={data.reviews}>
              <InsightBars
                items={groupMetric(
                  data.reviews.rows,
                  "status",
                  "review_count",
                ).map((item) => ({
                  ...item,
                  name: reviewLabels[item.name] ?? item.name,
                }))}
              />
            </AnalyticsBoundary>
          </Panel>
          <Panel title="Giao dịch theo ngày">
            <AnalyticsBoundary state={data.transactions}>
              <InsightTable
                rows={dailyMetrics(data.transactions.rows, [
                  "transaction_count",
                  "total_amount",
                ]).reverse()}
                columns={[
                  { key: "day", label: "Ngày" },
                  { key: "transaction_count", label: "Số GD", format: number },
                  { key: "total_amount", label: "Giá trị", format: money },
                ]}
              />
            </AnalyticsBoundary>
          </Panel>
          <Panel title="Phí giao dịch theo loại">
            <AnalyticsBoundary state={data.transactions}>
              <InsightBars
                items={groupMetric(
                  data.transactions.rows,
                  "transaction_type_key",
                  "total_fee",
                ).map((item) => ({
                  ...item,
                  name: "Loại #" + item.name + " (₫)",
                }))}
              />
            </AnalyticsBoundary>
          </Panel>
        </div>
      )}
    </div>
  );
}
