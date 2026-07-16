const assert = require("node:assert/strict");
const { test } = require("node:test");
const StoreRefund = require("../src/models/StoreRefund");
const {
  createStoreRefundService,
  cumulativeRefundPlan,
  incrementalCreditPlan,
} = require("../src/services/storeRefundService");

const order = {
  OrderId: "order",
  Quantity: 3,
  UnitPriceCents: 10001,
  RefundedQuantity: 0,
  RefundedPlan: [],
  DebitPlan: [
    {
      AccountId: "user:cash",
      AccountType: "cash",
      OwnerUserId: "user",
      AmountCents: 10000,
    },
    {
      AccountId: "user:checking",
      AccountType: "checking",
      OwnerUserId: "user",
      AmountCents: 20003,
    },
  ],
};

test("partial refunds allocate integer cents and conserve the original total", () => {
  const first = cumulativeRefundPlan(order, 1);
  assert.equal(
    first.reduce((sum, entry) => sum + entry.AmountCents, 0),
    10001,
  );
  const full = cumulativeRefundPlan(order, 3);
  assert.equal(
    full.reduce((sum, entry) => sum + entry.AmountCents, 0),
    30003,
  );
  assert.ok(full.every((entry) => Number.isSafeInteger(entry.AmountCents)));
});

test("a second partial refund credits only the incremental amount", () => {
  const firstPlan = cumulativeRefundPlan(order, 1);
  const second = incrementalCreditPlan(
    { ...order, RefundedQuantity: 1, RefundedPlan: firstPlan },
    1,
  );
  assert.equal(
    second.reduce((sum, entry) => sum + entry.AmountCents, 0),
    10001,
  );
});

test("StoreRefund declares durable id and idempotency indexes", () => {
  const indexes = StoreRefund.schema.indexes();
  assert.equal(
    indexes.filter(([keys]) => keys.GuildId === 1 && keys.RefundId === 1)
      .length,
    1,
  );
  assert.equal(
    indexes.filter(([keys]) => keys.GuildId === 1 && keys.IdempotencyKey === 1)
      .length,
    1,
  );
});

test("completed refund retry returns the durable result without crediting again", async () => {
  const completed = {
    _id: "refund",
    GuildId: "guild",
    RefundId: "refund_attempt_0001",
    OrderId: "order",
    ActorUserId: "staff",
    Quantity: 1,
    Status: "completed",
  };
  let economyCalls = 0;
  const service = createStoreRefundService({
    refundModel: { findOne: () => ({ lean: async () => completed }) },
    economyService: {
      executeEconomyOperation: async () => {
        economyCalls += 1;
      },
    },
  });
  const result = await service.executeStoreRefund({
    guildId: "guild",
    orderId: "order",
    refundId: "refund_attempt_0001",
    actorUserId: "staff",
    quantity: 1,
  });
  assert.equal(result.outcome, "already_completed");
  assert.equal(economyCalls, 0);
});

test("refund id rejects a different payload", async () => {
  const service = createStoreRefundService({
    refundModel: {
      findOne: () => ({
        lean: async () => ({
          RefundId: "refund_attempt_0001",
          OrderId: "order",
          ActorUserId: "staff",
          Quantity: 1,
          Status: "completed",
        }),
      }),
    },
  });
  await assert.rejects(
    service.executeStoreRefund({
      guildId: "guild",
      orderId: "order",
      refundId: "refund_attempt_0001",
      actorUserId: "staff",
      quantity: 2,
    }),
    { code: "IDEMPOTENCY_CONFLICT" },
  );
});
