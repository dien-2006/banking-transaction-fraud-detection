"use client";
import {
  DistributionChart,
  distributionColors,
} from "@/components/distribution-chart";

import { transactionTypes, customerStatuses } from "@/lib/customer-data";
import { formatDateTime } from "@/lib/presentation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Bot,
  HandCoins,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  Users,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/components/ui";
import { useSessionUser } from "@/components/session-context";
import { money } from "@/lib/utils";
import { bankService, type AdminOverviewData } from "@/services/bank.service";
import type { RiskDecision } from "@/types";

type RiskRow = {
  transactionId: string;
  reviewId?: string;
  customer: string;
  amount: number;
  ruleScore: number;
  modelProbability: number;
  time: string;
  decision: RiskDecision;
};
const number = new Intl.NumberFormat("vi-VN");
const colors = distributionColors;
const icons = {
  customers: Users,
  accounts: WalletCards,
  transactions: ArrowLeftRight,
  loans: HandCoins,
  risks: ShieldAlert,
} as const;
const typeLabels = transactionTypes;
const statusLabels = customerStatuses;
const decisionTone: Record<RiskDecision, string> = {
  ALLOW: "bg-[#eafaf2] text-[#128653]",
  REVIEW: "bg-[#fff2dc] text-[#c66b00]",
  BLOCK: "bg-[#ffe5e8] text-[#d90018]",
};
const compactNumber = new Intl.NumberFormat("vi-VN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function niceMaximum(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function Heading({
  children,
  href,
}: {
  children: React.ReactNode;
  href?: string;
}) {
  return (
    <div className="mb-1 flex items-center justify-between gap-3">
      <h2 className="truncate text-[13px] font-extrabold text-[#000064]">
        {children}
      </h2>
      {href && (
        <Link
          className="shrink-0 text-[10px] font-semibold text-[#f80820] hover:underline"
          href={href}
        >
          Xem tất cả&nbsp; →
        </Link>
      )}
    </div>
  );
}

function KpiChange({ item }: { item: AdminOverviewData["kpis"][number] }) {
  const percent =
    item.previousPeriod > 0
      ? ((item.currentPeriod - item.previousPeriod) / item.previousPeriod) * 100
      : item.currentPeriod === 0
        ? 0
        : null;
  const trend =
    percent === null
      ? "chưa có kỳ gốc"
      : `${percent > 0 ? "+" : ""}${number.format(Math.round(percent * 10) / 10)}% so tháng trước`;
  return (
    <p
      className="mt-0.5 truncate text-[9px] leading-tight text-[#17418d]"
      title={`Số phát sinh tháng này: ${number.format(item.currentPeriod)}; tháng trước: ${number.format(item.previousPeriod)}. ${trend}. Không phải mức thay đổi của tổng lũy kế.`}
    >
      Phát sinh tháng: <b>{number.format(item.currentPeriod)}</b> · {trend}
    </p>
  );
}

function roleVisual(role?: string, actor?: string) {
  const label = role?.trim() || (actor === "System" ? "Hệ thống" : "Nhân viên");
  const normalized = label.toLocaleLowerCase("vi");
  if (normalized.includes("admin") || normalized.includes("quản trị"))
    return { Icon: ShieldCheck, tone: "bg-red-100 text-red-700", label };
  if (normalized.includes("hệ thống") || normalized.includes("system"))
    return { Icon: Bot, tone: "bg-slate-100 text-slate-700", label };
  return { Icon: UserCog, tone: "bg-blue-100 text-blue-700", label };
}

function LineChart({ rows }: { rows: AdminOverviewData["dailyTransactions"] }) {
  const max = niceMaximum(Math.max(0, ...rows.map((row) => row.count)));
  const points = rows.map(
    (row, index) =>
      [
        40 + index * (448 / Math.max(rows.length - 1, 1)),
        58 - (row.count / max) * 50,
      ] as const,
  );
  const polyline = points.map(([x, y]) => `${x},${y}`).join(" ");
  const ticks = [...new Set([max, Math.floor(max / 2), 0])];
  return (
    <div className="h-[82px] min-w-0 text-[#17418d]">
      <svg
        aria-label="Số lượng giao dịch thực tế theo ngày"
        className="h-full w-full"
        preserveAspectRatio="none"
        role="img"
        viewBox="0 0 500 82"
      >
        {ticks.map((value) => {
          const y = 58 - (value / max) * 50;
          return (
            <g key={value}>
              <line x1="40" x2="488" y1={y} y2={y} stroke="#e2e7f1" />
              <text
                x="30"
                y={y + 3}
                textAnchor="end"
                fill="currentColor"
                fontSize="9"
              >
                {compactNumber.format(value)}
              </text>
            </g>
          );
        })}
        {points.length > 0 && (
          <>
            <path
              d={`M${polyline} L${points[points.length - 1][0]} 58 L40 58Z`}
              fill="#f8082012"
            />
            <polyline
              points={polyline}
              fill="none"
              stroke="#f80820"
              strokeWidth="2"
            />
            {points.map(([x, y], index) => (
              <circle
                cx={x}
                cy={y}
                fill="#f80820"
                r="2.5"
                key={rows[index].date}
              >
                <title>{`${rows[index].date}: ${number.format(rows[index].count)} giao dịch`}</title>
              </circle>
            ))}
          </>
        )}
        {rows.map((row, index) => (
          <text
            x={points[index][0]}
            y="78"
            textAnchor="middle"
            fill="currentColor"
            fontSize="9"
            key={row.date}
          >
            {new Date(`${row.date}T00:00:00`).toLocaleDateString("vi-VN", {
              day: "2-digit",
              month: "2-digit",
            })}
          </text>
        ))}
      </svg>
    </div>
  );
}

