import assert from "node:assert/strict";
import { fixtureResponse, transactionRows } from "./fixtures.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch();
const base = process.env.WEB_AUDIT_URL || "http://localhost:3001";
try {
  for (const width of [1366, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const writes = [];
    await page.addInitScript(() => {
      localStorage.setItem("d4-access-token", "test-only");
      localStorage.setItem("d4-session", JSON.stringify({ role: "admin", id: "1", userId: 1, employeeId: 2, branchId: 3, name: "Manual alert test" }));
    });
    await page.route("**/api/v1/**", async (route) => {
      const req = route.request(), url = new URL(req.url());
      if (req.method() === "POST") {
        assert.ok(url.pathname.endsWith("/admin/fraud-reviews"));
        writes.push(req.postDataJSON());
        if (writes.length === 1) return route.fulfill({ status: 404, json: { message: "Không tìm thấy giao dịch với mã đã nhập." } });
        if (writes.length === 2) return route.fulfill({ status: 503, json: { message: "Kết quả chưa xác định" } });
        return route.fulfill({ json: { reviewId: "1", status: "OPEN", reused: true } });
      }
      return route.fulfill({ json: fixtureResponse(url, "admin") });
    });
    await page.goto(`${base}/admin/fraud`);
    await page.getByRole("button", { name: "Tạo cảnh báo thủ công", exact: true }).click();
    const dialog = page.getByRole("dialog");
    assert.equal(await dialog.getByRole("button", { name: "Tạo cảnh báo", exact: true }).isDisabled(), true);
    await dialog.getByLabel("Mã giao dịch *", { exact: true }).fill("MISSING");
    await dialog.getByLabel("Lý do cảnh báo *", { exact: true }).fill("Kiểm tra chứng từ");
    await dialog.getByRole("button", { name: "Tạo cảnh báo", exact: true }).click();
    await dialog.getByRole("alert").waitFor();
    await dialog.getByLabel("Mã giao dịch *", { exact: true }).fill("TX-00000001");
    await dialog.getByRole("button", { name: "Tạo cảnh báo", exact: true }).click();
    await dialog.getByRole("button", { name: "Thử lại", exact: true }).waitFor();
    assert.equal(await dialog.getByLabel("Mã giao dịch *", { exact: true }).isDisabled(), true);
    await dialog.getByRole("button", { name: "Thử lại", exact: true }).click();
    await dialog.getByRole("status").waitFor();
    assert.deepEqual(writes[1], writes[2]);
    assert.equal(writes.length, 3);
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
    await dialog.getByRole("button", { name: "Xem hồ sơ", exact: true }).click();
    await page.getByRole("cell", { name: "RVW1", exact: true }).waitFor();
    console.log(`PASS admin manual alert ${width}`);
    await page.close();
  }
  for (const role of ["employee", "admin"]) {
    for (const width of [1366, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript((role) => {
        localStorage.setItem("d4-access-token", "test-only");
        localStorage.setItem("d4-session", JSON.stringify({ role, id: "1", userId: 1, employeeId: 2, branchId: 3, name: "Review tabs test" }));
      }, role);
      await page.route("**/api/v1/**", async (route) => {
        assert.equal(route.request().method(), "GET", "Tab navigation must not write data");
        const url = new URL(route.request().url());
        const data = fixtureResponse(url, role);
        if (url.pathname.endsWith("/admin/fraud-reviews")) {
          data.items = data.items.slice(0, 5).map((row, index) => ({
            ...row,
            sourceaccountid: [101, 101, 1010, null, 102][index],
            decision: ["REVIEW", "REVIEW", "BLOCK", "REVIEW", "ALLOW"][index],
            reviewstatus: ["OPEN", "IN_REVIEW", "OPEN", "OPEN", "CLOSED"][index],
            status: ["Pending", "Pending", "Cancelled", "Pending", "Success"][index],
          }));
          data.total = 5;
        }
        await route.fulfill({ json: data });
      });
      await page.goto(`${base}/${role}/fraud`);
      const rows = page.locator(".fraud-review-table tbody tr");
      await page.getByRole("cell", { name: "RVW1", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Tạo cảnh báo thủ công", exact: true }).count(), role === "admin" ? 1 : 0);
      const suspicious = page.getByRole("button", { name: "Giao dịch nghi ngờ", exact: true });
      await suspicious.click();
      assert.equal(await suspicious.getAttribute("aria-pressed"), "true");
      assert.ok(await rows.count() > 0 && await rows.count() <= 4);
      assert.match(await page.locator(".fraud-list-panel .d4-list-pagination").innerText(), /tổng số 4/);
      assert.equal(await page.getByRole("cell", { name: "RVW5", exact: true }).count(), 0);
      const accounts = page.getByRole("button", { name: "Tài khoản cần review", exact: true });
      await accounts.click();
      assert.equal(await rows.count(), 2);
      const account = rows.filter({ has: page.getByRole("cell", { name: "TK #101", exact: true }) });
      assert.equal(await account.getByRole("cell", { name: "2", exact: true }).count(), 1);
      await account.getByRole("button", { name: "Xem hồ sơ", exact: true }).click();
      assert.equal(await rows.count(), 2);
      assert.equal(await page.getByRole("cell", { name: "RVW3", exact: true }).count(), 0);
      await rows.filter({ has: page.getByRole("cell", { name: "RVW1", exact: true }) }).getByRole("button", { name: "Xem", exact: true }).click();
      await page.getByRole("dialog").waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Xóa bộ lọc", exact: true }).click();
      assert.ok(await rows.count() > 0 && await rows.count() <= 5);
      assert.match(await page.locator(".fraud-list-panel .d4-list-pagination").innerText(), /tổng số 5/);
      await accounts.click();
      await page.getByLabel("Tìm cảnh báo", { exact: true }).fill("khong-co-tai-khoan");
      await page.getByText("Không có hồ sơ phù hợp.", { exact: true }).waitFor();
      await suspicious.click();
      assert.equal(await page.getByLabel("Tìm cảnh báo", { exact: true }).inputValue(), "");
      assert.ok(await rows.count() > 0 && await rows.count() <= 4);
      assert.match(await page.locator(".fraud-list-panel .d4-list-pagination").innerText(), /tổng số 4/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      console.log(`PASS ${role} fraud tabs ${width}`);
      await page.close();
    }
  }
  for (const role of ["employee", "admin"])
    for (const status of ["Success", "Failed", "Cancelled", 503]) {
      const page = await browser.newPage({
          viewport: { width: 1366, height: 768 },
        }),
        writes = [],
        errors = [];
      let savedReview = null;
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript((role) => {
        localStorage.setItem("d4-access-token", "test-only");
        localStorage.setItem(
          "d4-session",
          JSON.stringify({
            role,
            id: "1",
            userId: 1,
            employeeId: 2,
            branchId: 3,
            name: "Review test",
          }),
        );
      }, role);
      await page.route("**/api/v1/**", async (route) => {
        const req = route.request(),
          url = new URL(req.url());
        if (req.method() === "POST") {
          assert.match(url.pathname, /\/transactions\/reviews\/1$/);
          writes.push(req.postDataJSON());
          if (status === 503 && writes.length === 1)
            return route.fulfill({
              status: 503,
              json: { message: "Lỗi kết nối thử nghiệm" },
            });
          const transaction = {
              ...transactionRows[0],
              transactionid: 1,
              transactioncode: "TX-REVIEW-001",
              amount: "1000",
              status: status === 503 ? "Success" : status,
              ...(status === "Cancelled" ? {
                transactioncode: "TX-881732C46A380596F19C6C66",
                typename: "Chuyển khoản",
                amount: "50000000",
                fee: "0",
                description: "Giao dịch mô phỏng chờ nhân viên thẩm định - theo yêu cầu kiểm thử",
              } : {}),
            };
          savedReview = { ...transaction, reviewcaseid: 1,
            reviewstatus: writes.at(-1).action === "REJECT" ? "REJECTED" : "APPROVED",
            reviewreason: writes.at(-1).reason, revieweruserid: 1,
            reviewedat: "2026-11-11T01:28:00+07:00" };
          return route.fulfill({ json: transaction });
        }
        const data = fixtureResponse(url, role);
        if (savedReview && url.pathname.endsWith("/admin/fraud-reviews")) {
          data.items = data.items.map(item => item.reviewcaseid === 1 ? { ...item, ...savedReview } : item);
        }
        return route.fulfill({ json: data });
      });
      await page.goto(`${base}/${role}/fraud?status=review`);
      const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "RVW1", exact: true }) });
      await row.getByRole("button", { name: "Xem", exact: true }).click();
      const dialog = page.getByRole("dialog");
      const approve = dialog.getByRole("button", {
        name: "Duyệt giao dịch",
        exact: true,
      });
      await assert.rejects(approve.click({ timeout: 300 }));
      await dialog.getByLabel("Lý do xử lý").fill("Đã kiểm tra hồ sơ");
      await dialog.getByRole("checkbox").check();
      await dialog
        .getByRole("button", {
          name:
            status === "Cancelled" ? "Từ chối giao dịch" : "Duyệt giao dịch",
          exact: true,
        })
        .click();
      if (status === 503) {
        await dialog.getByRole("alert").waitFor();
        assert.equal(await dialog.getByLabel("Lý do xử lý").isDisabled(), true);
        await dialog
          .getByRole("button", { name: "Thử lại phê duyệt", exact: true })
          .click();
        assert.deepEqual(writes[0], writes[1]);
      }
      const outcome =
        status === "Failed"
          ? "failed"
          : status === "Cancelled"
            ? "cancelled"
            : "success";
      await dialog
        .locator(`.d4-transaction-result[data-outcome="${outcome}"]`)
        .waitFor();
      const reasonLabel = status === "Cancelled" ? "Lý do từ chối" : "Lý do phê duyệt";
      await dialog.locator(".d4-transaction-result dt").filter({ hasText: reasonLabel }).waitFor();
      assert.match(await dialog.locator(".d4-transaction-result").innerText(), /Đã kiểm tra hồ sơ/);
      assert.equal(
        writes[0].action,
        status === "Cancelled" ? "REJECT" : "APPROVE",
      );
      assert.deepEqual(errors, []);
      if (role === "employee" && status === "Cancelled") {
        for (const viewport of [{ width: 1366, height: 768 }, { width: 1100, height: 640 }, { width: 1000, height: 620 }, { width: 375, height: 812 }]) {
          await page.setViewportSize(viewport);
          const layout = await dialog.evaluate((element) => {
            const content = element.querySelector(".review-dialog-scroll");
            const actions = element.querySelector(".d4-transaction-result > footer").getBoundingClientRect();
            const bounds = element.getBoundingClientRect();
            return { top: bounds.top, bottom: bounds.bottom, right: bounds.right, scroll: content.scrollHeight, height: content.clientHeight, actionsBottom: actions.bottom };
          });
          assert.ok(layout.top >= 0 && layout.bottom <= viewport.height);
          assert.ok(layout.right <= viewport.width);
          assert.ok(layout.scroll <= layout.height + 1, "Review result should fit without scrolling");
          assert.ok(layout.actionsBottom <= viewport.height);
          await page.screenshot({ path: `/tmp/d4-review-result-compact-${viewport.width}.png` });
        }
      }
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.keyboard.press("Escape");
      await page.goto(`${base}/${role}/fraud`);
      await row.getByRole("button", { name: "Xem", exact: true }).click();
      const summary = dialog.getByRole("region", { name: "Thông tin xử lý hồ sơ", exact: true });
      await summary.getByRole("heading", { name: reasonLabel, exact: true }).waitFor();
      assert.match(await summary.innerText(), /Đã kiểm tra hồ sơ/);
      assert.match(await summary.innerText(), /01:28:00 11\/11\/2026/);
      assert.equal(await dialog.getByRole("button", { name: "Duyệt giao dịch", exact: true }).count(), 0);
      if (role === "employee" && status === "Cancelled") await page.screenshot({ path: "/tmp/d4-rejected-review-saved-reason.png" });
      console.log(`PASS ${role} review ${status}`);
      await page.close();
    }
} finally {
  await browser.close();
}
