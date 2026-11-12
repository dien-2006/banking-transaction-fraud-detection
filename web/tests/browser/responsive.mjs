import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fixtureResponse } from "./fixtures.mjs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.WEB_AUDIT_URL || "http://localhost:3000";
const browser = await chromium.launch();
const errors = [];
await mkdir("/tmp/d4-responsive", { recursive: true });
try {
  for (const role of ["customer", "employee", "admin"]) {
    const page = await browser.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(role => {
      localStorage.setItem("d4-access-token", "test-only");
      localStorage.setItem("d4-session", JSON.stringify({ role, id: "101", customerId: 101, userId: 1, employeeId: 2, branchId: 3, name: "Người dùng kiểm tra" }));
    }, role);
    await page.route("**/api/v1/**", route => {
      assert.equal(route.request().method(), "GET");
      return route.fulfill({ json: fixtureResponse(new URL(route.request().url()), role) });
    });
    for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(size);
      await page.goto(base + "/" + role);
      const menu = page.getByRole("button", { name: "Mở menu", exact: true });
      await menu.waitFor();
      assert.ok((await menu.boundingBox()).height >= 44);
      assert.ok(await page.locator("#dashboard-navigation").evaluate(node => node.inert));
      await menu.click();
      const drawer = page.getByRole("dialog", { name: "Menu điều hướng", exact: true });
      await drawer.waitFor();
      assert.equal(await menu.getAttribute("aria-expanded"), "true");
      assert.ok(await page.locator("main").evaluate(node => node.inert));
      await drawer.getByRole("button", { name: "Đóng menu", exact: true }).focus();
      await page.keyboard.press("Shift+Tab");
      assert.ok(await drawer.evaluate(node => node.contains(document.activeElement)));
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Đóng menu");
      await page.keyboard.press("Escape");
      await drawer.waitFor({ state: "hidden" });
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Mở menu");
      await menu.click();
      await drawer.getByLabel("Tìm trong menu", { exact: true }).fill("NO-SUCH-FEATURE");
      await drawer.getByRole("status").filter({ hasText: "Không tìm thấy" }).waitFor();
      await drawer.getByLabel("Tìm trong menu", { exact: true }).fill("");
      const link = drawer.locator("nav > a").nth(1), href = await link.getAttribute("href");
      await link.click();
      await page.waitForURL(base + href);
      await drawer.waitFor({ state: "hidden" });
      assert.equal(await menu.getAttribute("aria-expanded"), "false");
      assert.ok(await page.locator("main").evaluate(node => !node.inert && getComputedStyle(node).overflowY === "auto"));
      const path = role === "customer" ? "/customer/accounts" : role === "employee" ? "/employee/customers" : "/admin/branches";
      await page.goto(base + path);
      const region = page.locator('[data-table-scroll="true"]').first();
      await region.waitFor();
      assert.equal(await region.getAttribute("tabindex"), "0");
      assert.ok(await region.getAttribute("aria-label"));
      if (size.width < 640) {
        assert.ok(await region.evaluate(node => node.scrollWidth > node.clientWidth));
        await region.evaluate(node => { node.scrollLeft = node.scrollWidth; });
        assert.ok(await region.evaluate(node => node.scrollLeft > 0));
        const action = region.getByRole("button").first();
        assert.ok((await action.boundingBox()).height >= 44);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const buttonName = role === "customer" ? /^Chi tiết tài khoản / : role === "employee" ? "Thêm khách hàng" : "Thêm chi nhánh";
      await page.getByRole("button", typeof buttonName === "string" ? { name: buttonName, exact: true } : { name: buttonName }).first().click();
      const dialog = page.getByRole("dialog").filter({ hasNot: page.locator("#dashboard-navigation") }).last();
      await dialog.waitFor();
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= size.width + 1 && bounds.y + bounds.height <= size.height + 1);
      if (size.width < 640 && role !== "customer") {
        const field = dialog.locator('input:not([type="hidden"])').first();
        assert.ok(await field.evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize) >= 16));
        const footer = await dialog.locator("form > footer").boundingBox();
        assert.ok(footer.y >= bounds.y && footer.y + footer.height <= bounds.y + bounds.height + 1);
      }
      await page.screenshot({ path: `/tmp/d4-responsive/${role}-dialog-${size.width}.png` });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      console.log("PASS responsive navigation, table and dialog", role, size.width);
    }
    await page.close();
  }
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    const page = await browser.newPage({ viewport: size });
    page.on("pageerror", error => errors.push(error.message));
    for (const path of ["/login", "/register", "/forgot-password"]) {
      await page.goto(base + path);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.getByRole("heading").first().waitFor();
      if (path === "/login" && size.width < 640) {
        const input = page.getByLabel("Tên đăng nhập", { exact: true });
        assert.ok(await input.evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize) >= 16));
        await page.getByRole("button", { name: "Đăng nhập", exact: true }).scrollIntoViewIfNeeded();
        const button = await page.getByRole("button", { name: "Đăng nhập", exact: true }).boundingBox();
        assert.ok(button.y >= 0 && button.y + button.height <= size.height + 1);
      }
      await page.screenshot({ path: `/tmp/d4-responsive/public-${path.slice(1)}-${size.width}.png` });
      console.log("PASS public responsive page", path, size.width);
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
