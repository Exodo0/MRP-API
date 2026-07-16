const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  createDashboardEconomyService,
  launderingQuote,
  licensePriceCents,
} = require("../src/services/dashboardEconomyService");

function query(value) {
  return { lean: async () => structuredClone(value) };
}

test("laundering quote uses integer cents and configured brackets", () => {
  assert.deepEqual(launderingQuote(49_999_900), {
    grossCents: 49_999_900,
    rateBasisPoints: 3000,
    feeCents: 14_999_970,
    netCents: 34_999_930,
  });
  assert.equal(launderingQuote(50_000_000).rateBasisPoints, 2000);
  assert.equal(launderingQuote(150_000_001).rateBasisPoints, 1000);
});

test("license catalog is authoritative and expressed in cents", () => {
  assert.equal(licensePriceCents("Armas", "TipoA"), 90000);
  assert.equal(licensePriceCents("Restringidas", "TipoZ"), 1000000);
  assert.throws(() => licensePriceCents("Armas", "inventada"), {
    code: "LICENSE_NOT_FOUND",
  });
});

test("debt payment builds a balanced idempotent operation", async () => {
  let captured;
  const economyService = {
    async executeEconomyOperation(request) {
      captured = request;
      return { outcome: "committed", operation: { Status: "committed" } };
    },
  };
  const service = createDashboardEconomyService({
    economyUserModel: {
      findOne: () =>
        query({
          Deuda: 100.01,
          Efectivo: 60,
          CuentaCorriente: { Balance: 40.01, Activa: true },
          CuentaSalario: { Balance: 0, Activa: true },
        }),
    },
    licenseModel: { findOne: () => query(null) },
    economyService,
  });
  const result = await service.payDebt({
    guildId: "guild",
    userId: "user",
    requestId: "attempt_0000000001",
    source: "auto",
  });
  assert.equal(result.debtPaidCents, 10001);
  assert.equal(captured.flow, "balanced");
  assert.equal(
    captured.debits.reduce((sum, entry) => sum + entry.AmountCents, 0),
    10001,
  );
  assert.equal(captured.credits[0].AmountCents, 10001);
  assert.equal(
    captured.idempotencyKey,
    "web:debt-payment:guild:attempt_0000000001",
  );
});

test("invalid license configuration fails before an economic mutation", async () => {
  let called = false;
  const service = createDashboardEconomyService({
    economyUserModel: { findOne: () => query({}) },
    licenseModel: { findOne: () => query(null) },
    economyService: {
      executeEconomyOperation: async () => {
        called = true;
      },
    },
  });
  await assert.rejects(
    service.operateLicense({
      guildId: "guild",
      userId: "user",
      requestId: "attempt_0000000001",
      action: "comprar",
      category: "Armas",
      code: "invalid",
      memberRoles: [],
    }),
    { code: "LICENSE_NOT_FOUND" },
  );
  assert.equal(called, false);
});

test("committed dashboard retries do not re-read already mutated balances", async () => {
  const model = {
    findOne() {
      throw new Error("mutable state must not be read for a committed retry");
    },
  };
  const economyService = {
    async getEconomyOperation({ idempotencyKey }) {
      if (idempotencyKey.includes("laundering")) {
        return {
          _id: "launder",
          Status: "committed",
          ActorUserId: "user",
          Debits: [{ AmountCents: 10000 }],
          Credits: [{ AmountCents: 7000 }],
          Metadata: { FeeBasisPoints: 3000 },
        };
      }
      if (idempotencyKey.includes("debt-payment")) {
        return {
          _id: "debt",
          Status: "committed",
          ActorUserId: "user",
          Credits: [{ AmountCents: 2500 }],
        };
      }
      return {
        _id: "license",
        Status: "committed",
        ActorUserId: "user",
        Metadata: { Category: "Armas", Code: "TipoA" },
        Result: { Work: { ExpiresAt: "2026-08-15T00:00:00.000Z" } },
      };
    },
  };
  const service = createDashboardEconomyService({
    economyUserModel: model,
    licenseModel: model,
    economyService,
  });
  const common = {
    guildId: "guild",
    userId: "user",
    requestId: "attempt_0000000001",
  };
  assert.equal((await service.launder(common)).outcome, "already_committed");
  assert.equal((await service.payDebt(common)).debtPaidCents, 2500);
  assert.equal(
    (
      await service.operateLicense({
        ...common,
        action: "comprar",
        category: "Armas",
        code: "TipoA",
      })
    ).outcome,
    "already_committed",
  );
});
