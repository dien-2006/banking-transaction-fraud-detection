const test = require('node:test');
const assert = require('node:assert/strict');
const { Logger } = require('@nestjs/common');
const { sendOtpEmail } = require('../dist/security/otp-email');
const config = { get: key => ({ BREVO_API_KEY: 'test-only-api-secret', OTP_SENDER_EMAIL: 'sender@example.invalid' })[key] };

test('OTP email acceptance requires a real provider receipt', async () => {
  const previous = global.fetch;
  try {
    global.fetch = async () => new Response(JSON.stringify({ messageId: '<test-message@provider.invalid>' }), { status: 201 });
    assert.equal(await sendOtpEmail(config, 'recipient@example.invalid', 'Test', '123456'), '<test-message@provider.invalid>');
    for (const body of ['{}', 'null', '{"messageId":""}', '{"messageId":"bad\\nreceipt"}', '<html>not a receipt</html>']) {
      global.fetch = async () => new Response(body, { status: 201 });
      await assert.rejects(() => sendOtpEmail(config, 'recipient@example.invalid', 'Test', '123456'), e => e.getStatus() === 503);
    }
  } finally { global.fetch = previous; }
});

test('provider rejection logs only safe status and code, never its raw message', async () => {
  const previous = global.fetch, warn = Logger.prototype.warn, logs = [];
  Logger.prototype.warn = (...args) => logs.push(args);
  try {
    global.fetch = async () => new Response(JSON.stringify({ code: 'unauthorized', message: 'recipient@example.invalid test-only-api-secret 123456' }), { status: 403 });
    await assert.rejects(() => sendOtpEmail(config, 'recipient@example.invalid', 'Test', '123456'), e => e.getStatus() === 503 && /chưa được cấp quyền/.test(e.message));
    assert.match(JSON.stringify(logs), /status=403, code=unauthorized/);
    assert.doesNotMatch(JSON.stringify(logs), /recipient@|test-only-api-secret|123456/);
    global.fetch = async () => new Response(JSON.stringify({ code: 'recipient@example.invalid' }), { status: 400 });
    await assert.rejects(() => sendOtpEmail(config, 'recipient@example.invalid', 'Test', '123456'));
    assert.match(JSON.stringify(logs), /code=unknown/);
    assert.doesNotMatch(JSON.stringify(logs), /recipient@/);
  } finally { global.fetch = previous; Logger.prototype.warn = warn; }
});

test('email rate limit and network failures are explicit without exposing credentials', async () => {
  const previous = global.fetch;
  try {
    global.fetch = async () => new Response('{}', { status: 429 });
    await assert.rejects(() => sendOtpEmail(config, 'recipient@example.invalid', 'Test', '123456'), /đang bị giới hạn/);
    global.fetch = async () => { throw new Error('upstream failure containing test-only-api-secret'); };
    await assert.rejects(() => sendOtpEmail(config, 'recipient@example.invalid', 'Test', '123456'), e => e.getStatus() === 503 && !e.message.includes('test-only-api-secret'));
  } finally { global.fetch = previous; }
});
