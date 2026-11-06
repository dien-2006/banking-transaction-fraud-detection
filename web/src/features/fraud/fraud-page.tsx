"use client";
import { DistributionChart } from "@/components/distribution-chart";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Filter,
  Plus,
  Search,
  ShieldX,
  UserRound,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSessionUser } from "@/components/session-context";
import { useQuery } from "@tanstack/react-query";
import {
  ListPagination,
  useListPagination,
} from "@/components/list-pagination";
import { ReviewDialog } from "./review-dialog";
import { bankService } from "@/services/bank.service";
import { loadFraudReviews } from "@/lib/fraud-data";
import "./fraud-page.css";

const riskTone: Record<string, string> = {
  "Rất cao": "bg-red-100 text-red-600",
  Cao: "bg-rose-50 text-red-500",
  "Trung bình": "bg-amber-50 text-orange-500",
  Thấp: "bg-emerald-50 text-emerald-600",
  "Chưa đánh giá": "bg-slate-100 text-slate-600",
};
const statusTone: Record<string, string> = {
  "Đang xử lý": "bg-amber-50 text-orange-500",
  "Chờ review": "bg-blue-50 text-blue-600",
  "Đã duyệt": "bg-emerald-50 text-emerald-600",
  "Đã từ chối": "bg-red-50 text-red-600",
  "Đã đóng": "bg-slate-100 text-slate-600",
};

function FraudHero() {
  return (
    <section
      className="fraud-hero relative overflow-hidden rounded-xl border border-red-100 bg-[#fff0f0]"
      aria-label="Giám sát rủi ro giao dịch"
    >
      <div className="fraud-hero-copy">
        <p>FRAUD &amp; REVIEW</p>
        <h1>Giám sát rủi ro giao dịch</h1>
        <span>Tra cứu và theo dõi hồ sơ trong phạm vi được cấp quyền.</span>
      </div>
      <svg
        className="fraud-hero-art"
        viewBox="1090 75 428 181"
        aria-hidden="true"
        focusable="false"
      >
        <image href="/fraud-admin-reference.png" width="1536" height="1024" />
      </svg>
    </section>
  );
}

