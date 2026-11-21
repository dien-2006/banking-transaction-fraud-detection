import assert from "node:assert/strict";
import test from "node:test";
import { moduleUrl } from "./module-loader.mjs";
const { transactionOutcome, transactionPresentation, isFinancialTransactionResult } = await import(
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

test("review notification is shown only for a pending transaction with an explicit REVIEW decision", () => {
  for (const status of ["Pending", "Đang xử lý"]) {
    const view = transactionPresentation(status, "REVIEW");
    assert.equal(view.outcome, "pending");
    assert.equal(view.label, "Chờ phê duyệt");
    assert.match(view.title, /nhân viên phê duyệt/);
    assert.match(view.message, /Tiền chưa được hạch toán/);
  }
  assert.equal(transactionPresentation("Pending").label, "Đang xử lý");
  assert.equal(transactionPresentation("Success", "REVIEW").outcome, "success");
  assert.equal(transactionPresentation("Failed", "REVIEW").outcome, "failed");
  assert.equal(transactionPresentation(undefined, "REVIEW", 503).outcome, "unknown");
});
test("network/server errors cannot claim that money transfer failed or succeeded", () => {
  for (const status of [undefined, 0, 500, 502, 503, 504])
    assert.equal(transactionOutcome(undefined, status), "unknown");
  for (const status of [400, 401, 403, 409, 422, 429])
    assert.equal(transactionOutcome(undefined, status), "rejected");
});

test("only an explicit BLOCK explains cancellation as a risk rejection", () => {
  const blocked = transactionPresentation("Cancelled", "BLOCK");
  assert.equal(blocked.outcome, "cancelled");
  assert.equal(blocked.label, "Bị chặn");
  assert.match(blocked.message, /chưa được hạch toán/);
  assert.equal(transactionPresentation("Cancelled").label, "Đã hủy");
  assert.equal(transactionPresentation("Cancelled", "REVIEW").label, "Đã hủy");
  assert.equal(transactionPresentation(undefined, "BLOCK", 503).outcome, "unknown");
  assert.equal(transactionPresentation("Success", "BLOCK").outcome, "success");
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
