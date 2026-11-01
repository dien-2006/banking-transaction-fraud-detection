import assert from "node:assert/strict";
import test from "node:test";
import { moduleUrl } from "./module-loader.mjs";
const { transactionOutcome, isFinancialTransactionResult } = await import(
  await moduleUrl("transaction-outcome")
);
test("only final bank Success produces a successful transaction screen", () => {
  assert.equal(transactionOutcome("Success"), "success");
  assert.equal(transactionOutcome("Thành công"), "success");
  for (const status of [
    "ALLOW",
    "APPROVED",
    "REVIEW",
    "BLOCK",
    "unknown",
    "",
    undefined,
  ])
    assert.equal(transactionOutcome(status), "unknown");
  assert.equal(transactionOutcome("Pending"), "pending");
  assert.equal(transactionOutcome("Đang xử lý"), "pending");
  assert.equal(transactionOutcome("Failed"), "failed");
  assert.equal(transactionOutcome("Thất bại"), "failed");
  assert.equal(transactionOutcome("Cancelled"), "cancelled");
  assert.equal(transactionOutcome("Đã hủy"), "cancelled");
});
test("network/server errors cannot claim that money transfer failed or succeeded", () => {
  for (const status of [undefined, 0, 500, 502, 503, 504])
    assert.equal(transactionOutcome(undefined, status), "unknown");
  for (const status of [400, 401, 403, 409, 422, 429])
    assert.equal(transactionOutcome(undefined, status), "rejected");
});

test("malformed or partial financial responses cannot become success screens", () => {
  const valid = {
    transactionid: 7,
    transactioncode: "TX7",
    amount: "1000",
    status: "Success",
  };
  for (const status of ["Success", "Failed", "Pending", "Cancelled"])
    assert.equal(isFinancialTransactionResult({ ...valid, status }), true);
  for (const row of [
    null,
    undefined,
    {},
    [],
    { ...valid, status: "ALLOW" },
    { ...valid, transactionid: 0 },
    { ...valid, transactioncode: "" },
    { ...valid, amount: undefined },
    { ...valid, amount: "bad" },
    { ...valid, amount: 0 },
  ])
    assert.equal(isFinancialTransactionResult(row), false);
});
