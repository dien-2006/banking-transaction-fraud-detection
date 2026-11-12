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
    window.__receiptText = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      window.__receiptText.push(String(args[0]));
      return fillText.apply(this, args);
    };
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
async function downloadReceipt(page, box, name) {
  await page.evaluate(() => { window.__receiptText = []; });
  const pending = page.waitForEvent("download");
  await box.getByRole("button", { name: "Tải ảnh giao dịch", exact: true }).click();
  const download = await pending;
  assert.match(download.suggestedFilename(), /^D4Bank-.+\.png$/);
  const image = await readFile(await download.path());
  assert.deepEqual([...image.subarray(0, 8)], [137,80,78,71,13,10,26,10], "Download must be a real PNG");
  assert.equal(image.readUInt32BE(16), 1800, "Export resolution is independent of the viewport");
  const size = await page.evaluate(async base64 => {
    const image = new Image();
    image.src = "data:image/png;base64," + base64;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, image.toString("base64"));
  assert.ok(size[1] > 600, "Full receipt decodes as a nonempty image");
  const painted = await page.evaluate(() => window.__receiptText);
  const status = (await box.locator(".d4-result-badge").innerText()).trim();
  assert.ok(painted.includes(status), "Export preserves the actual transaction status");
  assert.ok(painted.includes("Mã giao dịch"));
  await download.saveAs(`/tmp/d4-results/receipt-${name}.png`);
  return painted;
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
      const content = await downloadReceipt(page, box, `customer-${status}`);
      assert.ok(content.includes("TX-RESULT-001"));
      const labels = {
        Success: "Thành công",
        Failed: "Thất bại",
        Pending: "Chờ phê duyệt",
        Cancelled: "Đã hủy",
      };
      assert.ok(content.includes(labels[status]));
      if (status === "Pending") {
        await box.getByRole("heading", { name: "Giao dịch đang chờ nhân viên phê duyệt", exact: true }).waitFor();
        assert.match(await box.innerText(), /Tiền chưa được hạch toán/);
        await page.screenshot({ path: "/tmp/d4-customer-pending-review.png" });
      }
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
          .getByRole("button", { name: "Tải ảnh giao dịch", exact: true })
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
      const box = await result(page, status);
      if (["Success", "Failed", "Pending", "Cancelled"].includes(status)) {
        await downloadReceipt(page, box, `${role}-counter-${status}`);
      }
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
        const box = await result(page, status);
        if (["Success", "Failed"].includes(status)) {
          await downloadReceipt(page, box, `${role}-${type}-${status}`);
        }
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
    await downloadReceipt(page, box, `${role}-history`);
    if (role === "customer") {
      // A browser export failure must show feedback and allow a later retry.
      await page.evaluate(() => {
        const original = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (callback) {
          HTMLCanvasElement.prototype.toBlob = original;
          callback(null);
        };
      });
      await box.getByRole("button", { name: "Tải ảnh giao dịch", exact: true }).click();
      await box.getByText("Không thể tải ảnh giao dịch. Vui lòng thử lại.", { exact: true }).waitFor();
      await downloadReceipt(page, box, "customer-history-retry");
    }
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
    const painted = await downloadReceipt(page, result, route.replaceAll("/", "-"));
    if (route === "/customer") assert.ok(painted.includes("••••••"), "Hidden amounts remain hidden in the exported image");
    await page.close();
    console.log("PASS shared customer detail", route);
  }
} finally {
  await browser.close();
}
assert.deepEqual(errors, []);
console.log("PASS unified results; all API writes mocked");
