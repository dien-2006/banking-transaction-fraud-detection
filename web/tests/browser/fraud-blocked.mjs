import assert from "node:assert/strict";
import { fixtureResponse, transactionRows } from "./fixtures.mjs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch();
const base = process.env.WEB_AUDIT_URL || "http://localhost:3001";
try {
  for (const role of ["admin", "employee"]) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(role => {
      localStorage.setItem("d4-access-token", "test-only");
      localStorage.setItem("d4-session", JSON.stringify({ role, id: "1", userId: 1, employeeId: 2, branchId: 3, name: "Risk alert test" }));
    }, role);
    await page.route("**/api/v1/**", async route => {
      assert.equal(route.request().method(), "GET", "Viewing BLOCK alerts must never create or resolve a review");
      const url = new URL(route.request().url());
      let data = fixtureResponse(url, role);
      if (url.pathname.endsWith("/admin/fraud-reviews")) {
        data = { page: 1, pageSize: 100, total: 2, items: [
          { ...transactionRows[0], transactionid: 42, transactioncode: "TX-BLOCK-42", decision: "BLOCK", status: "Cancelled", reviewcaseid: null, reviewstatus: null, reviewcreatedat: null, sourceaccountid: 1 },
          { ...transactionRows[1], transactionid: 43, reviewcaseid: 43, reviewstatus: "OPEN", decision: "REVIEW", status: "Pending", sourceaccountid: 2, reviewcreatedat: "2026-11-21T08:30:00" },
        ] };
      }
      await route.fulfill({ json: data });
    });
    await page.goto(`${base}/${role}/fraud`);
    const rows = page.locator(".fraud-review-table tbody tr");
    await page.getByRole("cell", { name: "RSK42", exact: true }).waitFor();
    await page.getByRole("button", { name: "Giao dịch nghi ngờ", exact: true }).click();
    await page.getByRole("cell", { name: "RSK42", exact: true }).waitFor();
    await page.getByLabel("Trạng thái review", { exact: true }).selectOption("__blocked");
    assert.equal(await rows.count(), 1);
    await rows.getByRole("button", { name: "Xem", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("heading", { name: "Giao dịch đã bị chặn bởi Risk", exact: true }).waitFor();
    assert.equal(await dialog.getByRole("button", { name: /phê duyệt|từ chối/i }).count(), 0);
    assert.equal(await dialog.getByRole("checkbox").count(), 0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Tài khoản cần review", exact: true }).click();
    assert.equal(await page.getByRole("cell", { name: "RSK42", exact: true }).count(), 0);
    assert.equal(await rows.count(), 1, "Only the real pending case requires account review");
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${role}: BLOCK without case is visible, filterable and read-only`);
  }
  const customer = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await customer.addInitScript(() => {
    localStorage.setItem("d4-access-token", "test-only");
    localStorage.setItem("d4-session", JSON.stringify({ role: "customer", id: "101", customerId: 101, deviceId: 1, name: "Customer alert test" }));
  });
  await customer.route("**/api/v1/**", async route => {
    assert.equal(route.request().method(), "GET");
    const url = new URL(route.request().url());
    const data = url.pathname.endsWith("/transactions")
      ? { page: 1, pageSize: 100, total: 1, items: [{ ...transactionRows[0], transactionid: 42, transactioncode: "TX-BLOCK-42", status: "Cancelled", decision: "BLOCK", typecode: "TRANSFER" }] }
      : fixtureResponse(url, "customer");
    await route.fulfill({ json: data });
  });
  await customer.goto(`${base}/customer`);
  await customer.getByRole("button", { name: "Xem chi tiết TX-BLOCK-42", exact: true }).click();
  await customer.getByRole("dialog").getByRole("heading", { name: "Giao dịch bị chặn bởi kiểm soát rủi ro", exact: true }).waitFor();
  await customer.getByRole("dialog").getByText("TX-BLOCK-42", { exact: true }).waitFor();
  await customer.close();
  console.log("PASS customer: cancelled BLOCK details display the transaction reference and risk rejection");
} finally { await browser.close(); }
