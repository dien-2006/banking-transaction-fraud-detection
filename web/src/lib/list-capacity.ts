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
