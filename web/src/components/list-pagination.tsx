"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { calculateAdaptiveListLayout } from "@/lib/list-capacity";

// Both local and API pagination use the same measured row capacity.
function useListCapacity(initialPageSize = 8, fitViewportOnly = false) {
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const panelRef = useCallback(
    (element: HTMLElement | null) => setPanel(element),
    [],
  );

  useEffect(() => {
    if (!panel) return;
    panel.classList.add("d4-list-panel");
    let frame = 0;
    const measure = () => {
      if (
        fitViewportOnly &&
        !window.matchMedia("(min-width: 1100px) and (min-height: 640px)")
          .matches
      ) {
        setPageSize(initialPageSize);
        panel.style.removeProperty("--d4-list-row-height");
        return;
      }
      const table = panel.querySelector("table");
      const footer = panel.querySelector<HTMLElement>(".d4-list-pagination");
      if (!table || !footer) return;
      // Give names, descriptions and timestamps more space than compact badges.
      const headers = Array.from(
        table.querySelectorAll<HTMLElement>("thead th"),
      );
      const weights = headers.map((cell) => {
        const label = cell.textContent?.toLocaleLowerCase("vi") ?? "";
        if (/thao tác|mức độ|xác minh|rule|^ml$/.test(label)) return 0.8;
        if (/trạng thái|lãi suất|loại|hạn mức/.test(label)) return 1.1;
        if (
          /nội dung|mô tả|địa chỉ|họ và tên|khách hàng|chủ tài khoản|hoạt động/.test(
            label,
          )
        )
          return 1.8;
        if (/thời gian|cập nhật|điện thoại|số tiền|số dư/.test(label))
          return 1.5;
        return 1.3;
      });
      const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
      headers.forEach((cell, index) => {
        cell.style.width = `${(weights[index] / weightSum) * 100}%`;
      });
      table.querySelectorAll<HTMLElement>("th, td").forEach((cell) => {
        const value = cell.textContent?.trim() ?? "";
        if (cell.title !== value) cell.title = value;
      });
      const recordRow = table.querySelector<HTMLTableRowElement>(
        "tbody tr:not(:has(td[colspan]))",
      );
      // Loading/empty rows must not determine the number of real records.
      if (!recordRow) return;
      const rowBounds = recordRow.getBoundingClientRect();
      const footerBounds = footer.getBoundingClientRect();
      const panelBounds = panel.getBoundingClientRect();
      if (rowBounds.height <= 0 || panelBounds.height <= 0) return;
      const paddingBottom =
        Number.parseFloat(getComputedStyle(panel).paddingBottom) || 0;
      // Read the actual free table area. Viewport breakpoints and CSS row-size
      // estimates can disagree with the rendered layout, especially at zoom.
      // Clamp the footer position when its content overflows after a resize.
      const footerTop = Math.min(
        footerBounds.top,
        panelBounds.bottom - paddingBottom - footerBounds.height,
      );
      const cssRowHeight =
        Number.parseFloat(getComputedStyle(recordRow).height) ||
        rowBounds.height;
      const layout = calculateAdaptiveListLayout(
        rowBounds.top,
        footerTop,
        rowBounds.height / cssRowHeight,
      );
      const density = `${layout.rowHeight}px`;
      if (panel.style.getPropertyValue("--d4-list-row-height") !== density) {
        panel.style.setProperty("--d4-list-row-height", density);
      }
      setPageSize(layout.pageSize);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(panel);
    if (panel.parentElement) resize.observe(panel.parentElement);
    const table = panel.querySelector("table");
    const footer = panel.querySelector(".d4-list-pagination");
    if (table) resize.observe(table);
    if (footer) resize.observe(footer);
    const mutations = new MutationObserver(schedule);
    mutations.observe(panel, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    document.fonts.ready.then(() => {
      if (panel.isConnected) schedule();
    });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      panel.classList.remove("d4-list-panel");
      panel.style.removeProperty("--d4-list-row-height");
    };
  }, [panel, initialPageSize, fitViewportOnly]);

  return { pageSize, panelRef };
}

export function useListPagination<T>(
  items: T[],
  { fitViewportOnly = false } = {},
) {
  const [page, setPage] = useState(1);
  const { pageSize, panelRef } = useListCapacity(8, fitViewportOnly);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const visibleItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );
  const first = items.length ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, items.length);

  return {
    pageSize,
    visibleItems,
    page,
    setPage,
    totalPages,
    first,
    last,
    total: items.length,
    panelRef,
  };
}

export function useServerListPagination(total: number, initialPageSize = 6) {
  const [page, setPage] = useState(1);
  const { pageSize, panelRef } = useListCapacity(initialPageSize);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(
    () => setPage((current) => Math.min(current, totalPages)),
    [totalPages],
  );
  return {
    page,
    setPage,
    pageSize,
    totalPages,
    first: total ? (page - 1) * pageSize + 1 : 0,
    last: Math.min(page * pageSize, total),
    total,
    panelRef,
  };
}

export function ListPagination({
  page,
  setPage,
  totalPages,
  first,
  last,
  total,
  noun,
}: {
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  first: number;
  last: number;
  total: number;
  noun: string;
}) {
  return (
    <footer className="d4-list-pagination">
      <span>
        Hiển thị {first}–{last} trong tổng số {total} {noun}
      </span>
      <div>
        <span>
          Trang{" "}
          <b>
            {page}/{totalPages}
          </b>
        </span>
        <button
          aria-label="Trang trước"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={14} />
        </button>
        <button
          aria-label="Trang sau"
          disabled={page === totalPages}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </footer>
  );
}
