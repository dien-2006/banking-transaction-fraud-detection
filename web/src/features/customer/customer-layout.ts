"use client";

import { useCallback, useEffect, useState } from "react";

/** Fit whole cards, loan records or notices in the shared desktop workspace. */
export function useCustomerRecordCapacity(
  selector: string,
  initialSize: number,
  useMinimumHeight = false,
) {
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const [pageSize, setPageSize] = useState(initialSize);
  const bodyRef = useCallback(
    (element: HTMLDivElement | null) => setBody(element),
    [],
  );

  useEffect(() => {
    if (!body) return;
    const desktop = window.matchMedia(
      "(min-width: 1100px) and (min-height: 640px)",
    );
    let frame = 0;
    const measure = () => {
      if (!desktop.matches) {
        setPageSize(initialSize);
        return;
      }
      const record = body.querySelector<HTMLElement>(selector);
      if (!record || !record.parentElement) return;
      const layout = getComputedStyle(record.parentElement);
      const gap = Number.parseFloat(layout.rowGap) || 0;
      const columns =
        layout.display === "grid"
          ? layout.gridTemplateColumns.split(" ").length
          : 1;
      const padding =
        (Number.parseFloat(layout.paddingTop) || 0) +
        (Number.parseFloat(layout.paddingBottom) || 0);
      const rowHeight = Math.max(
        ...Array.from(
          body.querySelectorAll<HTMLElement>(selector),
          (item) =>
            (useMinimumHeight &&
              Number.parseFloat(getComputedStyle(item).minHeight)) ||
            item.getBoundingClientRect().height,
        ),
      );
      if (rowHeight <= 0) return;
      const rows = Math.max(
        1,
        Math.floor((body.clientHeight - padding + gap) / (rowHeight + gap)),
      );
      setPageSize(Math.min(100, rows * columns));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(body);
    const mutation = new MutationObserver(schedule);
    mutation.observe(body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    window.addEventListener("resize", schedule);
    document.fonts.ready.then(() => {
      if (body.isConnected) schedule();
    });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [body, selector, initialSize, useMinimumHeight]);

  return { pageSize, bodyRef };
}
