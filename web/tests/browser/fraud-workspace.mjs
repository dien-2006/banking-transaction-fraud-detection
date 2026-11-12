import assert from "node:assert/strict";
import { fixtureResponse } from "./fixtures.mjs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch();
const base = process.env.WEB_AUDIT_URL || "http://localhost:3001";
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, timezoneId: "America/New_York" });
  await page.addInitScript(() => {
    localStorage.setItem("d4-access-token", "test-only");
    localStorage.setItem("d4-session", JSON.stringify({ role: "employee", id: "1", userId: 1, employeeId: 2, branchId: 3, name: "Review test" }));
  });
  let transactionStatus = "Pending";
  const writes = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST") {
      assert.match(url.pathname, /\/transactions\/reviews\/1$/);
      writes.push(request.postDataJSON());
      return route.fulfill({ status: 503, json: { message: "Lỗi kết nối thử nghiệm" } });
    }
    let response = fixtureResponse(url, "employee");
    if (url.pathname.endsWith("/admin/fraud-reviews")) {
      response = { ...response, total: 1, items: [{ ...response.items[0], status: transactionStatus, reviewcreatedat: "2026-11-01T00:30:00" }] };
    }
    await route.fulfill({ json: response });
  });
  await page.goto(`${base}/employee/fraud`);
  const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "RVW1", exact: true }) });
  await row.waitFor();
  assert.match(await row.locator("time").innerText(), /01\/11\/2026\s+00:30/);
  await row.getByRole("button", { name: "Xem", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  for (const viewport of [{ width: 1536, height: 1024 }, { width: 1366, height: 768 }, { width: 1100, height: 640 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport);
    const layout = await dialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const footer = element.querySelector(".review-dialog-footer").getBoundingClientRect();
      const content = element.querySelector(".review-dialog-scroll");
      return { top: bounds.top, bottom: bounds.bottom, right: bounds.right, footerBottom: footer.bottom, contentHeight: content.clientHeight, contentScroll: content.scrollHeight };
    });
    assert.ok(layout.top >= 0 && layout.bottom <= viewport.height);
    assert.ok(layout.right <= viewport.width);
    assert.ok(layout.footerBottom <= viewport.height);
    if (viewport.width > 700) assert.ok(layout.contentScroll <= layout.contentHeight + 1, "Desktop review should fit without scrolling");
    await page.screenshot({ path: `/tmp/d4-review-dialog-${viewport.width}.png` });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await dialog.getByLabel("Lý do xử lý").fill("Đã kiểm tra");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Duyệt giao dịch", exact: true }).click();
  await dialog.getByRole("alert").waitFor();
  await page.keyboard.press("Escape");
  await row.getByRole("button", { name: "Xem", exact: true }).click();
  assert.equal(await dialog.getByRole("checkbox").isChecked(), false);
  assert.equal(await dialog.getByLabel("Lý do xử lý").inputValue(), "");
  assert.equal(await dialog.getByLabel("Lý do xử lý").isEnabled(), true);
  assert.equal(await dialog.getByRole("button", { name: "Duyệt giao dịch", exact: true }).isDisabled(), true);
  await page.keyboard.press("Escape");
  transactionStatus = "Success";
  await page.reload();
  await row.getByRole("button", { name: "Xem", exact: true }).click();
  await dialog.waitFor();
  assert.equal(await dialog.getByRole("alert").count(), 0);
  assert.equal(await dialog.getByRole("button", { name: "Duyệt giao dịch", exact: true }).count(), 0);
  assert.equal(await dialog.getByRole("button", { name: "Từ chối giao dịch", exact: true }).count(), 0);
  assert.equal(writes.length, 1);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".fraud-data-warning").count(), 0);
  await page.unrouteAll();
  await page.route("**/api/v1/**", (route) => route.fulfill({ json: fixtureResponse(new URL(route.request().url()), "employee") }));
  await page.goto(`${base}/employee/fraud?status=review`);
  await page.getByRole("button", { name: "Xóa bộ lọc", exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector(".fraud-filter-summary")?.textContent.includes("10 / 24"));
  await page.getByRole("button", { name: "Xóa bộ lọc", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".fraud-filter-summary")?.textContent.includes("24 / 24"));
  const statusFilter = page.getByLabel("Trạng thái review", { exact: true });
  assert.equal(await statusFilter.locator("optgroup").count(), 0);
  assert.deepEqual(await statusFilter.locator("option:not([hidden])").allTextContents(), ["Tất cả trạng thái", "Chờ thẩm định", "Đang thẩm định", "Đã phê duyệt", "Đã từ chối", "Đã đóng"]);
  await statusFilter.selectOption("IN_REVIEW");
  await page.waitForFunction(() => document.querySelector(".fraud-filter-summary")?.textContent.includes("5 / 24"));
  for (const cell of await page.locator(".fraud-review-table tbody tr td:nth-child(6)").allTextContents()) assert.equal(cell.trim(), "Đang thẩm định");
  await statusFilter.selectOption("OPEN");
  await page.waitForFunction(() => document.querySelector(".fraud-filter-summary")?.textContent.includes("5 / 24"));
  for (const cell of await page.locator(".fraud-review-table tbody tr td:nth-child(6)").allTextContents()) assert.equal(cell.trim(), "Chờ thẩm định");
  await page.locator(".fraud-sidebar").getByRole("button", { name: "Xem tất cả →", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".fraud-filter-summary")?.textContent.includes("10 / 24"));
  await page.getByRole("button", { name: "Xóa bộ lọc", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".fraud-filter-summary")?.textContent.includes("24 / 24"));
  const action = await page.locator(".fraud-review-table tbody tr").first().getByRole("button", { name: "Xem", exact: true }).boundingBox();
  const region = await page.getByRole("region", { name: "Bảng hồ sơ review", exact: true }).boundingBox();
  assert.ok(action.x >= region.x && action.x + action.width <= region.x + region.width + 1, "Review action must remain visible without horizontal scrolling");
  const pager = await page.locator(".fraud-list-panel .d4-list-pagination").boundingBox();
  assert.ok(pager.y + pager.height <= 768, "List pagination must remain visible in the viewport");
  const filterPositions = await page.locator(".fraud-filters > *").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
  assert.ok(filterPositions.every((top) => Math.abs(top - filterPositions[0]) < 1), "Desktop search and filters should fit on one row");
  await page.screenshot({ path: "/tmp/d4-fraud-list-restored.png" });
  console.log("PASS bank timezone, fresh review confirmation, and no review actions on a successful transaction");
  console.log("PASS clearing filters restores all records and review action stays visible");
} finally {
  await browser.close();
}
