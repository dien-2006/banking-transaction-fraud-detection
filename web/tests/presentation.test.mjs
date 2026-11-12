import assert from "node:assert/strict";
import test from "node:test";
import { moduleUrl } from "./module-loader.mjs";
const { dateKey, formatDateTime, formatDate, formatTime, formatCurrency } =
  await import(await moduleUrl("presentation"));
const { loadCards } = await import(await moduleUrl("card-data"));
const { loadFraudReviews, presentFraudReview } = await import(await moduleUrl("fraud-data"));
const { loadAuditLogs } = await import(await moduleUrl("audit-data"));
const { loadAllPages } = await import(await moduleUrl("paged-data"));
test("all roles use Vietnam dates, preserve foreign money and reject nonfinite display values", () => {
  assert.equal(dateKey("2026-10-31T17:00:00Z"), "2026-11-01");
  assert.equal(dateKey("2026-11-01T00:30:00"), "2026-11-01");
  assert.match(formatDateTime("2026-11-01T00:30:00"), /00:30:00 1\/11\/2026/);
  assert.equal(formatDate("1998-08-15T00:00:00Z"), "15/08/1998");
  assert.equal(formatDateTime(null), "Chưa cập nhật");
  assert.equal(formatCurrency(NaN), "—");
  assert.equal(formatCurrency("1000.25"), "1.000,25 ₫");
  assert.doesNotMatch(formatCurrency("100.25", "USD"), /₫/);
});
test("cards, fraud and audit loaders reject overlapping results instead of inflating counts", async () => {
  for (const [load, key] of [
    [loadCards, "cardid"],
    [loadFraudReviews, "reviewcaseid"],
    [loadAuditLogs, "auditid"],
  ])
    await assert.rejects(
      load(async ({ page }) => ({
        page,
        pageSize: 1,
        total: 2,
        items: [{ [key]: 1 }],
      })),
      /vừa thay đổi/,
    );
  await assert.rejects(
    loadAllPages(
      async () => ({ page: 2, pageSize: 100, total: 0, items: [] }),
      (row) => row.id,
    ),
    /không hợp lệ/,
  );
});

test("naive bank timestamps display the same clock time in every browser timezone", () => {
  assert.equal(formatTime("2026-11-01T00:30:00"), "00:30");
  assert.equal(formatTime("2026-10-31T17:30:00Z"), "00:30");
  assert.equal(formatTime("invalid"), "Chưa cập nhật");
});

test("fraud review preserves bank time and separates approval from financial success", () => {
  const review = presentFraudReview({
    reviewcaseid: 7,
    reviewstatus: "APPROVED",
    reviewcreatedat: "2026-11-01T00:30:00",
    transactioncode: "TX-7",
    amount: "100.25",
    currency: "USD",
    status: "Failed",
    typecode: "TRANSFER",
    decision: "ALLOW",
    rulescore: 30,
    modelprobability: "0.2",
    reviewreason: "Đã xác minh yêu cầu của khách hàng.",
    reviewedat: "2026-11-01T01:00:00",
  });
  assert.match(review.time, /00:30:00 1\/11\/2026/);
  assert.equal(review.status, "Đã phê duyệt");
  assert.equal(review.reviewStatus, "APPROVED");
  assert.equal(review.reviewReason, "Đã xác minh yêu cầu của khách hàng.");
  assert.match(review.reviewedAt, /01:00:00 1\/11\/2026/);
  assert.equal(review.transactionStatus, "Failed");
  assert.equal(review.pending, false);
  assert.equal(review.canResolve, false);
  assert.doesNotMatch(review.detail, /₫|NaN/);
  assert.equal(review.mlProbability, "20%");
});

test("review actions require both an open case and a pending REVIEW transaction", () => {
  const row = {
    reviewcaseid: 8, reviewstatus: "OPEN", transactioncode: "TX-8",
    amount: "1000", currency: "VND", status: "Pending", decision: "REVIEW",
    reviewcreatedat: "2026-11-01T10:00:00", typecode: "TRANSFER",
  };
  assert.equal(presentFraudReview(row).canResolve, true);
  assert.equal(presentFraudReview({ ...row, status: "Success" }).canResolve, false);
  assert.equal(presentFraudReview({ ...row, status: "Success" }).needsReconciliation, true);
  assert.equal(presentFraudReview({ ...row, status: "Failed" }).canResolve, false);
  assert.equal(presentFraudReview({ ...row, decision: "BLOCK" }).canResolve, false);
  assert.equal(presentFraudReview({ ...row, decision: "ALLOW" }).canResolve, false);
  assert.equal(presentFraudReview({ ...row, reviewstatus: "REJECTED" }).canResolve, false);
  assert.equal(presentFraudReview({ ...row, reviewstatus: "REJECTED", status: "Success" }).needsReconciliation, true);
});
