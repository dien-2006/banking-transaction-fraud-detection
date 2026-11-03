import assert from "node:assert/strict";
import { fixtureResponse, transactionRows } from "./fixtures.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch();
const base = process.env.WEB_AUDIT_URL || "http://localhost:3001";
try {
  for (const role of ["employee", "admin"])
    for (const status of ["Success", "Failed", "Cancelled", 503]) {
      const page = await browser.newPage({
          viewport: { width: 1366, height: 768 },
        }),
        writes = [],
        errors = [];
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
          return route.fulfill({
            json: {
              ...transactionRows[0],
              transactionid: 1,
              transactioncode: "TX-REVIEW-001",
              amount: "1000",
              status: status === 503 ? "Success" : status,
            },
          });
        }
        return route.fulfill({ json: fixtureResponse(url, role) });
      });
      await page.goto(`${base}/${role}/fraud?status=review`);
      const row = page.getByRole("row").filter({ hasText: "RVW1" }).first();
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
      assert.equal(
        writes[0].action,
        status === "Cancelled" ? "REJECT" : "APPROVE",
      );
      assert.deepEqual(errors, []);
      console.log(`PASS ${role} review ${status}`);
      await page.close();
    }
} finally {
  await browser.close();
}
