const assert = require("node:assert/strict");
const { test } = require("node:test");
const EconomyAssetLedgerEntry = require("../src/models/EconomyAssetLedgerEntry");
const FxQuote = require("../src/models/FxQuote");
const {
  createFxEconomyService,
  mxnCentsFor,
  parseAssetUnits,
} = require("../src/services/fxEconomyService");

function query(value) {
  return { lean: async () => structuredClone(value) };
}

test("FX amounts use separate integer units and exact MXN cents", () => {
  assert.equal(parseAssetUnits("USD", "100.01"), 10001);
  assert.equal(parseAssetUnits("BTC", "0.000001"), 1);
  assert.equal(mxnCentsFor(10001, 100, 250000, 10000), 250025);
  assert.throws(() => parseAssetUnits("USD", "1.001"), {
    code: "INVALID_ASSET_PRECISION",
  });
  assert.throws(() => parseAssetUnits("BTC", "1e-6"), {
    code: "INVALID_ASSET_AMOUNT",
  });
});

test("FX buy debits MXN and credits asset units in one operation", async () => {
  const at = new Date("2026-07-16T18:00:00.000Z");
  let quote;
  let economicRequest;
  let userUpdate;
  let assetLedger;
  const quoteModel = {
    findOneAndUpdate: async (_filter, update) => {
      quote = quote ?? { _id: "quote", ...update.$setOnInsert };
      return quote;
    },
    updateOne: async () => ({ matchedCount: 1 }),
  };
  const user = {
    Efectivo: 1000,
    CuentaCorriente: { Balance: 0, Activa: true },
    CuentaSalario: { Balance: 0, Activa: true },
    Divisas: { USD: 2, BTC: 0 },
    FxControl: null,
  };
  const service = createFxEconomyService({
    now: () => at,
    marketSnapshot: () => ({
      date: "2026-07-16",
      assets: {
        USD: { buy: 25, sell: 20, precision: 4 },
        BTC: { buy: 2_500_000, sell: 2_000_000, precision: 2 },
      },
    }),
    quoteModel,
    economyUserModel: {
      findOne: () => query(user),
      updateOne: async (_filter, update) => {
        userUpdate = update;
        return { matchedCount: 1 };
      },
    },
    assetLedgerModel: {
      create: async (documents) => {
        [assetLedger] = documents;
        return documents;
      },
    },
    economyService: {
      async executeEconomyOperation(request) {
        economicRequest = request;
        await request.transactionalWork({
          session: {},
          operation: { _id: "operation" },
        });
        return { outcome: "committed", operation: { _id: "operation" } };
      },
    },
  });
  const result = await service.trade({
    guildId: "guild",
    userId: "user",
    requestId: "fx_attempt_0000001",
    action: "buy",
    asset: "USD",
    amount: "10.01",
    paymentSource: "cash",
    targetAccount: "checking",
  });
  assert.equal(economicRequest.type, "fx_buy");
  assert.equal(economicRequest.debits[0].AmountCents, 25025);
  assert.equal(userUpdate.$set["DivisasUnits.USD"], 1201);
  assert.equal(assetLedger.AmountUnits, 1001);
  assert.equal(assetLedger.BalanceAfterUnits, 1201);
  assert.equal(result.quote.MxnAmountCents, 25025);
});

test("FX durable schemas declare unique quote and asset-ledger indexes", () => {
  const quoteIndexes = FxQuote.schema
    .indexes()
    .filter(
      ([fields, options]) =>
        fields.GuildId === 1 && fields.QuoteId === 1 && options.unique === true,
    );
  const ledgerIndexes = EconomyAssetLedgerEntry.schema
    .indexes()
    .filter(
      ([fields, options]) =>
        fields.OperationId === 1 &&
        fields.Asset === 1 &&
        options.unique === true,
    );
  assert.equal(quoteIndexes.length, 1);
  assert.equal(ledgerIndexes.length, 1);
});

test("an FX request id cannot be reused with a different payload", async () => {
  const at = new Date("2026-07-16T18:00:00.000Z");
  let stored;
  const service = createFxEconomyService({
    now: () => at,
    marketSnapshot: () => ({
      date: "2026-07-16",
      assets: {
        USD: { buy: 25, sell: 20, precision: 4 },
        BTC: { buy: 2_500_000, sell: 2_000_000, precision: 2 },
      },
    }),
    quoteModel: {
      findOneAndUpdate: async (_filter, update) => {
        stored = stored ?? { _id: "quote", ...update.$setOnInsert };
        return stored;
      },
    },
  });
  const base = {
    guildId: "guild",
    userId: "user",
    requestId: "fx_attempt_0000001",
    action: "buy",
    asset: "USD",
    paymentSource: "cash",
    targetAccount: "checking",
  };
  await service.createOrLoadQuote({ ...base, amount: "1.00" });
  await assert.rejects(service.createOrLoadQuote({ ...base, amount: "2.00" }), {
    code: "FX_IDEMPOTENCY_CONFLICT",
  });
});

test("a committed FX retry bypasses cooldown without rebuilding movements", async () => {
  const at = new Date("2026-07-16T18:00:00.000Z");
  const quote = {
    _id: "quote",
    QuoteId: "fx_attempt_0000001",
    AssetUnits: 100,
    AssetScale: 100,
    RateMinor: 250000,
    RateScale: 10000,
    MxnAmountCents: 2500,
    MarketDate: "2026-07-16",
    ExpiresAt: new Date(at.getTime() + 60_000),
    UsedOperationId: "operation",
  };
  const service = createFxEconomyService({
    now: () => at,
    marketSnapshot: () => ({
      date: "2026-07-16",
      assets: {
        USD: { buy: 25, sell: 20, precision: 4 },
        BTC: { buy: 2_500_000, sell: 2_000_000, precision: 2 },
      },
    }),
    quoteModel: {
      findOne: () => query(quote),
      findOneAndUpdate: async (_filter, update) => ({
        ...quote,
        RequestHash: update.$setOnInsert.RequestHash,
      }),
    },
    economyUserModel: {
      findOne: () =>
        query({
          Efectivo: 0,
          Divisas: { USD: 1 },
          FxControl: {
            DayKey: "2026-07-16",
            LastTradeAt: at,
            TransactionCount: 1,
          },
        }),
    },
    economyService: {
      getEconomyOperation: async () => ({
        _id: "operation",
        Status: "committed",
        ActorUserId: "user",
        Type: "fx_buy",
        Metadata: {
          QuoteId: "fx_attempt_0000001",
          Asset: "USD",
          AssetUnits: 100,
          PaymentSource: "cash",
          TargetAccount: "checking",
        },
      }),
    },
  });
  const result = await service.trade({
    guildId: "guild",
    userId: "user",
    requestId: "fx_attempt_0000001",
    action: "buy",
    asset: "USD",
    amount: "1.00",
    paymentSource: "cash",
    targetAccount: "checking",
  });
  assert.equal(result.outcome, "already_committed");
});