function Donut({ rows }: { rows: AdminOverviewData["transactionTypes"] }) {
  return (
    <DistributionChart
      items={rows.map((row) => ({
        label: typeLabels[row.code] ?? row.label,
        value: row.count,
      }))}
      label="giao dịch"
      emptyText="Chưa có giao dịch tháng này."
    />
  );
}

function Bars({ rows }: { rows: AdminOverviewData["transactionStatuses"] }) {
  const max = niceMaximum(Math.max(0, ...rows.map((row) => row.count)));
  const description = rows
    .map(
      (row) =>
        `${statusLabels[row.status] ?? row.status}: ${number.format(row.count)}`,
    )
    .join(", ");
  return (
    <div
      className="relative flex h-[82px] items-end justify-around border-b border-l border-[#dbe2ed] px-3 pb-5 before:absolute before:inset-x-0 before:top-1/4 before:border-t before:border-[#e7ebf2] after:absolute after:inset-x-0 after:top-1/2 after:border-t after:border-[#e7ebf2]"
      role="img"
      aria-label={
        description || "Chưa có dữ liệu trạng thái giao dịch tháng này"
      }
    >
      {rows.map((row, index) => (
        <div
          className="relative z-10 flex h-full min-w-12 flex-col items-center justify-end"
          key={row.status}
        >
          <span className="mb-0.5 text-[8px] font-semibold">
            {number.format(row.count)}
          </span>
          <div
            className="w-8 rounded-t-sm"
            style={{
              height: `${Math.max(4, (row.count / max) * 82)}%`,
              background: colors[index % colors.length],
            }}
          />
          <span className="absolute -bottom-5 whitespace-nowrap text-[9px]">
            {statusLabels[row.status] ?? row.status}
          </span>
        </div>
      ))}
      {rows.length === 0 && (
        <span className="self-center text-[10px]">
          Chưa có dữ liệu tháng này
        </span>
      )}
    </div>
  );
}

