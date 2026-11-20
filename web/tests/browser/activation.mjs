import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const base = process.env.WEB_AUDIT_URL || 'http://localhost:3000';
try {
  for (const width of [1366, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 768 } });
    const errors = [], submissions = [], emails = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.clock.install();
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/activation/otp')) {
        emails.push(route.request().postDataJSON());
        if (emails.length === 2) return route.fulfill({ status: 503, json: { message: 'Không thể gửi email OTP' } });
        return route.fulfill({ json: { challengeId: `00000000-0000-4000-8000-${String(emails.length).padStart(12, '0')}`, expiresIn: 300, resendAfter: 60 } });
      }
      if (path.endsWith('/auth/activation')) {
        submissions.push(route.request().postDataJSON());
        if (submissions.length === 1) return route.fulfill({ status: 403, json: { message: 'OTP không đúng hoặc đã hết hạn.' } });
        if (submissions.length === 2) return route.fulfill({ status: 503, json: { message: 'Simulated uncertain response' } });
        return route.fulfill({ json: { customerId: '101', code: 'C0000101', name: 'Existing customer', username: 'activation.test' } });
      }
      throw new Error(`Unexpected API call: ${path}`);
    });
    await page.goto(`${base}/login`);
    await page.getByRole('link', { name: 'Kích hoạt ngân hàng trực tuyến', exact: true }).click();
    await page.waitForURL(`${base}/activate`);
    assert.equal(await page.getByLabel('Họ và tên').count(), 0);
    assert.equal(await page.getByLabel('Điện thoại').count(), 0);
    await page.getByLabel('Mã khách hàng', { exact: false }).fill(' c0000101 ');
    await page.getByLabel('Email nhận OTP').fill('existing@example.invalid');
    await page.getByLabel('Tên đăng nhập', { exact: false }).fill('Activation.Test');
    await page.getByLabel('Mật khẩu *', { exact: true }).fill('test-only-password');
    await page.getByLabel('Xác nhận mật khẩu').fill('different-password');
    await page.getByLabel('Tôi xác nhận đây là hồ sơ').check();
    await page.getByRole('button', { name: 'Gửi mã xác nhận', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Mật khẩu xác nhận chưa khớp' }).waitFor();
    assert.equal(emails.length, 0);
    await page.getByLabel('Xác nhận mật khẩu').fill('test-only-password');
    await page.getByRole('button', { name: 'Gửi mã xác nhận', exact: true }).click();
    await page.getByLabel('Mã xác nhận 6 chữ số').waitFor();
    assert.deepEqual(emails[0], { customerCode: 'C0000101', email: 'existing@example.invalid' });
    assert.equal(await page.getByRole('button', { name: /Gửi lại mã sau/ }).isDisabled(), true);
    await page.clock.fastForward(61000);
    await page.getByRole('button', { name: 'Gửi lại mã', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Không thể gửi email OTP' }).waitFor();
    await page.getByRole('button', { name: 'Gửi lại mã', exact: true }).click();
    await page.getByRole('button', { name: /Gửi lại mã sau/ }).waitFor();
    await page.getByLabel('Mã xác nhận 6 chữ số').fill('000000');
    await page.getByRole('button', { name: 'Xác nhận kích hoạt', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'OTP không đúng' }).waitFor();
    await page.getByLabel('Mã xác nhận 6 chữ số').fill('123456');
    await page.getByRole('button', { name: 'Xác nhận kích hoạt', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Chưa xác định được kết quả kích hoạt' }).waitFor();
    await page.getByRole('button', { name: 'Xác nhận kích hoạt', exact: true }).click();
    await page.getByRole('heading', { name: 'Kích hoạt thành công' }).waitFor();
    assert.deepEqual(submissions[1], submissions[2], 'uncertain requests retain the same activation identity and credentials');
    assert.equal(submissions[2].customerCode, 'C0000101');
    assert.equal(submissions[2].username, 'activation.test');
    assert.equal(submissions[2].customerId, undefined); assert.equal(submissions[2].role, undefined);
    assert.equal(submissions[2].name, undefined); assert.equal(submissions[2].phone, undefined);
    assert.equal(await page.evaluate(() => localStorage.getItem('d4-access-token')), null);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.getByRole('link', { name: 'Quay lại đăng nhập' }).click();
    await page.waitForURL(`${base}/login`);
    assert.deepEqual(errors, []);
    console.log(`PASS existing-customer activation, resend, invalid OTP, uncertain retry and no overflow: ${width}px`);
    await page.close();
  }
} finally { await browser.close(); }