export function FraudPage({ role = "admin" }: { role?: "admin" | "employee" }) {
  const user = useSessionUser();
  const searchParams = useSearchParams();
  const requestedStatus =
    searchParams.get("status") === "review" ? "__pending" : "";
  const reviewsQuery = useQuery({
    queryKey: ["fraud-reviews-old-ui", role, user.id, user.branchId],
    queryFn: () => loadFraudReviews(bankService.fraudCases),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
  const alerts = useMemo(() => reviewsQuery.data ?? [], [reviewsQuery.data]);
  const [type, setType] = useState("");
  const [q, setQ] = useState(""),
    [risk, setRisk] = useState(""),
    [status, setStatus] = useState(requestedStatus),
    [tab, setTab] = useState("Danh sách cảnh báo");
  useEffect(() => {
    setStatus(requestedStatus);
  }, [requestedStatus]);
  const data = useMemo(
    () =>
      alerts.filter(
        (x) =>
          (!q ||
            Object.values(x)
              .join(" ")
              .toLowerCase()
              .includes(q.toLowerCase())) &&
          (!risk || x.risk === risk) &&
          (!status ||
            (status === "__pending" ? x.pending : x.status === status)) &&
          (!type || x.type === type),
      ),
    [q, risk, status, type, alerts],
  );
  const pagination = useListPagination(data, { fitViewportOnly: true });
  useEffect(() => pagination.setPage(1), [q, risk, status, type]);
  const pendingCount = alerts.filter((x) => x.pending).length;
  const kpis: Array<[typeof AlertTriangle, string, string]> = [
    [AlertTriangle, "Tổng hồ sơ review", String(alerts.length)],
    [Clock3, "Đang chờ xử lý", String(pendingCount)],
    [CheckCircle2, "Đã xử lý", String(alerts.length - pendingCount)],
    [
      ShieldX,
      "Đã từ chối",
      String(alerts.filter((x) => x.status === "Đã từ chối").length),
    ],
  ];
  const percent = (count: number) =>
    alerts.length ? Math.round((count / alerts.length) * 100) : 0;
  const riskColors = ["#f5223e", "#ff6979", "#ffb42c", "#25b88a", "#94a3b8"];
  const riskCounts = Object.keys(riskTone).map((label) => ({
    label,
    count: alerts.filter((x) => x.risk === label).length,
  }));
  const types = Array.from(new Set(alerts.map((x) => x.type))).sort();
  const typeCounts = types.map((label) => ({
    label,
    count: alerts.filter((x) => x.type === label).length,
  }));
  const typePreview =
    typeCounts.length > 4
      ? [
          ...typeCounts.slice(0, 3),
          {
            label: "Khác",
            count: typeCounts
              .slice(3)
              .reduce((sum, item) => sum + item.count, 0),
          },
        ]
      : typeCounts;
  const urgent = alerts
    .filter((x) => x.pending)
    .sort(
      (a, b) =>
        (Number(b.ruleScore) || 0) - (Number(a.ruleScore) || 0) ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt),
    )
    .slice(0, 3);
  return (
    <div
      className="staff-data-page customers-page-content fraud-page-content flex flex-col gap-2.5 text-navy"
      data-role={role}
    >
      <FraudHero />
      <section className="grid grid-cols-4 gap-3">
        {kpis.map(([Icon, label, value], index) => (
          <article className="card flex items-center gap-3 p-3" key={label}>
            <span className="grid size-11 place-items-center rounded-full bg-[#ffe9ec] text-coral">
              <Icon size={21} />
            </span>
            <div>
              <p className="text-xs">{label}</p>
              <b className="text-2xl">{reviewsQuery.data ? value : "—"}</b>
              <small
                className={`block text-[9px] ${index === 1 || index === 3 ? "text-red-500" : "text-emerald-500"}`}
              >
                {reviewsQuery.isError
                  ? "Không tải được dữ liệu"
                  : reviewsQuery.isPending
                    ? "Đang tải…"
                    : "Trong phạm vi được cấp quyền"}
              </small>
            </div>
          </article>
        ))}
      </section>
      <section className="d4-page-toolbar card flex h-12 justify-between px-3">
        <div className="flex h-full gap-4">
          {(role === "employee"
            ? [
                "Danh sách cảnh báo",
                "Giao dịch nghi ngờ",
                "Tài khoản cần review",
              ]
            : [
                "Danh sách cảnh báo",
                "Giao dịch nghi ngờ",
                "Tài khoản cần review",
                "Báo cáo rủi ro",
                "Lịch sử xử lý",
              ]
          ).map((x) => (
            <button
              className={
                tab === x
                  ? "border-b-2 border-coral px-2 text-xs font-semibold text-coral"
                  : "px-2 text-xs"
              }
              key={x}
              onClick={() => setTab(x)}
              disabled={x !== "Danh sách cảnh báo"}
              title={
                x !== "Danh sách cảnh báo"
                  ? "Chức năng chưa được triển khai"
                  : undefined
              }
            >
              {x}
            </button>
          ))}
        </div>
        {role === "admin" && (
          <button
            disabled
            title="API chưa hỗ trợ tạo cảnh báo thủ công"
            className="btn-primary h-8 disabled:opacity-50"
          >
            <Plus size={14} />
            Tạo cảnh báo thủ công
          </button>
        )}
      </section>
      {tab !== "Danh sách cảnh báo" ? (
        <section className="card flex-1 p-5">
          <h2 className="text-lg font-black">{tab}</h2>
          <p className="mt-2 text-sm text-slate-500">
            Dữ liệu mô phỏng cho quy trình giám sát và review rủi ro.
          </p>
        </section>
      ) : (
        <section className="fraud-workspace grid min-h-0 flex-1 grid-cols-[2.05fr_.62fr] gap-3">
          <article
            ref={pagination.panelRef}
            className="fraud-list-panel card flex min-h-0 flex-col p-3"
          >
            <div className="fraud-filters grid grid-cols-[1.45fr_.65fr_.65fr_.65fr_.28fr] gap-2">
              <label className="relative">
                <Search
                  className="absolute left-3 top-2.5 text-slate-400"
                  size={15}
                />
                <input
                  aria-label="Tìm cảnh báo"
                  className="h-9 w-full rounded-lg border pl-9 text-[10px]"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Mã review, giao dịch, khách hàng…"
                />
              </label>
              <select
                className="rounded-lg border px-2 text-[10px]"
                value={risk}
                onChange={(e) => setRisk(e.target.value)}
                aria-label="Mức độ rủi ro"
              >
                <option value="">Tất cả mức độ rủi ro</option>
                {Object.keys(riskTone).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <select
                aria-label="Loại giao dịch"
                className="rounded-lg border px-2 text-[10px]"
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                <option value="">Tất cả loại giao dịch</option>
                {types.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <select
                className="rounded-lg border px-2 text-[10px]"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                aria-label="Trạng thái review"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="__pending">Hồ sơ chờ xử lý</option>
                {Object.keys(statusTone).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <button
                onClick={() => pagination.setPage(1)}
                className="rounded-lg border border-coral text-[10px] text-coral"
              >
                <Filter className="inline" size={13} /> Lọc
              </button>
            </div>
            <div className="fraud-table-container mt-2 min-h-0 overflow-auto">
              <table className="fraud-review-table w-full table-fixed text-left text-[10px]">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      "Mã review",
                      "Thời gian",
                      "Khách hàng",
                      "Loại giao dịch",
                      "Mã giao dịch",
                      "Rủi ro",
                      "Trạng thái",
                      "Người xử lý",
                      "Thao tác",
                    ].map((x) => (
                      <th className="p-2 font-medium" key={x}>
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reviewsQuery.isPending && (
                    <tr>
                      <td
                        colSpan={9}
                        className="p-3 text-center text-slate-500"
                      >
                        Đang tải hồ sơ review…
                      </td>
                    </tr>
                  )}
                  {reviewsQuery.isError && (
                    <tr>
                      <td colSpan={9} className="p-3 text-center text-red-600">
                        Không thể tải hồ sơ review.{" "}
                        <button
                          onClick={() => {
                            void reviewsQuery.refetch();
                          }}
                        >
                          Thử lại
                        </button>
                      </td>
                    </tr>
                  )}
                  {reviewsQuery.isSuccess && !data.length && (
                    <tr>
                      <td
                        colSpan={9}
                        className="p-3 text-center text-slate-500"
                      >
                        Không có hồ sơ phù hợp.
                      </td>
                    </tr>
                  )}
                  {pagination.visibleItems.map((x) => (
                    <tr className="border-t" key={x.id}>
                      <td className="p-1.5 font-semibold text-blue-600">
                        {x.id}
                      </td>
                      <td className="fraud-time-cell p-1.5">
                        <time dateTime={x.createdAt}>
                          <span>
                            {new Date(x.createdAt).toLocaleDateString("vi-VN", {
                              timeZone: "Asia/Ho_Chi_Minh",
                            })}
                          </span>
                          <span>
                            {new Date(x.createdAt).toLocaleTimeString("vi-VN", {
                              timeZone: "Asia/Ho_Chi_Minh",
                            })}
                          </span>
                        </time>
                      </td>
                      <td className="p-1.5">
                        <b className="block truncate">{x.customer}</b>
                      </td>
                      <td className="p-1.5">{x.type}</td>
                      <td className="p-1.5">
                        <span title={x.detail}>{x.transaction}</span>
                      </td>
                      <td className="p-1.5">
                        <span
                          className={`inline-block rounded px-1 text-center ${riskTone[x.risk]}`}
                        >
                          {x.risk}
                        </span>
                      </td>
                      <td className="p-1.5">
                        <span
                          className={`inline-block rounded px-1 text-center ${statusTone[x.status]}`}
                        >
                          {x.status}
                        </span>
                      </td>
                      <td className="p-1.5">{x.assignee}</td>
                      <td className="p-1.5 text-center">
                        <ReviewDialog review={x} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPagination {...pagination} noun="hồ sơ review" />
          </article>
          <aside className="staff-secondary-panels fraud-sidebar grid min-h-0 grid-rows-[1.1fr_1fr_1.15fr] gap-3">
            <article className="card p-3">
              <h2 className="text-base font-black">
                Review theo mức độ rủi ro
              </h2>
              <DistributionChart
                items={riskCounts.map((item, index) => ({
                  label: item.label,
                  value: item.count,
                  color: riskColors[index],
                }))}
                label="review"
                ready={reviewsQuery.isSuccess}
                error={reviewsQuery.isError}
              />
            </article>
            <article className="card p-3">
              <h2 className="text-base font-black">
                Review theo loại giao dịch
              </h2>
              <div className="mt-2 space-y-1.5 text-[10px]">
                {typePreview.map((item, index) => (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_minmax(24px,.7fr)_auto] items-center gap-2"
                    key={item.label}
                  >
                    <span className="truncate" title={item.label}>
                      {item.label}
                    </span>
                    <span className="h-3 rounded bg-slate-100">
                      <i
                        className="block h-full rounded"
                        style={{
                          width: `${percent(item.count)}%`,
                          background: riskColors[index],
                        }}
                      />
                    </span>
                    <span>
                      {percent(item.count)}% ({item.count})
                    </span>
                  </div>
                ))}
              </div>
            </article>
            <article className="card flex min-h-0 flex-col p-3">
              <div className="flex justify-between">
                <h2 className="text-base font-black">Review cần xử lý</h2>
                <button
                  onClick={() => {
                    setQ("");
                    setRisk("");
                    setType("");
                    setStatus("__pending");
                    pagination.setPage(1);
                  }}
                  className="text-[10px] text-coral"
                >
                  Xem tất cả →
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {reviewsQuery.isSuccess && !urgent.length && (
                  <p className="text-xs text-slate-500">
                    Không có hồ sơ cần xử lý.
                  </p>
                )}
                {urgent.map((x) => (
                  <div
                    className="flex items-center gap-2 text-[10px]"
                    key={x.id}
                  >
                    <span className="grid size-8 place-items-center rounded-full bg-[#fff0f0] text-coral">
                      <UserRound size={15} />
                    </span>
                    <p className="min-w-0 flex-1">
                      <b className="block truncate">{x.detail}</b>
                      <span className="text-slate-500">{x.customer}</span>
                    </p>
                    <span className={`rounded px-2 py-1 ${riskTone[x.risk]}`}>
                      {x.risk}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          </aside>
        </section>
      )}
    </div>
  );
}