function RiskTable({
  rows,
  review = false,
  onView,
}: {
  rows: RiskRow[];
  review?: boolean;
  onView: (row: RiskRow) => void;
}) {
  const headers = review
    ? [
        "Mã review",
        "Mã giao dịch",
        "Khách hàng",
        "Số tiền",
        "RuleScore",
        "ML",
        "Thời gian",
        "Thao tác",
      ]
    : [
        "Mã giao dịch",
        "Khách hàng",
        "Số tiền",
        "RuleScore",
        "ML",
        "Decision",
        "Thao tác",
      ];
  return (
    <div className="overflow-hidden">
      <table className="w-full table-fixed text-left text-[10px]">
        <thead className="bg-[#f4f6fa] text-[#17418d]">
          <tr>
            {headers.map((x) => (
              <th
                className="truncate px-1.5 py-0.5 font-semibold"
                title={x}
                key={x}
              >
                {x}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf0f5]">
          {rows.map((row) => (
            <tr key={row.reviewId ?? row.transactionId}>
              {review && (
                <td className="truncate px-1.5 py-0.5">{row.reviewId}</td>
              )}
              <td className="truncate px-1.5 py-0.5">{row.transactionId}</td>
              <td className="truncate px-1.5 py-0.5" title={row.customer}>
                {row.customer}
              </td>
              <td className="truncate px-1.5 py-0.5">
                {money.format(row.amount)}
              </td>
              <td className="px-1.5 py-0.5">
                <b className="rounded-md bg-[#ffe5e8] px-1.5 text-[#f80820]">
                  {row.ruleScore}
                </b>
              </td>
              <td className="px-1.5 py-0.5">
                {Math.round(row.modelProbability * 100)}%
              </td>
              {review ? (
                <td className="px-1.5 py-0.5">{row.time}</td>
              ) : (
                <td className="px-1.5 py-0.5">
                  <span
                    className={`rounded-md px-1.5 font-semibold ${decisionTone[row.decision]}`}
                  >
                    {row.decision}
                  </span>
                </td>
              )}
              <td className="px-1.5 py-0.5">
                <button
                  className="rounded-md bg-[#fff0f0] px-3 py-0.5 font-medium text-[#f80820] hover:bg-[#ffe0e4]"
                  onClick={() => onView(row)}
                >
                  Xem
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                className="py-4 text-center text-slate-400"
                colSpan={headers.length}
              >
                Không có dữ liệu
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function toRiskRows(
  rows: AdminOverviewData["recentRisks"] | AdminOverviewData["pendingReviews"],
): RiskRow[] {
  return rows.map((row) => ({
    transactionId: row.transactionCode,
    reviewId: "reviewId" in row ? `RVW${row.reviewId}` : undefined,
    customer: row.customer,
    amount: Number(row.amount),
    ruleScore: Number(row.ruleScore),
    modelProbability: Number(row.modelProbability),
    time: formatDateTime(
      "assessed_at" in row ? row.assessed_at : row.created_at,
    ),
    decision: row.decision,
  }));
}

export function AdminOverview({
  role = "admin",
}: {
  role?: "admin" | "employee";
}) {
  const [selected, setSelected] = useState<RiskRow | null>(null);
  const user = useSessionUser(),
    adminName = user.name;
  const query = useQuery({
    queryKey: ["admin-overview", role, user.id, user.branchId],
    queryFn: bankService.adminOverview,
    refetchInterval: 30_000,
  });
  if (query.isLoading)
    return (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((x) => (
          <div className="h-20 animate-pulse rounded-xl bg-white" key={x} />
        ))}
      </div>
    );
  if (query.isError || !query.data)
    return (
      <div className="card p-6 text-sm text-red-600" role="alert">
        Không thể tải dữ liệu tổng quan.{" "}
        <button className="underline" onClick={() => void query.refetch()}>
          Thử lại
        </button>
      </div>
    );
  const data = query.data,
    recentRisks = toRiskRows(data.recentRisks),
    pendingReviews = toRiskRows(data.pendingReviews);
  const latestBranches = [...data.branches]
    .sort((a, b) => b.branchId - a.branchId)
    .slice(0, 5);
  const latestActivities = [...data.recentActivities]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 5);
  return (
    <div className="admin-overview-fit text-[#000064]">
      <section className="grid gap-3 lg:grid-cols-[2.15fr_1fr]">
        <article className="d4-banner relative min-h-[70px] overflow-hidden rounded-xl border border-[#ffe3e7] px-3 py-1.5">
          <div className="d4-city" />
          <div className="relative">
            <p className="text-[13px] text-[#f80820]">Chào mừng trở lại,</p>
            <h1 className="text-[24px] font-black leading-none text-[#f80820]">
              {adminName}!
            </h1>
            <p className="mt-0.5 text-[10px]">
              {role === "employee"
                ? "Cùng D4 Bank vận hành chi nhánh an toàn – chính xác – hiệu quả."
                : "Cùng D4 Bank quản trị hệ thống an toàn – hiệu quả – bền vững."}
            </p>
          </div>
          <p className="absolute right-5 top-1 hidden rotate-[-8deg] text-center text-[10px] font-bold italic leading-4 text-[#f80820] md:block">
            Dữ liệu hôm nay
            <br />
            Tạo nên một ngân hàng
            <br />
            thông minh hơn ngày mai!
          </p>
        </article>
        <article className="d4-banner relative min-h-[70px] overflow-hidden rounded-xl border border-[#ffe3e7] px-2.5 py-1.5">
          <div className="d4-city" />
          <div className="relative mt-1 inline-block rounded-xl bg-white/90 px-2.5 py-1.5">
            <h2 className="text-[12px] font-black text-[#f80820]">
              {role === "employee"
                ? "Vận hành trong phạm vi chi nhánh"
                : "Kiểm soát toàn hệ thống"}
            </h2>
            <p className="mt-0.5 text-[10px]">
              Cập nhật {formatDateTime(data.generatedAt)}
            </p>
          </div>
        </article>
      </section>
      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {data.kpis.map((item) => {
          const Icon = icons[item.key];
          return (
            <article
              className="card flex h-14 min-w-0 items-center gap-2 px-2.5 py-1"
              key={item.key}
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full ${item.key === "loans" ? "bg-[#fff1da] text-[#f59e0b]" : "bg-[#ffe7e9] text-[#f80820]"}`}
              >
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12px] leading-tight">
                  {item.label}
                </p>
                <strong className="mt-0.5 block text-[16px] font-black leading-none">
                  {number.format(item.value)}
                </strong>
                <KpiChange item={item} />
              </div>
            </article>
          );
        })}
      </section>
      <section className="grid gap-2 xl:grid-cols-[1.24fr_.82fr_1fr]">
        <article className="card p-2">
          <Heading>Số lượng giao dịch theo ngày</Heading>
          <LineChart rows={data.dailyTransactions} />
        </article>
        <article className="card p-2">
          <Heading>Tỷ lệ loại giao dịch tháng này</Heading>
          <Donut rows={data.transactionTypes} />
        </article>
        <article className="card p-2">
          <Heading>Trạng thái giao dịch tháng này</Heading>
          <Bars rows={data.transactionStatuses} />
        </article>
      </section>
      <section className="grid gap-2 xl:grid-cols-2">
        <article className="card p-2">
          <Heading href={`/${role}/fraud`}>Giao dịch rủi ro gần đây</Heading>
          <RiskTable rows={recentRisks} onView={setSelected} />
        </article>
        <article className="card p-2">
          <Heading href={`/${role}/fraud?status=review`}>
            Danh sách review đang chờ
          </Heading>
          <RiskTable review rows={pendingReviews} onView={setSelected} />
        </article>
      </section>
      <section className="grid gap-2 xl:grid-cols-[1.15fr_1fr]">
        <article className="card overflow-hidden p-2">
          <Heading href={role === "admin" ? "/admin/branches" : undefined}>
            Thống kê theo chi nhánh
          </Heading>
          <table className="w-full table-fixed text-left text-[10px]">
            <thead className="bg-[#f4f6fa]">
              <tr>
                {[
                  "Chi nhánh",
                  "Khách hàng",
                  "Tài khoản",
                  "Giao dịch",
                  "Khoản vay",
                  "Giao dịch rủi ro",
                ].map((x) => (
                  <th className="px-2 py-0.5 font-medium" key={x}>
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf0f5]">
              {latestBranches.map((row) => (
                <tr key={row.branchId}>
                  {[
                    row.branchName,
                    row.customers,
                    row.accounts,
                    row.transactions,
                    row.loans,
                    row.risks,
                  ].map((value, index) => (
                    <td
                      className={`truncate px-2 py-0.5 ${index === 5 ? "font-bold text-[#f80820]" : ""}`}
                      title={String(value)}
                      key={`${row.branchId}-${index}`}
                    >
                      {typeof value === "number" ? number.format(value) : value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article className="card p-2">
          <Heading href={role === "admin" ? "/admin/audit-logs" : undefined}>
            Hoạt động gần đây
          </Heading>
          <div className="space-y-0.5">
            <div className="grid grid-cols-[52px_112px_minmax(0,1fr)_140px] items-center gap-2 bg-[#f4f6fa] px-1.5 text-[10px] font-semibold text-[#4772bd]">
              <span>Vai trò</span>
              <span>Người thực hiện</span>
              <span>Hoạt động</span>
              <span className="text-right">Thời gian</span>
            </div>
            {latestActivities.map((item) => {
              const { Icon, tone, label } = roleVisual(item.role, item.actor);
              return (
                <div
                  className="grid grid-cols-[52px_112px_minmax(0,1fr)_140px] items-center gap-2 border-b border-[#edf0f5] px-1.5 text-[10px] last:border-b-0"
                  key={item.auditId}
                >
                  <span
                    className={`grid size-6 place-items-center rounded-md ${tone}`}
                    title={label}
                    aria-label={`Vai trò: ${label}`}
                  >
                    <Icon aria-hidden="true" size={14} />
                  </span>
                  <b className="truncate" title={item.actor}>
                    {item.actor}
                  </b>
                  <span className="truncate" title={item.description}>
                    {item.description}
                  </span>
                  <time className="whitespace-nowrap text-right">
                    {formatDateTime(item.created_at)}
                  </time>
                </div>
              );
            })}
            {data.recentActivities.length === 0 && (
              <p className="py-4 text-center text-[10px] text-slate-400">
                Chưa có audit log
              </p>
            )}
          </div>
        </article>
      </section>
      <Modal
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        title="Chi tiết đánh giá rủi ro"
      >
        {selected && (
          <div className="divide-y rounded-xl bg-slate-50 px-4">
            {[
              ["Mã giao dịch", selected.transactionId],
              ["Khách hàng", selected.customer],
              ["Số tiền", money.format(selected.amount)],
              ["RuleScore", `${selected.ruleScore}/100`],
              [
                "ModelProbability",
                `${Math.round(selected.modelProbability * 100)}%`,
              ],
              ["Decision", selected.decision],
              ["Thời gian", selected.time],
            ].map(([label, value]) => (
              <div
                className="flex items-center justify-between gap-6 py-3 text-sm"
                key={label}
              >
                <span className="text-slate-500">{label}</span>
                <b
                  className={
                    label === "Decision"
                      ? decisionTone[selected.decision] +
                        " rounded-md px-2 py-1"
                      : ""
                  }
                >
                  {value}
                </b>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
