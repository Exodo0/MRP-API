const assert = require("node:assert/strict");
const { test } = require("node:test");
const jwt = require("jsonwebtoken");
const EconomyOperation = require("../src/models/EconomyOperation");
const EconomyLedgerEntry = require("../src/models/EconomyLedgerEntry");
const {
  InvalidMoneyAmountError,
  calculateBasisPoints,
  parseLegacyMoneyToCents,
  parseMoneyToCents,
} = require("../src/utils/money");
const {
  createEconomyOperationService,
} = require("../src/services/economyOperationService");
const {
  assertMongoTransactionsSupported,
} = require("../src/services/economyTransactionSupport");

function fakeOperations() {
  const operations = [];
  return {
    operations,
    model: {
      findOne(filter) {
        return {
          lean: async () =>
            operations.find(
              (entry) =>
                entry.GuildId === filter.GuildId &&
                entry.IdempotencyKey === filter.IdempotencyKey,
            ) ?? null,
        };
      },
      async findOneAndUpdate(filter, update) {
        let entry = operations.find((item) => {
          if (filter._id && item._id !== filter._id) return false;
          if (filter.GuildId && item.GuildId !== filter.GuildId) return false;
          if (
            filter.IdempotencyKey &&
            item.IdempotencyKey !== filter.IdempotencyKey
          )
            return false;
          if (filter.RequestHash && item.RequestHash !== filter.RequestHash)
            return false;
          if (filter.Status?.$in && !filter.Status.$in.includes(item.Status))
            return false;
          if (
            filter._id &&
            item.Status === "processing" &&
            item.LeaseToken &&
            item.LeaseExpiresAt > new Date()
          )
            return false;
          return true;
        });
        if (!entry && update.$setOnInsert) {
          entry = {
            _id: `op-${operations.length + 1}`,
            ...structuredClone(update.$setOnInsert),
          };
          operations.push(entry);
        }
        if (!entry) return null;
        if (update.$set) Object.assign(entry, structuredClone(update.$set));
        if (update.$inc)
          for (const [key, value] of Object.entries(update.$inc))
            entry[key] = (entry[key] ?? 0) + value;
        return structuredClone(entry);
      },
      async updateOne(filter, update) {
        const entry = operations.find(
          (item) =>
            item._id === filter._id &&
            (!filter.LeaseToken || item.LeaseToken === filter.LeaseToken),
        );
        if (!entry) return { matchedCount: 0 };
        Object.assign(entry, structuredClone(update.$set ?? {}));
        return { matchedCount: 1 };
      },
    },
  };
}

function fakeService(overrides = {}) {
  const state = fakeOperations();
  const balances = new Map([["cash:user", 10_000]]);
  const ledger = [];
  const accountStore = {
    ensureAccounts: async () => {},
    async debit(account, amount) {
      const key = `${account.AccountType}:${account.OwnerUserId}`;
      const before = balances.get(key) ?? 0;
      if (before < amount)
        throw Object.assign(new Error("Saldo insuficiente"), {
          code: "INSUFFICIENT_FUNDS",
        });
      balances.set(key, before - amount);
      return { balanceBeforeCents: before, balanceAfterCents: before - amount };
    },
    async credit(account, amount) {
      const key = `${account.AccountType}:${account.OwnerUserId}`;
      const before = balances.get(key) ?? 0;
      balances.set(key, before + amount);
      return { balanceBeforeCents: before, balanceAfterCents: before + amount };
    },
  };
  const service = createEconomyOperationService({
    operationModel: state.model,
    ledgerModel: {
      insertMany: async (entries) => ledger.push(...structuredClone(entries)),
    },
    accountStore,
    transactionSupportCheck: async () => ({ topology: "fake_replica_set" }),
    transactionRunner: async (callback) => callback({ id: "fake-session" }),
    ...overrides,
  });
  return { ...state, balances, ledger, service };
}

function request() {
  return {
    guildId: "guild",
    idempotencyKey: "web:test:guild:attempt",
    type: "store_purchase",
    flow: "sink",
    actorUserId: "user",
    debits: [
      {
        AccountId: "user:cash",
        AccountType: "cash",
        OwnerUserId: "user",
        AmountCents: 2500,
        Reason: "Prueba",
      },
    ],
  };
}

