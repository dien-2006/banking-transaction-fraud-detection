import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fixtureResponse } from "./fixtures.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
let browser = await chromium.launch();
const failures = [],
  results = [],
  errors = [];
const base = process.env.WEB_AUDIT_URL || "http://localhost:3001",
  output = process.env.WEB_AUDIT_OUTPUT || "/tmp/d4-web-audit";
await mkdir(output, { recursive: true });
const routeFilter = process.env.WEB_AUDIT_FILTER
  ? new RegExp(process.env.WEB_AUDIT_FILTER)
  : null;
const routes = {
  admin: [
    "",
    "branches",
    "employees",
    "customers",
    "accounts",
    "transactions",
    "loans",
    "cards",
    "fraud",
    "insights",
    "audit-logs",
    "notifications",
    "profile",
    "about",
    "news",
  ],
  employee: [
    "",
    "customers",
    "accounts",
    "transactions",
    "loans",
    "cards",
    "fraud",
    "reports",
    "notifications",
    "profile",
    "about",
    "news",
  ],
  customer: [
    "",
    "accounts",
    "transfer",
    "transactions",
    "loans",
    "cards",
    "notifications",
    "profile",
    "about",
    "news",
  ],
};
async function pageFor(role, viewport) {
  const page = await browser.newPage({
    viewport,
    timezoneId: "America/New_York",
  });
  page.on("pageerror", (e) => errors.push({ role, message: e.message }));
  await page.addInitScript((role) => {
    localStorage.setItem("d4-access-token", "test-only");
    localStorage.setItem(
      "d4-session",
      JSON.stringify({
        role,
        id: "101",
        customerId: role === "customer" ? 101 : undefined,
        userId: role === "customer" ? undefined : 1,
        employeeId: 2,
        branchId: 3,
        name: "Người dùng kiểm tra",
        subtitle:
          role === "customer" ? "Khách hàng cá nhân" : "Nhân viên ngân hàng",
      }),
    );
  }, role);
  const requests = [];
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    requests.push(url.pathname);
    try {
      assert.equal(req.method(), "GET", `Unexpected write: ${url.pathname}`);
      if (role === "employee")
        assert.notEqual(url.pathname, "/api/v1/analytics");
      if (role === "customer")
        assert.ok(!/\/admin\/|\/management\//.test(url.pathname));
      await route.fulfill({ json: fixtureResponse(url, role) });
    } catch (error) {
      failures.push({ role, error: error.message });
      await route.fulfill({
        status: 500,
        json: { message: "Fixture failure" },
      });
    }
  });
  return { page, requests };
}
try {
  for (const viewport of [
    { width: 1536, height: 1024 },
    { width: 1366, height: 768 },
    { width: 375, height: 812 },
    { width: 1100, height: 640 },
  ])
    for (const role of Object.keys(routes)) {
      const { page, requests } = await pageFor(role, viewport);
      for (const slug of routes[role]) {
        const route = `/${role}${slug ? "/" + slug : ""}`;
        if (routeFilter && !routeFilter.test(route)) continue;
        try {
          await page.goto(base + route);
          await page.locator("#main-content").waitFor();
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(120);
          const state = await page.evaluate(() => {
            const main = document.querySelector("#main-content"),
              bounds = main.getBoundingClientRect();
            const wrong = [...main.querySelectorAll("*")]
              .filter((el) => {
                const r = el.getBoundingClientRect(),
                  s = getComputedStyle(el);
                return (
                  r.width > 0 &&
                  r.right > innerWidth + 2 &&
                  s.position !== "absolute" &&
                  s.position !== "fixed" &&
                  !el.closest(
                    "table,svg,.cards-grid,.customer-data-scroll,.customer-home-shortcuts",
                  ) &&
                  !el.closest('[aria-hidden="true"]')
                );
              })
              .slice(0, 8)
              .map((el) => ({
                tag: el.tagName,
                cls: el.className,
                text: el.textContent?.slice(0, 60),
              }));
            return {
              pageWidth: document.documentElement.scrollWidth,
              mainWidth: bounds.width,
              mainHeight: main.clientHeight,
              mainScroll: main.scrollHeight,
              bodyText: main.innerText,
              wrong,
              rows: main.querySelectorAll("tbody tr").length,
            };
          });
          assert.ok(
            state.pageWidth <= viewport.width + 1,
            `${route} document overflows ${state.pageWidth}`,
          );
          assert.doesNotMatch(
            state.bodyText,
            /NaN|Invalid Date|undefined|\[object Object\]|Không thể tải/,
          );
          assert.ok(state.bodyText.trim().length > 20);
          assert.equal(await page.locator("main").count(), 1);
          if (
            ["cards", "insights", "audit-logs"].includes(slug) &&
            role !== "customer"
          ) {
            const hero = page.locator(".staff-hero");
            await hero.getByRole("heading", { level: 1 }).waitFor();
            const visible = await hero.evaluate((el) => {
              const text = el.querySelector(".staff-hero-copy"),
                a = el.getBoundingClientRect(),
                b = text.getBoundingClientRect();
              return b.top >= a.top && b.bottom <= a.bottom + 1;
            });
            assert.equal(visible, true, `${route} native hero text is clipped`);
          }
          const layout = await page.evaluate(() => {
            const root = document.querySelector(".staff-data-page"),
              section = root?.lastElementChild;
            const article = section?.querySelector(":scope > article"),
              aside = section?.querySelector(":scope > aside");
            const stack =
              article && aside
                ? {
                    left: article.getBoundingClientRect().bottom,
                    right: aside.getBoundingClientRect().top,
                  }
                : null;
            const lists = [...(root?.querySelectorAll(".d4-list-panel") ?? [])]
              .map((panel) => {
                const footer = panel.querySelector(".d4-list-pagination"),
                  rows = panel.querySelectorAll(
                    "tbody tr:not(:has(td[colspan]))",
                  );
                return footer && rows.length
                  ? {
                      last: rows[rows.length - 1].getBoundingClientRect()
                        .bottom,
                      footer: footer.getBoundingClientRect().top,
                    }
                  : null;
              })
              .filter(Boolean);
            const secondary = [
              ...document.querySelectorAll(".staff-secondary-panels > article"),
            ].map((el) => ({
              overflow: el.scrollHeight - el.clientHeight,
              scrollable: ["auto", "scroll"].includes(
                getComputedStyle(el).overflowY,
              ),
            }));
            return { stack, lists, secondary };
          });
          for (const panel of layout.secondary)
            assert.ok(
              panel.overflow <= 1 || panel.scrollable,
              `${route} secondary panel content is inaccessible`,
            );
          if (viewport.width < 1100 && layout.stack)
            assert.ok(
              layout.stack.right >= layout.stack.left - 1,
              `${route} sidebar overlaps table`,
            );
          if (viewport.width >= 1100 && viewport.height >= 640)
            for (const list of layout.lists)
              assert.ok(
                list.last <= list.footer + 2,
                `${route} last row clipped by pagination`,
              );
          const artifact = `${role}-${slug || "home"}-${viewport.width}`;
          if (viewport.width === 1366 || viewport.width === 375)
            await page.screenshot({
              path: `${output}/${artifact}.png`,
              fullPage: true,
            });
          results.push({
            route,
            width: viewport.width,
            rows: state.rows,
            mainScroll: state.mainScroll > state.mainHeight + 1,
            overflowCandidates: state.wrong,
          });
          console.log("PASS", artifact);
        } catch (error) {
          failures.push({ route, width: viewport.width, error: error.message });
          console.log("FAIL", route, viewport.width, error.message);
        }
      }
      if (role === "employee")
        assert.equal(requests.includes("/api/v1/analytics"), false);
      await page.close();
      // Release chart/browser caches between role suites on smaller machines.
      await browser.close();
      browser = await chromium.launch();
    }
  for (const role of Object.keys(routes)) {
    const { page } = await pageFor(role, { width: 1366, height: 768 });
    await page.goto(`${base}/${role}/profile`);
    await page.locator(".cp-personal").waitFor();
    await page
      .getByRole("button", { name: "Mở menu tài khoản", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Hồ sơ cá nhân", exact: true })
      .click();
    assert.equal(new URL(page.url()).pathname, `/${role}/profile`);
    await page.close();
  }
  const unknown = await browser.newPage();
  const response = await unknown.goto(base + "/admin/accounts/extra");
  assert.equal(response.status(), 404);
  await unknown.close();
  const { page: wrongRole } = await pageFor("customer", {
    width: 1366,
    height: 768,
  });
  await wrongRole.goto(base + "/admin/accounts");
  await wrongRole.waitForURL(base + "/customer");
  assert.equal(
    await wrongRole
      .locator(".dashboard-sidebar")
      .getByRole("link", { name: "Chi nhánh", exact: true })
      .count(),
    0,
  );
  await wrongRole.close();
  console.log("PASS shared profile links, unknown subpaths and role redirect");
} finally {
  await browser.close();
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ results, failures, errors }, null, 2),
  );
}
assert.deepEqual(errors, []);
assert.deepEqual(failures, []);
console.log(
  `PASS ${results.length} route/viewport checks; all APIs mocked and GET only. Artifacts: ${output}`,
);
