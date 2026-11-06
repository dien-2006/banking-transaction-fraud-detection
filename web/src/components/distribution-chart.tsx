"use client";

import "./distribution-chart.css";

export const distributionColors = [
  "#ff1741",
  "#329ef5",
  "#ffbf20",
  "#8459e5",
  "#27b38d",
  "#ff9dad",
];

export function DistributionChart({
  items,
  label,
  ready = true,
  error = false,
  hidden = false,
  centerValue,
  formatValue = (value: number) => value.toLocaleString("vi-VN"),
  emptyText = "Chưa có dữ liệu.",
}: {
  items: { label: string; value: number; color?: string }[];
  label: string;
  ready?: boolean;
  error?: boolean;
  hidden?: boolean;
  centerValue?: string;
  formatValue?: (value: number) => string;
  emptyText?: string;
}) {
  const invalid = items.some(
    (item) => !Number.isFinite(item.value) || item.value < 0,
  );
  const values = items.filter(
    (item) => Number.isFinite(item.value) && item.value >= 0,
  );
  const total = values.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  const segments = values.map((item, index) => {
    const start = offset;
    offset += total ? (item.value / total) * 100 : 0;
    return `${item.color ?? distributionColors[index % distributionColors.length]} ${start}% ${offset}%`;
  });
  const failed = error || invalid;
  const unavailable = !ready || failed;
  const value = hidden
    ? "••••••"
    : unavailable
      ? "—"
      : (centerValue ??
        total.toLocaleString("vi-VN", {
          notation: total >= 10_000 ? "compact" : "standard",
          maximumFractionDigits: 1,
        }));
  return (
    <div className="d4-distribution" data-hidden={hidden || undefined}>
      <div className="d4-distribution-layout">
        <div
          className="d4-distribution-ring"
          role="img"
          aria-label={
            hidden
              ? `${label}: đã ẩn giá trị`
              : unavailable
                ? `${label}: chưa có dữ liệu`
                : `${label}: ${formatValue(total)}`
          }
          style={{
            background:
              !hidden && !unavailable && total
                ? `conic-gradient(${segments.join(",")})`
                : "#edf1f7",
          }}
        >
          <div className="d4-distribution-center">
            <b title={hidden || unavailable ? undefined : formatValue(total)}>
              {value}
            </b>
            <small>{label}</small>
          </div>
        </div>
        {unavailable ? (
          <p
            className="d4-distribution-message"
            role={failed ? "alert" : "status"}
          >
            {invalid
              ? "Dữ liệu biểu đồ không hợp lệ."
              : failed
                ? "Không tải được dữ liệu biểu đồ."
                : "Đang tải dữ liệu…"}
          </p>
        ) : !total ? (
          <p className="d4-distribution-message">{emptyText}</p>
        ) : (
          <ul className="d4-distribution-legend">
            {values.map((item, index) => (
              <li key={item.label}>
                <i
                  aria-hidden="true"
                  style={{
                    background:
                      item.color ??
                      distributionColors[index % distributionColors.length],
                  }}
                />
                <span>{item.label}</span>
                <strong>
                  {hidden
                    ? "••••••"
                    : `${Math.round((item.value / total) * 100)}% · ${formatValue(item.value)}`}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
