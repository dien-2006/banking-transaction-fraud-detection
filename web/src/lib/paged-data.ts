import type { PageResult } from "@/services/bank.service";

/** Read a complete authorized result set; reject changing or overlapping pages. */
export async function loadAllPages<T>(
  load: (params: { page: number; pageSize: number }) => Promise<PageResult<T>>,
  identify: (item: T) => string | number,
): Promise<T[]> {
  const first = await load({ page: 1, pageSize: 100 });
  if (
    !first ||
    !Array.isArray(first.items) ||
    first.page !== 1 ||
    !Number.isInteger(first.total) ||
    first.total < 0 ||
    !Number.isInteger(first.pageSize) ||
    first.pageSize <= 0
  )
    throw new Error("Phản hồi phân trang không hợp lệ.");
  const items = [...first.items];
  const pages = Math.ceil(first.total / first.pageSize);
  for (let start = 2; start <= pages; start += 4) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(4, pages - start + 1) }, (_, i) =>
        load({ page: start + i, pageSize: first.pageSize }),
      ),
    );
    for (const [offset, page] of batch.entries()) {
      if (
        !page ||
        !Array.isArray(page.items) ||
        page.page !== start + offset ||
        page.total !== first.total ||
        page.pageSize !== first.pageSize ||
        !page.items.length
      )
        throw new Error("Danh sách vừa thay đổi. Vui lòng tải lại.");
      items.push(...page.items);
    }
  }
  const ids = items.map(identify);
  if (
    items.length !== first.total ||
    new Set(ids).size !== first.total ||
    ids.some((id) => id == null || String(id) === "")
  )
    throw new Error("Danh sách vừa thay đổi. Vui lòng tải lại.");
  return items;
}
