import assert from "node:assert/strict";
import test from "node:test";
import { moduleUrl } from "./module-loader.mjs";
const { calculateListCapacity } = await import(await moduleUrl("list-capacity"));

test("capacity adds records for free space and removes records when the frame shrinks", () => {
  assert.equal(calculateListCapacity(200, 744, 34), 16);
  assert.equal(calculateListCapacity(200, 480, 34), 8);
  assert.equal(calculateListCapacity(200, 460, 34), 7);
});
test("taller controls and scaled layouts fit complete records without cutting a row", () => {
  assert.equal(calculateListCapacity(200, 744, 48), 11);
  assert.equal(calculateListCapacity(250, 930, 60), 11);
  assert.equal(calculateListCapacity(100.25, 202.25, 34), 3);
  assert.equal(calculateListCapacity(100.25, 202, 34), 2);
});
test("zero space and invalid geometry stay bounded", () => {
  for (const row of [0, -1, NaN, Infinity]) assert.equal(calculateListCapacity(0, 100, row), 1);
  assert.equal(calculateListCapacity(400, 300, 34), 1);
  assert.equal(calculateListCapacity(NaN, 300, 34), 1);
  assert.equal(calculateListCapacity(0, 99999, 34), 100);
});
