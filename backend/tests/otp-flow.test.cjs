const assert = require("node:assert/strict");
const test = require("node:test");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { createHmac, randomUUID } = require("node:crypto");
const { validate } = require("class-validator");
const { OtpService } = require("../dist/security/otp.service");
const {
  TransactionController,
} = require("../dist/http/transaction.controller");
const {
  TransferDto,
  TransferOtpRequestDto,
  MovementDto,
  LoanPaymentDto,
} = require("../dist/http/dto");
const user = { role: "customer", actorType: "customer", customerId: 101 };
const input = {
  sourceAccountId: 1,
  destinationAccountId: 2,
  amount: "1000",
  idempotencyKey: "audit-request",
  channel: "InternetBanking",
  description: "audit transfer",
};
const config = { getOrThrow: () => "test-only-secret" };
test("OTP context binds sender, accounts, amount, request code, channel and description", () => {
  const otp = new OtpService({}, {}, config),
    base = otp.context(101, input);
  for (const patch of [
    { sourceAccountId: 3 },
    { destinationAccountId: 3 },
    { amount: "1001" },
    { idempotencyKey: "changed" },
    { channel: "MobileBanking" },
    { description: "changed" },
  ])
    assert.notEqual(otp.context(101, { ...input, ...patch }), base);
  assert.notEqual(otp.context(102, input), base);
});
test("financial DTOs reject implicit rounding, exponent and negative input", async () => {
  for (const Dto of [
    TransferDto,
    TransferOtpRequestDto,
    MovementDto,
    LoanPaymentDto,
  ]) {
    for (const amount of ["-1", "1e3", "1.001", "NaN", "100000000000000000"]) {
      const errors = await validate(Object.assign(new Dto(), { amount }));
      assert.ok(
        errors.some((e) => e.property === "amount"),
        `${Dto.name} accepted ${amount}`,
      );
    }
  }
  const errors = await validate(
    Object.assign(new TransferDto(), {
      ...input,
      channel: "Counter",
      otpAuthorizationToken: "test-authorization-token",
    }),
  );
  assert.ok(errors.some((e) => e.property === "channel"));
});
test("customer cannot use counter withdrawal to bypass the online OTP flow", async () => {
  const controller = new TransactionController(
    { function: () => assert.fail("financial call") },
    {},
    {},
  );
  await assert.rejects(
    controller.movement(user, { type: "WITHDRAWAL" }),
    (e) => e.getStatus() === 403,
  );
});
// Uses the running local Redis via docker, only with unique test-only keys.
test(
  "Redis atomically limits wrong OTP attempts and consumes each challenge/authorization once",
  { skip: process.env.RUN_REDIS_INTEGRATION !== "1" },
  async () => {
    const run = promisify(execFile);
    const command = async (args) =>
      JSON.parse(
        (
          await run(
            "docker",
            ["compose", "exec", "-T", "redis", "redis-cli", "--json", ...args],
            { maxBuffer: 1024 * 1024 },
          )
        ).stdout.trim(),
      );
    const keys = [];
    const client = {
      eval: (script, { keys, arguments: args }) =>
        command(["EVAL", script, String(keys.length), ...keys, ...args]),
      get: (key) => command(["GET", key]),
    };
    const otp = new OtpService({ assertReady() {}, client }, {}, config);
    const dto = {
      ...input,
      idempotencyKey: randomUUID(),
      challengeId: randomUUID(),
      code: "123456",
    };
    const key = `otp:challenge:${dto.challengeId}`;
    keys.push(key);
    const seed = () =>
      command([
        "SET",
        key,
        JSON.stringify({
          customerId: 101,
          context: otp.context(101, dto),
          codeHash: createHmac("sha256", "test-only-secret")
            .update(dto.code)
            .digest("hex"),
          attempts: 0,
        }),
        "EX",
        "60",
      ]);
    try {
      await seed();
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          otp.verify(user, { ...dto, code: "000000" }),
        ),
      );
      assert.ok(results.every((r) => r.status === "rejected"));
      assert.equal(await client.get(key), null);
      await assert.rejects(otp.verify(user, dto));
      await seed();
      await assert.rejects(
        otp.verify(user, { ...dto, description: "changed" }),
      );
      const success = await Promise.allSettled(
        Array.from({ length: 5 }, () => otp.verify(user, dto)),
      );
      const tokens = success
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value.authorizationToken);
      assert.equal(tokens.length, 1);
      keys.push(`otp:authorization:${tokens[0]}`);
      const transfer = { ...dto, otpAuthorizationToken: tokens[0] };
      await assert.rejects(
        otp.authorize(user, { ...transfer, description: "changed" }),
      );
      const consumed = await Promise.allSettled(
        Array.from({ length: 5 }, () => otp.authorize(user, transfer)),
      );
      assert.equal(consumed.filter((r) => r.status === "fulfilled").length, 1);
    } finally {
      await command(["DEL", ...keys]);
    }
  },
);
