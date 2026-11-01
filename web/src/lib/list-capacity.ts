/** Fit complete records between the first record and the pagination footer. */
export function calculateListCapacity(
  firstRowTop: number,
  footerTop: number,
  rowHeight: number,
): number {
  if (!Number.isFinite(rowHeight) || rowHeight <= 0) return 1;
  const available = footerTop - firstRowTop;
  if (!Number.isFinite(available)) return 1;
  return Math.min(100, Math.max(1, Math.floor((available + 0.01) / rowHeight)));
}

/** Add a record when slightly denser rows fit, while preserving button height. */
export function calculateAdaptiveListLayout(
  firstRowTop: number,
  footerTop: number,
  scale = 1,
): { pageSize: number; rowHeight: number } {
  const available = (footerTop - firstRowTop) / scale;
  if (!Number.isFinite(available) || available <= 0 || scale <= 0) {
    return { pageSize: 1, rowHeight: 34 };
  }
  const maximum = calculateListCapacity(0, available, 33);
  const preferred = Math.max(1, Math.ceil((available - 0.01) / 34));
  const pageSize = Math.min(maximum, preferred);
  const rowHeight = Math.max(33, Math.min(36, Math.floor(available / pageSize * 64) / 64));
  return { pageSize, rowHeight };
}
