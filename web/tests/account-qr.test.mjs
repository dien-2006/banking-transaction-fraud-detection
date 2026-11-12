import assert from "node:assert/strict";
import test from "node:test";
import { moduleUrl } from "./module-loader.mjs";
import { QRCodeWriter, BarcodeFormat, EncodeHintType } from "@zxing/library";

const { accountQrPayload, accountNumberFromQr } = await import(await moduleUrl("account-qr"));

test("account QR is deterministic and contains only public receiving information", () => {
  for (const number of ["1000000000000001", "DEMO-0001"]) {
    const payload = accountQrPayload(number);
    assert.equal(accountNumberFromQr(payload), number);
    assert.equal(payload, accountQrPayload(number));
    assert.equal(payload, `D4BANK:1:${number}`);
  }
  assert.notEqual(accountQrPayload("1001"), accountQrPayload("1002"));
});

test("compact receiving QR has fewer modules for a real camera at the same error correction level", () => {
  const legacy = JSON.stringify({ type: "D4BANK_TRANSFER", version: 1, currency: "VND", accountNumber: "1000000000000002" });
  const compact = accountQrPayload("1000000000000002");
  const hints = new Map([[EncodeHintType.ERROR_CORRECTION, "H"], [EncodeHintType.MARGIN, 4]]);
  const size = value => new QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 0, 0, hints).getWidth();
  assert.ok(size(compact) < size(legacy));
  assert.equal(accountNumberFromQr(legacy), accountNumberFromQr(compact));
});

test("foreign, malformed or extended QR input cannot impersonate a payment request", () => {
  const valid = { type: "D4BANK_TRANSFER", version: 1, currency: "VND", accountNumber: "1001" };
  assert.equal(accountNumberFromQr(JSON.stringify(valid)), "1001", "Previously downloaded QR stays valid");
  for (const value of [null, [], {}, { ...valid, version: 2 }, { ...valid, type: "OTHER_BANK" },
    { ...valid, currency: "USD" }, { ...valid, accountNumber: 1001 }, { ...valid, accountNumber: "" },
    { ...valid, accountNumber: "x".repeat(31) }, { ...valid, accountNumber: "<script>" },
    { ...valid, accountName: "Fake owner" }, { ...valid, amount: "100000" }, { ...valid, otpAuthorizationToken: "secret" }]) {
    assert.throws(() => accountNumberFromQr(JSON.stringify(value)), /QR/);
  }
  for (const value of ["https://example.test/pay", "000201VietQR", "{", "x".repeat(1025),
    "D4BANK:2:1001", "D4BANK:1:", "D4BANK:1:1001:50000", "D4BANK:1:<script>", "D4BANK:1:"+"x".repeat(31)]) {
    assert.throws(() => accountNumberFromQr(value), /QR/);
  }
  for (const number of ["", " ", "1/2", "x".repeat(31)]) assert.throws(() => accountQrPayload(number));
});
