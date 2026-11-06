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
  page.setDefaultTimeout(15_000);
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
  // Exercise the same record in each role, and stress labels in narrow chart panels.
  for (const role of ["admin", "employee", "customer"]) {
    const { page } = await fixture(role);
    console.log("CHECK shared record presentation", role);
    await open(page, `/${role}/accounts`);
    if (role === "customer")
      await page.locator(".customer-account-view").first().click();
    else
      await page
        .locator("tbody")
        .getByRole("button", { name: "Xem", exact: true })
        .first()
        .click();
    const detail = page.getByRole("dialog");
    await detail.waitFor();
    for (const label of [
      "Chi nhánh",
      "Số dư khả dụng",
      "Số dư tối thiểu",
      "Loại tiền",
    ]) {
      assert.ok(
        (await detail.innerText()).includes(label),
        `${role} account missing ${label}`,
      );
    }
    await page.keyboard.press("Escape");
    if (role === "customer") {
      await page.getByRole("button", { name: "Ẩn số dư", exact: true }).click();
      const chart = page.locator(".d4-distribution").first();
      assert.equal(
        await chart.locator(".d4-distribution-center b").innerText(),
        "••••••",
      );
      assert.equal(
        await chart.locator(".d4-distribution-center b").getAttribute("title"),
        null,
      );
      assert.doesNotMatch(await chart.innerText(), /\d|%/);
    }
    await open(page, `/${role}/loans`);
    const select = page.getByRole("combobox", {
      name: "Trạng thái khoản vay",
      exact: true,
    });
    await select.selectOption("Active");
    if (role === "customer")
      await page.locator(".loans-record .d4-record-status").first().waitFor();
    else await page.locator("tbody .d4-record-status").first().waitFor();
    const status =
      role === "customer"
        ? page.locator(".loans-record .d4-record-status").first()
        : page.locator("tbody .d4-record-status").first();
    assert.equal(await status.innerText(), "Đang trả nợ");
    if (role !== "customer") {
      await open(page, `/${role}/transactions`);
      await page
        .getByRole("combobox", { name: "Khoảng số tiền", exact: true })
        .selectOption("under1m");
      await page
        .getByText("Không có giao dịch phù hợp.", { exact: true })
        .waitFor();
      // Summary charts still describe the full authorized scope after filtering.
      assert.equal(
        await page.locator(".d4-distribution-center b").first().innerText(),
        "205",
      );
      await page.getByRole("button", { name: "Đặt lại", exact: true }).click();
      await page.getByLabel("Từ ngày", { exact: true }).fill("2026-11-01");
      await page.getByLabel("Đến ngày", { exact: true }).fill("2026-11-01");
      await page
        .getByRole("combobox", { name: "Trạng thái giao dịch", exact: true })
        .selectOption("Success");
      await page
        .locator("tbody tr")
        .first()
        .getByRole("button", { name: "Xem", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByText("Phí", { exact: true })
        .waitFor();
      await page.keyboard.press("Escape");
      await page.getByLabel("Đến ngày", { exact: true }).fill("2026-10-31");
      const alert = page
        .getByRole("alert")
        .filter({ hasText: "Ngày kết thúc phải từ ngày bắt đầu trở đi." });
      await alert.waitFor();
      assert.match(
        await alert.innerText(),
        /Ngày kết thúc phải từ ngày bắt đầu trở đi/,
      );
    }
    await page.close();
  }
  console.log(
    "PASS shared account details, loan meanings, transaction filters and complete transaction receipt across roles",
  );
  for (const width of [1366, 1100, 375]) {
    const { page } = await fixture("admin", async (route, url) => {
      if (!url.pathname.endsWith("/admin/employees")) return false;
      const names = [
        "Chi nhánh Hà Nội – Trung tâm giao dịch khách hàng cá nhân",
        "Chi nhánh Đà Nẵng",
        "Chi nhánh Bình Dương",
        "Chi nhánh Khánh Hòa",
        "Chi nhánh Đồng Nai",
        "Chi nhánh Cần Thơ",
        "Chi nhánh Hải Phòng",
      ];
      const rows = Array.from({ length: 64 }, (_, i) => ({
        employeeid: i + 1,
        employeecode: `NV${i + 1}`,
        fullname: `Nhân viên ${i + 1}`,
        branchid: (i % 7) + 1,
        branchname: names[i % 7],
        rolename: "Giao dịch viên",
        status: i < 60 ? "Active" : "Inactive",
        hiredate: "2026-01-01",
      }));
      const n = Number(url.searchParams.get("page") || 1),
        size = Number(url.searchParams.get("pageSize") || 100);
      await route.fulfill({
        json: {
          items: rows.slice((n - 1) * size, n * size),
          page: n,
          pageSize: size,
          total: rows.length,
        },
      });
      return true;
    });
    await page.setViewportSize({ width, height: 768 });
    await open(page, "/admin/employees");
    const chart = page.locator(".d4-distribution").first();
    assert.equal(
      await chart.locator(".d4-distribution-center b").innerText(),
      "64",
    );
    assert.equal(await chart.locator("li").count(), 5);
    assert.ok((await chart.innerText()).includes("Các chi nhánh khác"));
    const bad = await chart.locator("li span,li strong").evaluateAll((nodes) =>
      nodes
        .filter((node) => {
          const css = getComputedStyle(node);
          return (
            node.scrollWidth > node.clientWidth + 1 ||
            css.textOverflow === "ellipsis" ||
            css.whiteSpace === "nowrap"
          );
        })
        .map((node) => node.textContent),
    );
    assert.deepEqual(bad, [], `clipped legend at ${width}`);
    const parent = chart.locator("..");
    assert.ok(
      await parent.evaluate(
        (node) =>
          node.scrollHeight <= node.clientHeight + 1 ||
          ["auto", "scroll"].includes(getComputedStyle(node).overflowY),
      ),
    );
    await page.screenshot({
      path: `/tmp/d4-chart-employees-${width}.png`,
      fullPage: true,
    });
    await page.close();
  }
  console.log(
    "PASS 64 employees, long branch names and grouped legend remain readable at desktop and mobile widths",
  );
  for (const scenario of ["empty", "error"]) {
    const { page } = await fixture("admin", async (route, url) => {
      if (!url.pathname.endsWith("/admin/employees")) return false;
      await route.fulfill(
        scenario === "error"
          ? { status: 503, json: { message: "Fixture unavailable" } }
          : { json: { items: [], total: 0, page: 1, pageSize: 100 } },
      );
      return true;
    });
    await open(page, "/admin/employees");
    const chart = page.locator(".d4-distribution").first();
    if (scenario === "error") {
      await chart.getByRole("alert").waitFor();
      assert.equal(
        await chart.locator(".d4-distribution-center b").innerText(),
        "—",
      );
    } else {
      await chart.getByText("Chưa có dữ liệu.", { exact: true }).waitFor();
      assert.equal(
        await chart.locator(".d4-distribution-center b").innerText(),
        "0",
      );
    }
    assert.doesNotMatch(await chart.innerText(), /NaN|Infinity/);
    await page.close();
  }
  console.log("PASS charts distinguish unavailable data from zero totals");
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
  // Keep login controls readable and contained at short heights and browser zoom.
  async function assertLoginGeometry(page) {
    const state = await page.evaluate(() => {
      const panel = document.querySelector(".login-form-side"),
        card = document.querySelector(".login-card");
      const p = panel.getBoundingClientRect(),
        c = card.getBoundingClientRect();
      const submit = document
        .querySelector(".login-submit")
        .getBoundingClientRect();
      return {
        cardLeft: c.left,
        cardRight: c.right,
        panelLeft: p.left,
        panelRight: p.right,
        horizontalOverflow: panel.scrollWidth - panel.clientWidth,
        transform: getComputedStyle(card).transform,
        submitHeight: submit.height,
        footerBottom: document
          .querySelector(".login-footer")
          .getBoundingClientRect().bottom,
        height: innerHeight,
        buttonBorder: getComputedStyle(
          document.querySelector(".login-footer button"),
        ).borderTopWidth,
      };
    });
    assert.ok(
      state.cardLeft >= state.panelLeft - 1 &&
        state.cardRight <= state.panelRight + 1,
      JSON.stringify(state),
    );
    assert.ok(state.horizontalOverflow <= 1, JSON.stringify(state));
    assert.equal(state.transform, "none");
    assert.ok(state.submitHeight >= 44, JSON.stringify(state));
    assert.ok(state.footerBottom <= state.height + 1, JSON.stringify(state));
    assert.equal(state.buttonBorder, "0px");
    await page
      .getByRole("link", { name: "Đăng ký ngay", exact: false })
      .scrollIntoViewIfNeeded();
    assert.equal(
      await page
        .getByRole("link", { name: "Đăng ký ngay", exact: false })
        .isVisible(),
      true,
    );
  }
  for (const [width, height, deviceScaleFactor] of [
    [1536, 1024, 1],
    [1366, 768, 1],
    [1346, 640, 1.375],
    [1024, 600, 1],
    [844, 390, 1],
    [375, 812, 1],
    [320, 568, 1],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor,
    });
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/v1/**", (route) =>
      route.fulfill({
        status: 401,
        json: { code: "AUTH_INVALID", message: "Wrong credentials" },
      }),
    );
    await page.goto(base + "/login");
    await page.waitForLoadState("networkidle");
    await assertLoginGeometry(page);
    if (width === 1536 && height === 1024) {
      const box = await page.locator('.login-card').boundingBox();
      assert.ok(Math.abs(box.x - 874) < 3 && Math.abs(box.y - 118) < 3,JSON.stringify(box));
      assert.ok(Math.abs(box.width - 624) < 3 && Math.abs(box.height - 780) < 3,JSON.stringify(box));
    }
    // The login stylesheet provides its own sizing/reset if shared CSS is delayed.
    await page
      .locator('link[rel="stylesheet"]')
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => node.href.includes("app_globals"))
          .forEach((node) => node.remove()),
      );
    await assertLoginGeometry(page);
    await page.getByLabel("Tên đăng nhập", { exact: true }).fill("layout-test");
    await page
      .getByLabel("Mật khẩu", { exact: true })
      .fill("test-only-password");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page
      .getByText(/Tên đăng nhập hoặc mật khẩu chưa chính xác/)
      .waitFor();
    await assertLoginGeometry(page);
    await page
      .getByRole("button", { name: "Thử đăng nhập lại", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/d4-login-fixed-${width}-${height}.png`,
      fullPage: true,
    });
    await page.close();
  }
  {
    const { page } = await fixture("admin");
    await open(page, "/admin/accounts");
    await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await page.waitForURL(base + "/login");
    await assertLoginGeometry(page);
    await page.close();
  }
  console.log(
    "PASS login width, readable controls, error states, missing shared CSS, browser zoom and logout navigation",
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
