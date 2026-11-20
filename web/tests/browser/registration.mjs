import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const base = process.env.WEB_AUDIT_URL || 'http://localhost:3000';
try {
  for (const width of [1366, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], submissions = [];
    let emails = 0;
    page.on('pageerror', e => errors.push(e.message));
    await page.clock.install();
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/registration/otp')) {
        emails++;
        if (emails === 2) return route.fulfill({ status: 503, json: { message: 'Không thể gửi email OTP' } });
        if (emails === 3) return route.fulfill({ status: 429, json: { message: 'Vui lòng chờ 12 giây.', retryAfter: 12 } });
        return route.fulfill({ json: { challengeId: `00000000-0000-4000-8000-${String(emails).padStart(12, '0')}`, expiresIn: 300, resendAfter: 60 } });
      }
      if (path.endsWith('/auth/registration')) {
        submissions.push(route.request().postDataJSON());
        if (submissions.length === 1) return route.fulfill({ status: 503, json: { message: 'Simulated uncertain response' } });
        return route.fulfill({ json: { customerId: '101', code: 'C0000101', name: 'Đăng ký thử', username: 'signup.test' } });
      }
      throw new Error(`Unexpected real API call: ${path}`);
    });
    await page.goto(`${base}/register`);
    await page.getByLabel('Họ và tên').fill('Đăng ký thử');
    await page.getByLabel('Điện thoại').fill('0912345678');
    await page.getByLabel('Email nhận OTP').fill('signup@example.invalid');
    await page.getByLabel('Tên đăng nhập', { exact: false }).fill('signup.test');
    await page.getByLabel('Mật khẩu *', { exact: true }).fill('test-only-password');
    await page.getByLabel('Xác nhận mật khẩu').fill('different-password');
    await page.getByLabel('Tôi xác nhận thông tin').check();
    await page.getByRole('button', { name: 'Gửi mã xác nhận', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Mật khẩu xác nhận chưa khớp' }).waitFor();
    assert.equal(emails, 0);
    await page.getByLabel('Xác nhận mật khẩu').fill('test-only-password');
    await page.getByRole('button', { name: 'Gửi mã xác nhận', exact: true }).click();
    await page.getByLabel('Mã xác nhận 6 chữ số').waitFor();
    assert.equal(emails, 1);
    assert.equal(await page.getByRole('button', { name: /Gửi lại mã sau/ }).isDisabled(), true);
    await page.clock.fastForward(61000);
    await page.getByRole('button', { name: 'Gửi lại mã', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Không thể gửi email OTP' }).waitFor();
    assert.equal(emails, 2);
    await page.getByRole('button', { name: 'Gửi lại mã', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Vui lòng chờ 12 giây' }).waitFor();
    await page.clock.fastForward(13000);
    await page.getByRole('button', { name: 'Gửi lại mã', exact: true }).click();
    await page.getByRole('button', { name: /Gửi lại mã sau/ }).waitFor();
    assert.equal(emails, 4);
    await page.getByLabel('Mã xác nhận 6 chữ số').fill('123456');
    await page.getByRole('button', { name: 'Xác nhận đăng ký', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Chưa xác định' }).waitFor();
    await page.getByRole('button', { name: 'Xác nhận đăng ký', exact: true }).click();
    await page.getByRole('heading', { name: 'Đăng ký thành công' }).waitFor();
    assert.deepEqual(submissions[0], submissions[1], 'uncertain requests retain identity, OTP and password');
    assert.equal(submissions[0].challengeId, '00000000-0000-4000-8000-000000000004');
    assert.equal(await page.evaluate(() => localStorage.getItem('d4-access-token')), null);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    console.log(`PASS registration, resend, uncertain retry, no overflow: ${width}px`);
    await page.close();
  }
} finally { await browser.close(); }
