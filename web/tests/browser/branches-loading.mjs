import assert from "node:assert/strict";
import { fixtureResponse } from "./fixtures.mjs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch();
const base = process.env.WEB_AUDIT_URL || "http://localhost:3001";
try {
  for (const width of [1366, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    let mode = "stalled", requests = 0;
    const pending = [], errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.install();
    await page.addInitScript(() => {
      localStorage.setItem("d4-access-token", "test-only");
      localStorage.setItem("d4-session", JSON.stringify({ role: "admin", id: "1", userId: 1, employeeId: 2, name: "Branch loading test" }));
    });
    await page.route("**/api/v1/**", async route => {
      assert.equal(route.request().method(), "GET");
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/admin/branches")) {
        requests++;
        if (mode === "stalled") { pending.push(route); return; }
        if (mode === "failed") return route.fulfill({ status: 503, json: { message: "Unavailable" } });
        if (mode === "empty") return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 100 } });
      }
      return route.fulfill({ json: fixtureResponse(url, "admin") });
    });
    await page.goto(`${base}/admin/branches`);
    const content = page.locator(".branches-page-content");
    await content.getByText("Đang tải danh sách chi nhánh…", { exact: true }).waitFor();
    assert.ok(await content.locator(".responsive-staff-banner").isVisible());
    assert.equal(await content.locator("section").nth(1).locator("article b").allTextContents().then(x => x.filter(v => v === "—").length), 4);
    await page.clock.runFor(15_001);
    await content.getByRole("alert").filter({ hasText: "Không thể tải danh sách chi nhánh." }).waitFor();
    assert.equal(requests, 1, "A failed branch load must not keep silently retrying");
    assert.ok(await content.getByRole("columnheader", { name: "Tên chi nhánh", exact: true }).isVisible());
    for (const route of pending) await route.abort().catch(() => {});
    mode = "failed";
    await Promise.all([
      page.waitForResponse(r => r.url().includes("/admin/branches") && r.status() === 503),
      content.getByRole("button", { name: "Thử lại", exact: true }).click(),
    ]);
    await page.waitForFunction(() => document.querySelector('[role="alert"] button')?.textContent.includes("Thử lại"));
    mode = "success";
    await content.getByRole("button", { name: "Thử lại", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll(".branches-page-content tbody tr:not(:has(td[colspan]))").length > 0);
    assert.equal(await content.getByRole("alert").count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    mode = "empty";
    await page.reload();
    await content.getByText("Chưa có chi nhánh.", { exact: true }).waitFor();
    assert.equal(await content.getByRole("alert").count(), 0);
    assert.deepEqual(errors, []);
    console.log("PASS branch layout during loading, timeout, API failure, retry and empty data", width);
    await page.close();
  }
} finally { await browser.close(); }
