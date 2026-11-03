import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { fixtureResponse, transactionRows } from "./fixtures.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch(),
  errors = [],
  base = process.env.WEB_AUDIT_URL || "http://localhost:3001";
await mkdir("/tmp/d4-results", { recursive: true });
const outcomes = {
  Success: "success",
  Failed: "failed",
  Pending: "pending",
  Cancelled: "cancelled",
  503: "unknown",
  422: "rejected",
  MALFORMED: "unknown",
};
const cases = (values) =>
  values.filter(
    (status) =>
      !process.env.RESULT_STATUS ||
      String(status) === process.env.RESULT_STATUS,
  );
async function fixture(role, status, viewport = { width: 1366, height: 768 }) {
  const page = await browser.newPage({ viewport, acceptDownloads: true }),
    writes = [];
  let otpContext;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((role) => {
    localStorage.setItem("d4-access-token", "test-only");
    localStorage.setItem(
      "d4-session",
      JSON.stringify({
        role,
        id: "101",
        customerId: role === "customer" ? 101 : undefined,
        userId: 1,
        employeeId: 2,
        branchId: 3,
        deviceId: 1,
        name: "Kiểm tra kết quả",
      }),
    );
  }, role);
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    try {
      if (url.pathname.includes("/transactions/destinations/")) {
        await route.fulfill({
          json: {
            accountId: 999,
            accountNumber: "9988776655",
            accountName: "Nguyễn Người Nhận",
            currency: "VND",
            bankName: "D4 Bank",
          },
        });
        return;
      }
      if (url.pathname.endsWith("/sources/1/holders")) {
        await route.fulfill({
          json: [
            {
              customerid: 101,
              customercode: "C101",
              fullname: "Khách hàng yêu cầu",
              holdertype: "PRIMARY_OWNER",
            },
          ],
        });
        return;
      }
      if (url.pathname.endsWith("/security/otp/request")) {
        otpContext = req.postDataJSON();
        await route.fulfill({
          json: {
            challengeId: "mock-challenge-1234567890",
            expiresIn: 300,
            destinationMasked: "te***@example.test",
          },
        });
        return;
      }
      if (url.pathname.endsWith("/security/otp/verify")) {
        const { challengeId, code, ...context } = req.postDataJSON();
        assert.ok(challengeId && code);
        assert.deepEqual(context, otpContext);
        await route.fulfill({
          json: {
            authorizationToken: "mock-authorization-1234567890",
            expiresIn: 120,
          },
        });
        return;
      }
      if (req.method() === "POST") {
        assert.ok(
          [
            "/api/v1/transactions/transfers",
            "/api/v1/transactions/counter-transfers",
            "/api/v1/transactions/account-movements",
          ].includes(url.pathname),
        );
        if (url.pathname.endsWith("/transactions/transfers")) {
          const { otpAuthorizationToken, ...context } = req.postDataJSON();
          assert.ok(otpAuthorizationToken);
          assert.deepEqual(context, otpContext);
        }
        writes.push(req.postDataJSON());
        if (status === "MALFORMED") {
          await route.fulfill({ json: null });
          return;
        }
        if (typeof status === "number") {
          await route.fulfill({
            status,
            json: {
              message:
                status === 503
                  ? "Kết nối bị gián đoạn"
                  : "Thông tin lệnh không hợp lệ",
            },
          });
          return;
        }
        await route.fulfill({
          json: {
            ...transactionRows[0],
            transactioncode: "TX-RESULT-001",
            status,
            amount: "1000",
            fee: "0",
            currency: "VND",
            transactiondate: "2026-11-01T10:30:00Z",
          },
        });
        return;
      }
      await route.fulfill({ json: fixtureResponse(url, role) });
    } catch (error) {
      errors.push(error.message);
      await route.fulfill({
        status: 500,
        json: { message: "Fixture failure" },
      });
    }
  });
  return { page, writes };
}
async function result(page, status) {
  const box = page.locator(".d4-transaction-result");
  await box.waitFor();
  assert.equal(await box.getAttribute("data-outcome"), outcomes[status]);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  if (status !== "Success")
    assert.equal(
      await box
        .getByRole("heading", { name: "Giao dịch thành công", exact: true })
        .count(),
      0,
    );
  return box;
}
try {
  for (const status of cases([
    "Success",
    "Failed",
    "Pending",
    "Cancelled",
    503,
    422,
    "MALFORMED",
  ])) {
    const { page, writes } = await fixture(
      "customer",
      status,
      status === "Failed" ? { width: 375, height: 812 } : undefined,
    );
    await page.goto(base + "/customer/transfer");
    await page.getByLabel("Tài khoản nhận", { exact: true }).fill("9988776655");
    await page.getByText("Nguyễn Người Nhận", { exact: true }).waitFor();
    await page.getByLabel("Số tiền", { exact: true }).fill("1000");
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await page
      .getByLabel("Mã xác nhận gồm 6 chữ số", { exact: true })
      .fill("123456");
    await page
      .getByRole("button", { name: "Xác nhận chuyển tiền", exact: true })
      .click();
    const box = await result(page, status);
    assert.equal(writes.length, 1);
    if (typeof status === "string" && status !== "MALFORMED") {
      assert.match(await box.innerText(), /TX-RESULT-001/);
      const download = page.waitForEvent("download");
      await box
        .getByRole("button", { name: "Tải thông tin giao dịch", exact: true })
        .click();
      const file = await download;
      assert.match(file.suggestedFilename(), /TX-RESULT-001/);
      const content = await readFile(await file.path(), "utf8");
      const labels = {
        Success: "Thành công",
        Failed: "Thất bại",
        Pending: "Đang xử lý",
        Cancelled: "Đã hủy",
      };
      assert.ok(content.includes(`Trạng thái: ${labels[status]}`));
      if (status === "Success") {
        await page
          .context()
          .grantPermissions(["clipboard-read", "clipboard-write"]);
        await box
          .getByRole("button", { name: "Sao chép mã", exact: true })
          .click();
        await box
          .getByText("Đã sao chép mã giao dịch.", { exact: true })
          .waitFor();
        assert.equal(
          await page.evaluate(() => navigator.clipboard.readText()),
          "TX-RESULT-001",
        );
      }
    } else
      assert.equal(
        await box
          .getByRole("button", { name: "Tải thông tin giao dịch", exact: true })
          .count(),
        0,
      );
    if (status === 503) {
      await page
        .getByRole("button", { name: "Xác nhận chuyển tiền", exact: true })
        .click();
      await page.waitForTimeout(200);
      assert.equal(writes.length, 2);
      assert.deepEqual(writes[0], writes[1]);
    }
    await box.locator(".d4-result-heading").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/d4-results/customer-${status}.png`,
      fullPage: true,
    });
    await page.close();
    console.log("PASS customer transfer result", status);
  }
  for (const role of ["employee", "admin"])
    for (const status of cases([
      "Success",
      "Failed",
      "Pending",
      "Cancelled",
      503,
      422,
      "MALFORMED",
    ])) {
      const { page, writes } = await fixture(
        role,
        status,
        status === "Failed" ? { width: 375, height: 812 } : undefined,
      );
      await page.goto(`${base}/${role}/transactions`);
      await page
        .getByRole("button", { name: "Chuyển khoản tại quầy", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByLabel("Tài khoản nguồn", { exact: true })
        .selectOption("1");
      await dialog
        .getByLabel("Khách hàng yêu cầu", { exact: true })
        .selectOption("101");
      await dialog
        .getByLabel("Tài khoản nhận", { exact: true })
        .fill("9988776655");
      await dialog
        .getByText("Người nhận: Nguyễn Người Nhận", { exact: true })
        .waitFor();
      await dialog.getByLabel("Số tiền (VND)", { exact: true }).fill("1000");
      await dialog
        .getByRole("button", { name: "Kiểm tra lệnh chuyển", exact: true })
        .click();
      await dialog.getByRole("checkbox").check();
      await dialog
        .getByRole("button", { name: "Xác nhận chuyển khoản", exact: true })
        .click();
      await result(page, status);
      assert.equal(writes.length, 1);
      await page.close();
      console.log("PASS", role, "counter result", status);
    }
  for (const role of ["employee", "admin"])
    for (const type of ["DEPOSIT", "WITHDRAWAL"])
      for (const status of cases(["Success", "Failed", 503, "MALFORMED"])) {
        const { page, writes } = await fixture(role, status);
        await page.goto(`${base}/${role}/transactions`);
        await page
          .getByRole("button", { name: "Tạo giao dịch", exact: true })
          .click();
        const dialog = page.getByRole("dialog");
        await dialog.locator("select").first().selectOption(type);
        await dialog
          .locator('select[name="customerAccountId"]')
          .selectOption("1");
        await dialog
          .locator('select[name="internalAccountId"]')
          .selectOption("24");
        await dialog.locator('input[name="amount"]').fill("1000");
        await dialog
          .getByRole("button", { name: "Xác nhận giao dịch", exact: true })
          .click();
        await result(page, status);
        assert.equal(writes.length, 1);
        assert.equal(writes[0].type, type);
        await page.close();
        console.log("PASS", role, type, "result", status);
      }
  // Detail screens share the same status treatment in all three roles.
  for (const role of ["customer", "employee", "admin"]) {
    const { page } = await fixture(role, "Success");
    await page.goto(`${base}/${role}/transactions`);
    await page
      .locator("tbody")
      .getByRole(
        "button",
        role === "customer"
          ? { name: /^Xem giao dịch / }
          : { name: "Xem", exact: true },
      )
      .first()
      .click();
    const box = page.getByRole("dialog").locator(".d4-transaction-result");
    await box.waitFor();
    assert.ok(
      ["success", "failed", "pending", "cancelled"].includes(
        await box.getAttribute("data-outcome"),
      ),
    );
    await page.close();
    console.log("PASS", role, "history result screen");
  }
  for (const route of ["/customer", "/customer/accounts", "/customer/cards"]) {
    const { page } = await fixture("customer", "Success");
    await page.goto(base + route);
    if (route === "/customer")
      await page.getByRole("button", { name: "Ẩn số dư", exact: true }).click();
    await page
      .locator("tbody")
      .getByRole("button", {
        name: /^(Xem chi tiết|Chi tiết|Xem giao dịch) TX-/,
      })
      .first()
      .click();
    const result = page.getByRole("dialog").locator(".d4-transaction-result");
    await result.waitFor();
    if (route === "/customer")
      assert.match(
        await result.locator(".d4-result-heading > strong").innerText(),
        /•/,
      );
    await page.close();
    console.log("PASS shared customer detail", route);
  }
} finally {
  await browser.close();
}
assert.deepEqual(errors, []);
console.log("PASS unified results; all API writes mocked");
