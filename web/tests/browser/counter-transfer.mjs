import assert from "node:assert/strict";
import { fixtureResponse } from "./fixtures.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch(),
  errors = [],
  base = process.env.WEB_AUDIT_URL || "http://localhost:3001";
try {
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 375, height: 812 },
  ])
    for (const role of ["employee", "admin"]) {
      const page = await browser.newPage({ viewport }),
        writes = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript((role) => {
        localStorage.setItem("d4-access-token", "mock");
        localStorage.setItem(
          "d4-session",
          JSON.stringify({
            role,
            id: "1",
            userId: 1,
            employeeId: 2,
            branchId: 3,
            name: "Kiểm tra nhân viên",
          }),
        );
      }, role);
      await page.route("**/api/v1/**", async (route) => {
        const req = route.request(),
          url = new URL(req.url());
        try {
          if (
            url.pathname === "/api/v1/transactions/counter-transfers" &&
            req.method() === "POST"
          ) {
            writes.push(req.postDataJSON());
            await new Promise((resolve) => setTimeout(resolve, 300));
            await route.fulfill(
              writes.length === 1
                ? { status: 503, json: { message: "Lỗi kết nối thử nghiệm" } }
                : {
                    json: {
                      transactionid: 77,
                      transactioncode: "TX77",
                      status: "Pending",
                      amount: "1000",
                    },
                  },
            );
            return;
          }
          assert.equal(req.method(), "GET");
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
          if (url.pathname.includes("/transactions/destinations/")) {
            await route.fulfill({
              json: {
                accountId: 999,
                accountNumber: "9988776655",
                accountName: "Người nhận chi nhánh khác",
                currency: "VND",
              },
            });
            return;
          }
          await route.fulfill({ json: fixtureResponse(url, role) });
        } catch (error) {
          errors.push(error.message);
          await route.fulfill({
            status: 500,
            json: { message: "Fixture error" },
          });
        }
      });
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
      assert.equal(
        await dialog
          .getByLabel("Tài khoản nguồn", { exact: true })
          .locator('option[value="23"]')
          .count(),
        0,
      );
      assert.equal(
        await dialog
          .getByLabel("Tài khoản nguồn", { exact: true })
          .locator('option[value="24"]')
          .count(),
        0,
      );
      await dialog
        .getByLabel("Tài khoản nhận", { exact: true })
        .fill("9988776655");
      await dialog
        .getByText("Người nhận: Người nhận chi nhánh khác", { exact: true })
        .waitFor();
      await dialog.getByLabel("Số tiền (VND)", { exact: true }).fill("1000");
      await dialog
        .getByLabel("Nội dung", { exact: true })
        .fill("Yêu cầu chuyển tại quầy");
      await dialog
        .getByRole("button", { name: "Kiểm tra lệnh chuyển", exact: true })
        .click();
      const confirm = dialog.getByRole("button", {
        name: "Xác nhận chuyển khoản",
        exact: true,
      });
      await confirm.click();
      assert.equal(writes.length, 0);
      await dialog.getByRole("checkbox").check();
      await confirm.click();
      await dialog
        .getByRole("button", { name: "Đang gửi…", exact: true })
        .waitFor();
      assert.equal(
        await dialog
          .getByRole("button", { name: "Đóng", exact: true })
          .isDisabled(),
        true,
      );
      await page.keyboard.press("Escape");
      assert.equal(await dialog.count(), 1);
      await dialog.getByText(/Chưa xác định được kết quả/).waitFor();
      await dialog.getByRole("button", { name: "Đóng", exact: true }).click();
      await page
        .getByRole("button", { name: "Chuyển khoản tại quầy", exact: true })
        .click();
      await dialog.getByRole("checkbox").check();
      await dialog
        .getByRole("button", { name: "Thử lại cùng lệnh", exact: true })
        .click();
      await dialog
        .locator('.d4-transaction-result[data-outcome="pending"]')
        .waitFor();
      assert.match(
        await dialog.getByRole("status").innerText(),
        /Đang chờ kiểm tra, tiền chưa được hạch toán/,
      );
      assert.equal(writes.length, 2);
      assert.deepEqual(writes[0], writes[1]);
      assert.deepEqual(
        { ...writes[0], idempotencyKey: "uuid" },
        {
          customerId: 101,
          sourceAccountId: 1,
          destinationAccountId: 999,
          amount: "1000",
          idempotencyKey: "uuid",
          customerVerified: true,
          description: "Yêu cầu chuyển tại quầy",
        },
      );
      await page.screenshot({
        path: `/tmp/d4-counter-${role}-${viewport.width}.png`,
      });
      await page.close();
      console.log(
        "PASS",
        role,
        viewport.width,
        "source/holder/recipient verification, attestation, pending lock, same-key retry and Pending result",
      );
    }
  const p = await browser.newPage();
  await p.addInitScript(() => {
    localStorage.setItem("d4-access-token", "mock");
    localStorage.setItem(
      "d4-session",
      JSON.stringify({
        role: "customer",
        id: "101",
        customerId: 101,
        name: "Khách hàng",
      }),
    );
  });
  await p.route("**/api/v1/**", (route) =>
    route.fulfill({
      json: fixtureResponse(new URL(route.request().url()), "customer"),
    }),
  );
  await p.goto(base + "/customer/transactions");
  await p.locator("#main-content").waitFor();
  assert.equal(
    await p
      .getByRole("button", { name: "Chuyển khoản tại quầy", exact: true })
      .count(),
    0,
  );
  await p.close();
} finally {
  await browser.close();
}
assert.deepEqual(errors, []);
console.log(
  "PASS customer cannot see counter action; all requests mocked, no financial writes",
);
