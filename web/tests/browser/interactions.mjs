import assert from "node:assert/strict";
import { fixtureResponse, accountRows } from "./fixtures.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch(),
  base = process.env.WEB_AUDIT_URL || "http://localhost:3001",
  errors = [];
async function fixture(role, custom) {
  const page = await browser.newPage({
      viewport: { width: 1366, height: 768 },
      timezoneId: "America/New_York",
    }),
    calls = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((role) => {
    localStorage.setItem("d4-access-token", "test-only");
    localStorage.setItem(
      "d4-session",
      JSON.stringify({
        id: "101",
        role,
        customerId: 101,
        userId: 1,
        employeeId: 2,
        deviceId: 1,
        branchId: 3,
        name: "Kiểm tra",
        subtitle: "Kiểm tra",
      }),
    );
  }, role);
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    calls.push({
      path: url.pathname,
      method: req.method(),
      search: url.search,
    });
    try {
      if (await custom?.(route, url, req)) return;
      assert.equal(req.method(), "GET", `Unexpected write to ${url.pathname}`);
      if (role === "customer")
        assert.ok(!/\/admin\/|\/management\//.test(url.pathname));
      if (role === "employee")
        assert.notEqual(url.pathname, "/api/v1/analytics");
      await route.fulfill({ json: fixtureResponse(url, role) });
    } catch (error) {
      errors.push(error.message);
      await route.fulfill({
        status: 500,
        json: { message: "Fixture failure" },
      });
    }
  });
  return { page, calls };
}
async function open(page, path) {
  await page.goto(base + path);
  await page.locator("#main-content").waitFor();
  await page.waitForLoadState("networkidle");
}
try {
  for (const role of ["admin", "employee"]) {
    const { page, calls } = await fixture(role);
    await open(page, `/${role}/cards`);
    const list = page
      .locator(".d4-list-panel")
      .filter({ has: page.locator("table") })
      .first();
    await list
      .getByRole("button", { name: "Xem", exact: true })
      .first()
      .click();
    await page.getByRole("dialog").waitFor();
    assert.match(await page.getByRole("dialog").innerText(), /\*|•/);
    await page.keyboard.press("Escape");
    await page
      .getByLabel("Trạng thái thẻ", { exact: true })
      .selectOption({ label: "Đang hoạt động" });
    await page.waitForTimeout(100);
    assert.ok((await list.locator("tbody tr").count()) > 0);
    assert.ok((await list.locator("tbody tr").count()) <= 3);
    await page.getByLabel("Tìm kiếm thẻ", { exact: true }).fill("NO-SUCH-CARD");
    await page
      .getByText(/Không có thẻ/)
      .first()
      .waitFor();
    await open(page, `/${role}/fraud`);
    await page
      .getByLabel("Tìm cảnh báo", { exact: true })
      .fill("NO-SUCH-REVIEW");
    await page.waitForTimeout(100);
    assert.equal(
      await page.locator("tbody tr:not(:has(td[colspan]))").count(),
      0,
    );
    await open(page, `/${role}/accounts`);
    await page
      .getByRole("button", { name: "Thêm tài khoản", exact: true })
      .click();
    const branch = page
      .getByRole("dialog")
      .getByLabel("Chi nhánh", { exact: true });
    await branch.locator("option[value='3']").waitFor({ state: "attached" });
    assert.equal(
      await branch.locator("option").count(),
      role === "employee" ? 2 : 13,
    );
    await page.keyboard.press("Escape");
    assert.equal(
      calls.some((call) => call.method !== "GET"),
      false,
    );
    await page.close();
    console.log(
      "PASS",
      role,
      "card details, status/search filters and fraud empty results",
    );
  }
  for (const role of ["admin", "employee", "customer"]) {
    let submissions = 0;
    const { page } = await fixture(role, async (route, url, req) => {
      if (req.method() === "POST") {
        assert.equal(
          url.pathname,
          role === "customer" ? "/api/v1/me/password" : "/api/v1/auth/password",
        );
        submissions++;
        if (submissions === 1)
          await route.fulfill({
            status: 401,
            json: {
              code: "AUTH_INVALID",
              message: "Mật khẩu hiện tại không đúng.",
            },
          });
        else {
          await new Promise((resolve) => setTimeout(resolve, 350));
          await route.fulfill({ status: 204, body: "" });
        }
        return true;
      }
      return false;
    });
    await open(page, `/${role}/profile`);
    await page
      .getByRole("button", { name: "Đổi mật khẩu", exact: true })
      .click();
    await page
      .getByLabel("Mật khẩu hiện tại", { exact: true })
      .fill("wrong-password");
    await page.getByLabel("Mật khẩu mới", { exact: true }).fill("new-password");
    await page
      .getByLabel("Xác nhận mật khẩu mới", { exact: true })
      .fill("does-not-match");
    await page
      .getByRole("button", { name: "Xác nhận đổi mật khẩu", exact: true })
      .click();
    await page
      .getByText("Mật khẩu xác nhận không khớp.", { exact: true })
      .waitFor();
    assert.equal(submissions, 0);
    await page
      .getByLabel("Xác nhận mật khẩu mới", { exact: true })
      .fill("new-password");
    await page
      .getByRole("button", { name: "Xác nhận đổi mật khẩu", exact: true })
      .click();
    await page
      .getByText("Mật khẩu hiện tại không đúng.", { exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("d4-access-token")),
      "test-only",
    );
    await page
      .getByLabel("Mật khẩu hiện tại", { exact: true })
      .fill("current-password");
    await page
      .getByRole("button", { name: "Xác nhận đổi mật khẩu", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Đang cập nhật…", exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Mật khẩu mới", { exact: true }).isDisabled(),
      true,
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 1);
    await page
      .locator(".cp-feedback")
      .filter({ hasText: "Đổi mật khẩu thành công." })
      .waitFor();
    assert.equal(submissions, 2);
    await page.close();
    console.log(
      "PASS",
      role,
      "password validation, error/retry and pending-dialog locking (mock only)",
    );
  }
  const report = await fixture("employee");
  await open(report.page, "/employee/reports");
  await report.page.getByLabel("Từ ngày", { exact: true }).fill("2026-11-30");
  await report.page.getByLabel("Đến ngày", { exact: true }).fill("2026-11-01");
  await report.page
    .getByRole("button", { name: "Áp dụng", exact: true })
    .click();
  await report.page.locator("#main-content").getByRole("alert").waitFor();
  const before = report.calls.length;
  await report.page.getByLabel("Từ ngày", { exact: true }).fill("2026-10-01");
  await report.page
    .getByRole("button", { name: "Áp dụng", exact: true })
    .click();
  await report.page.waitForLoadState("networkidle");
  assert.ok(report.calls.length > before);
  const range = new URLSearchParams(report.calls.at(-1).search);
  assert.equal(range.get("from"), "2026-10-01T00:00:00");
  assert.equal(range.get("to"), "2026-11-02T00:00:00");
  await report.page.close();
  console.log(
    "PASS employee report rejects reversed dates and includes end day",
  );
  const transfer = await fixture("customer", async (route, url) => {
    if (url.pathname.startsWith("/api/v1/transactions/destinations/")) {
      await route.fulfill({
        json: {
          accountId: 999,
          accountNumber: "9988776655",
          accountName: "Nguyễn Người Nhận",
          currency: "VND",
        },
      });
      return true;
    }
    return false;
  });
  await open(transfer.page, "/customer/transfer");
  await transfer.page
    .getByRole("button", { name: "Tài khoản nguồn", exact: true })
    .click();
  await transfer.page.getByRole("dialog").waitFor();
  await transfer.page
    .getByRole("dialog")
    .getByRole("button")
    .filter({ hasText: accountRows[1].accountnumber })
    .click();
  await transfer.page
    .getByLabel("Tài khoản nhận", { exact: true })
    .fill("9988776655");
  await transfer.page.getByText("Nguyễn Người Nhận", { exact: true }).waitFor();
  await transfer.page.getByLabel("Số tiền", { exact: true }).fill("1000");
  await transfer.page
    .getByRole("button", { name: "Tiếp tục", exact: true })
    .click();
  await transfer.page
    .getByRole("heading", { name: "Xác nhận giao dịch", exact: true })
    .waitFor();
  assert.equal(
    transfer.calls.filter((call) =>
      call.path.includes("/transactions/destinations/"),
    ).length,
    2,
  );
  assert.equal(
    transfer.calls.every((call) => call.method === "GET"),
    true,
  );
  await transfer.page.close();
  console.log(
    "PASS transfer source picker, automatic recipient verification and confirmation recheck; no financial writes",
  );
  for (const role of ["admin", "employee", "customer"]) {
    let unavailable = true;
    const { page } = await fixture(role, async (route, url) => {
      if (unavailable && /\/(me|admin)\/notifications$/.test(url.pathname)) {
        await route.fulfill({
          status: 403,
          json: { message: "Không thể tải thông báo" },
        });
        return true;
      }
      return false;
    });
    await open(page, `/${role}`);
    await page.getByRole("button", { name: /^Thông báo, / }).click();
    const menu = page.getByRole("menu");
    await menu.getByRole("alert").waitFor();
    assert.equal(
      await menu.getByText("Chưa có thông báo.", { exact: true }).count(),
      0,
    );
    unavailable = false;
    await menu.getByRole("button", { name: "Thử lại", exact: true }).click();
    await menu.getByRole("menuitem").first().waitFor();
    if (role === "customer")
      assert.match(await menu.innerText(), /Giao dịch thành công/);
    await menu
      .getByRole("button", { name: "Đánh dấu đã đọc", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Thông báo, 0 chưa đọc", exact: true })
      .waitFor();
    await page.close();
    console.log(
      "PASS",
      role,
      "notification error/retry, localized labels and read state",
    );
  }
  {
    const { page } = await fixture("customer");
    await page.addInitScript(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith("d4-read-notifications:"))
          throw new Error("Storage blocked in test");
        return set.call(this, key, value);
      };
    });
    await open(page, "/customer/notifications");
    await page.locator(".customer-read-notice").first().waitFor();
    await page.getByRole("button", { name: /^Thông báo, / }).click();
    await page
      .getByRole("menu")
      .getByRole("button", { name: "Đánh dấu đã đọc", exact: true })
      .click();
    await page.keyboard.press("Escape");
    assert.equal(
      await page
        .locator(".customer-read-notice")
        .first()
        .evaluate((el) => el.classList.contains("unread")),
      false,
    );
    await page
      .getByRole("button", { name: "Thông báo, 0 chưa đọc", exact: true })
      .waitFor();
    await page.close();
    console.log(
      "PASS notification read state stays synchronized when storage writes are blocked",
    );
  }
  const login = await browser.newPage({
    viewport: { width: 1366, height: 768 },
  });
  login.on("pageerror", (e) => errors.push(e.message));
  await login.route("**/api/v1/**", (route) =>
    route.fulfill({
      status: 401,
      json: { code: "AUTH_INVALID", message: "Wrong credentials" },
    }),
  );
  await login.goto(base + "/login");
  await login.getByLabel("Tên đăng nhập", { exact: true }).fill("wrong-user");
  await login.getByLabel("Mật khẩu", { exact: true }).fill("wrong-password");
  await login
    .getByRole("button", { name: "Hiện mật khẩu", exact: true })
    .click();
  assert.equal(
    await login.getByLabel("Mật khẩu", { exact: true }).getAttribute("type"),
    "text",
  );
  await login.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await login.getByText(/Tên đăng nhập hoặc mật khẩu chưa chính xác/).waitFor();
  assert.equal(
    await login.evaluate(() => localStorage.getItem("d4-access-token")),
    null,
  );
  assert.equal(
    await login.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 1,
    ),
    true,
  );
  await login.close();
  console.log(
    "PASS login failure, password visibility and desktop viewport fit",
  );
  for (const path of ["/register", "/forgot-password"]) {
    const page = await browser.newPage();
    await page.goto(base + path);
    assert.equal(await page.locator("h1").count(), 1);
    assert.ok(
      (await page.getByRole("link", { name: /đăng nhập/i }).count()) > 0,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
assert.deepEqual(errors, []);
console.log("PASS interactions; all API requests mocked, no live writes");