test("money helpers preserve cents and reject ambiguous input", () => {
  assert.equal(parseMoneyToCents("2500.00"), 250000);
  assert.equal(parseMoneyToCents("100.01"), 10001);
  assert.equal(parseLegacyMoneyToCents(400.00000000000006), 40000);
  assert.equal(calculateBasisPoints(10001, 1600), 1600);
  assert.throws(() => parseMoneyToCents("1.001"), InvalidMoneyAmountError);
  assert.throws(() => parseMoneyToCents(Number.NaN), {
    code: "MONEY_NOT_FINITE",
  });
  assert.throws(() => parseMoneyToCents("1e3"), {
    code: "MONEY_EXPONENTIAL_NOTATION",
  });
});

test("economic schemas expose the compatible unique indexes exactly once", () => {
  const operationIndexes = EconomyOperation.schema
    .indexes()
    .filter(([keys]) => keys.GuildId === 1 && keys.IdempotencyKey === 1);
  const ledgerIndexes = EconomyLedgerEntry.schema
    .indexes()
    .filter(([keys]) => keys.OperationId === 1 && keys.Sequence === 1);
  assert.equal(operationIndexes.length, 1);
  assert.equal(operationIndexes[0][1].unique, true);
  assert.equal(ledgerIndexes.length, 1);
  assert.equal(ledgerIndexes[0][1].unique, true);
});

test("same idempotency key commits once and returns the durable result", async () => {
  const fake = fakeService();
  const first = await fake.service.executeEconomyOperation(request());
  const second = await fake.service.executeEconomyOperation(request());
  assert.equal(first.outcome, "committed");
  assert.equal(second.outcome, "already_committed");
  assert.equal(fake.operations.length, 1);
  assert.equal(fake.ledger.length, 1);
  assert.equal(fake.balances.get("cash:user"), 7500);
});

test("same idempotency key rejects a different payload", async () => {
  const fake = fakeService();
  await fake.service.executeEconomyOperation(request());
  await assert.rejects(
    fake.service.executeEconomyOperation({
      ...request(),
      metadata: { changed: true },
    }),
    { code: "ECONOMY_IDEMPOTENCY_CONFLICT" },
  );
});

test("dashboard auth requires issuer, audience, subject and configured guild", async () => {
  const old = {
    secret: process.env.DASHBOARD_JWT_SECRET,
    guild: process.env.GUILD_ID,
  };
  process.env.DASHBOARD_JWT_SECRET = "test-secret-not-production";
  process.env.GUILD_ID = "guild";
  delete require.cache[require.resolve("../src/middleware/dashboardAuth")];
  const middleware = require("../src/middleware/dashboardAuth");
  const token = jwt.sign(
    { sub: "user", discordId: "user", guildId: "guild" },
    process.env.DASHBOARD_JWT_SECRET,
    { issuer: "mxrp-web", audience: "mrp-api", expiresIn: 30 },
  );
  const req = { header: () => `Bearer ${token}` };
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  let called = false;
  await middleware(req, res, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.equal(req.dashboardUser.discordId, "user");
  if (old.secret === undefined) delete process.env.DASHBOARD_JWT_SECRET;
  else process.env.DASHBOARD_JWT_SECRET = old.secret;
  if (old.guild === undefined) delete process.env.GUILD_ID;
  else process.env.GUILD_ID = old.guild;
  delete require.cache[require.resolve("../src/middleware/dashboardAuth")];
});

test("Mongo standalone is rejected and replica set is accepted", async () => {
  const connection = (hello) => ({
    readyState: 1,
    db: { admin: () => ({ command: async () => hello }) },
  });
  await assert.rejects(
    assertMongoTransactionsSupported(connection({ ok: 1 })),
    {
      code: "MONGO_TRANSACTIONS_UNAVAILABLE",
    },
  );
  assert.deepEqual(
    await assertMongoTransactionsSupported(
      connection({ ok: 1, setName: "test-replica" }),
    ),
    { topology: "replica_set" },
  );
});
