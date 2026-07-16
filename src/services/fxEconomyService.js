const EconomyAssetLedgerEntry = require("../models/EconomyAssetLedgerEntry");
const EconomyUser = require("../models/EconomyUser");
const FxQuote = require("../models/FxQuote");
const {
  createEconomyOperationService,
  hashRequest,
} = require("./economyOperationService");
const { StoreOrderError, buildDebitPlan } = require("./storeOrderService");
const { parseLegacyMoneyToCents } = require("../utils/money");
const { snapshot, toDayKey } = require("./fxMarketService");

const ASSET_SCALE = Object.freeze({ USD: 100, BTC: 1_000_000 });
const LIMITS = Object.freeze({
  totalCents: 200_000_000,
  assetCents: 30_000_000,
  transactionCount: 50,
  cooldownMs: 60_000,
});

function parseAssetUnits(asset, raw) {
  const scale = ASSET_SCALE[asset];
  if (!scale)
    throw new StoreOrderError("El activo no es válido.", "INVALID_ASSET", 400);
  const text = typeof raw === "number" ? String(raw) : String(raw ?? "").trim();
  if (!text || /e/i.test(text) || !/^\d+(?:\.\d+)?$/.test(text)) {
    throw new StoreOrderError(
      "La cantidad no es válida.",
      "INVALID_ASSET_AMOUNT",
      422,
    );
  }
  const precision = Math.log10(scale);
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > precision) {
    throw new StoreOrderError(
      `La cantidad de ${asset} admite como máximo ${precision} decimales.`,
      "INVALID_ASSET_PRECISION",
      422,
    );
  }
  const units =
    BigInt(whole) * BigInt(scale) + BigInt(fraction.padEnd(precision, "0"));
  if (units <= 0n || units > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new StoreOrderError(
      "La cantidad está fuera de rango.",
      "INVALID_ASSET_AMOUNT",
      422,
    );
  }
  const maximumUnits = asset === "BTC" ? 10 * scale : 50_000 * scale;
  if (units > BigInt(maximumUnits)) {
    throw new StoreOrderError(
      "La cantidad excede el máximo por intercambio.",
      "FX_AMOUNT_TOO_LARGE",
      422,
    );
  }
  return Number(units);
}

function mxnCentsFor(assetUnits, assetScale, rateMinor, rateScale) {
  const numerator = BigInt(assetUnits) * BigInt(rateMinor) * 100n;
  const denominator = BigInt(assetScale) * BigInt(rateScale);
  const cents = (numerator + denominator / 2n) / denominator;
  if (cents < 1n || cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new StoreOrderError(
      "La cotización está fuera de rango.",
      "INVALID_FX_QUOTE",
      422,
    );
  }
  return Number(cents);
}

function legacyAssetUnits(user, asset) {
  const explicit = user?.DivisasUnits?.[asset];
  if (Number.isSafeInteger(explicit) && explicit >= 0) return explicit;
  const value = Number(user?.Divisas?.[asset] ?? 0);
  const units = Math.round(value * ASSET_SCALE[asset]);
  if (!Number.isFinite(value) || !Number.isSafeInteger(units) || units < 0) {
    throw new StoreOrderError(
      `El saldo ${asset} requiere revisión administrativa.`,
      "INVALID_LEGACY_ASSET_BALANCE",
      422,
    );
  }
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(value));
  if (Math.abs(value - units / ASSET_SCALE[asset]) > tolerance) {
    throw new StoreOrderError(
      `El saldo ${asset} tiene precisión inválida.`,
      "INVALID_LEGACY_ASSET_BALANCE",
      422,
    );
  }
  return units;
}

function controlState(user, dayKey) {
  const raw = user?.FxControl;
  if (!raw || raw.DayKey !== dayKey) {
    return {
      totalCents: 0,
      usdCents: 0,
      btcCents: 0,
      count: 0,
      lastTradeAt: raw?.LastTradeAt ? new Date(raw.LastTradeAt) : null,
    };
  }
  return {
    totalCents: Number.isSafeInteger(raw.TotalMxnCents)
      ? raw.TotalMxnCents
      : parseLegacyMoneyToCents(raw.TotalMxn ?? 0),
    usdCents: Number.isSafeInteger(raw.USDMxnCents)
      ? raw.USDMxnCents
      : parseLegacyMoneyToCents(raw.USDMxn ?? 0),
    btcCents: Number.isSafeInteger(raw.BTCMxnCents)
      ? raw.BTCMxnCents
      : parseLegacyMoneyToCents(raw.BTCMxn ?? 0),
    count: Number(raw.TransactionCount ?? 0),
    lastTradeAt: raw.LastTradeAt ? new Date(raw.LastTradeAt) : null,
  };
}

function validateLimits(state, asset, amountCents, at) {
  if (
    state.lastTradeAt &&
    at.getTime() - state.lastTradeAt.getTime() < LIMITS.cooldownMs
  ) {
    throw new StoreOrderError(
      "Debes esperar antes de otro cambio.",
      "FX_COOLDOWN_ACTIVE",
      409,
    );
  }
  if (state.count >= LIMITS.transactionCount) {
    throw new StoreOrderError(
      "Alcanzaste el límite diario de cambios.",
      "FX_DAILY_COUNT_LIMIT",
      409,
    );
  }
  if (state.totalCents + amountCents > LIMITS.totalCents) {
    throw new StoreOrderError(
      "Excedes el límite diario total.",
      "FX_DAILY_TOTAL_LIMIT",
      409,
    );
  }
  const assetCurrent = asset === "USD" ? state.usdCents : state.btcCents;
  if (assetCurrent + amountCents > LIMITS.assetCents) {
    throw new StoreOrderError(
      "Excedes el límite diario del activo.",
      "FX_DAILY_ASSET_LIMIT",
      409,
    );
  }
}

function createFxEconomyService({
  economyUserModel = EconomyUser,
  quoteModel = FxQuote,
  assetLedgerModel = EconomyAssetLedgerEntry,
  economyService = createEconomyOperationService(),
  marketSnapshot = snapshot,
  now = () => new Date(),
} = {}) {
  async function createOrLoadQuote(request) {
    const market = marketSnapshot(now());
    const price = market.assets[request.asset];
    const rateScale = 10 ** price.precision;
    const rateMinor = Math.round(
      (request.action === "buy" ? price.buy : price.sell) * rateScale,
    );
    const assetScale = ASSET_SCALE[request.asset];
    const assetUnits = parseAssetUnits(request.asset, request.amount);
    const requestHash = hashRequest({
      UserId: request.userId,
      Action: request.action,
      Asset: request.asset,
      AssetUnits: assetUnits,
      PaymentSource: request.paymentSource,
      TargetAccount: request.targetAccount,
    });
    const proposed = {
      GuildId: request.guildId,
      QuoteId: request.requestId,
      RequestHash: requestHash,
      UserId: request.userId,
      Action: request.action,
      Asset: request.asset,
      AssetUnits: assetUnits,
      AssetScale: assetScale,
      RateMinor: rateMinor,
      RateScale: rateScale,
      MxnAmountCents: mxnCentsFor(assetUnits, assetScale, rateMinor, rateScale),
      MarketDate: market.date,
      ExpiresAt: new Date(now().getTime() + 5 * 60 * 1000),
    };
    let quote;
    try {
      quote = await quoteModel.findOneAndUpdate(
        { GuildId: request.guildId, QuoteId: request.requestId },
        { $setOnInsert: proposed },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      );
    } catch (error) {
      if (error?.code !== 11000) throw error;
      quote = await quoteModel.findOne({
        GuildId: request.guildId,
        QuoteId: request.requestId,
      });
    }
    const plain = quote?.toObject ? quote.toObject() : quote;
    if (!plain || plain.RequestHash !== requestHash) {
      throw new StoreOrderError(
        "El intento ya pertenece a otro intercambio.",
        "FX_IDEMPOTENCY_CONFLICT",
        409,
      );
    }
    if (
      new Date(plain.ExpiresAt).getTime() <= now().getTime() &&
      !plain.UsedOperationId
    ) {
      throw new StoreOrderError(
        "La cotización expiró.",
        "FX_QUOTE_EXPIRED",
        409,
      );
    }
    return plain;
  }

  async function trade({
    guildId,
    userId,
    requestId,
    action,
    asset,
    amount,
    paymentSource = "auto",
    targetAccount = "checking",
  }) {
    if (!["buy", "sell"].includes(action)) {
      throw new StoreOrderError(
        "La acción no es válida.",
        "INVALID_FX_ACTION",
        400,
      );
    }
    if (!ASSET_SCALE[asset]) {
      throw new StoreOrderError(
        "El activo no es válido.",
        "INVALID_ASSET",
        400,
      );
    }
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(String(requestId ?? ""))) {
      throw new StoreOrderError(
        "El identificador no es válido.",
        "INVALID_REQUEST_ID",
        400,
      );
    }
    if (!["cash", "checking", "salary", "auto"].includes(paymentSource)) {
      throw new StoreOrderError(
        "La cuenta de pago no es válida.",
        "INVALID_ACCOUNT",
        400,
      );
    }
    if (!["cash", "checking", "salary"].includes(targetAccount)) {
      throw new StoreOrderError(
        "La cuenta destino no es válida.",
        "INVALID_ACCOUNT",
        400,
      );
    }
    const idempotencyKey = `web:fx:${guildId}:${requestId}`;
    const requestedAssetUnits = parseAssetUnits(asset, amount);
    const existing = await economyService.getEconomyOperation?.({
      guildId,
      idempotencyKey,
    });
    if (
      existing &&
      ["committed", "processing", "manual_review"].includes(existing.Status)
    ) {
      if (
        existing.ActorUserId !== userId ||
        existing.Type !== (action === "buy" ? "fx_buy" : "fx_sell") ||
        existing.Metadata?.Asset !== asset ||
        existing.Metadata?.AssetUnits !== requestedAssetUnits ||
        (existing.Metadata?.PaymentSource &&
          existing.Metadata.PaymentSource !== paymentSource) ||
        (existing.Metadata?.TargetAccount &&
          existing.Metadata.TargetAccount !== targetAccount)
      ) {
        throw new StoreOrderError(
          "El intento pertenece a otro intercambio.",
          "FX_IDEMPOTENCY_CONFLICT",
          409,
        );
      }
      const storedQuoteQuery = quoteModel.findOne({
        GuildId: guildId,
        QuoteId: requestId,
      });
      const storedQuote = storedQuoteQuery?.lean
        ? await storedQuoteQuery.lean()
        : await storedQuoteQuery;
      if (!storedQuote) {
        throw new StoreOrderError(
          "La cotización durable no está disponible.",
          "FX_QUOTE_REVIEW_REQUIRED",
          409,
        );
      }
      return {
        outcome:
          existing.Status === "committed"
            ? "already_committed"
            : existing.Status === "processing"
              ? "in_progress"
              : "manual_review",
        operation: existing,
        quote: storedQuote,
      };
    }
    const user = await economyUserModel
      .findOne({ GuildId: guildId, UserId: userId })
      .lean();
    if (!user)
      throw new StoreOrderError(
        "No tienes economía registrada.",
        "ECONOMY_NOT_FOUND",
        404,
      );
    const quote = await createOrLoadQuote({
      guildId,
      userId,
      requestId,
      action,
      asset,
      amount,
      paymentSource,
      targetAccount,
    });
    const tradedAt = now();
    const dayKey = toDayKey(tradedAt);
    const state = controlState(user, dayKey);
    validateLimits(state, asset, quote.MxnAmountCents, tradedAt);
    const currentAssetUnits = legacyAssetUnits(user, asset);
    if (action === "sell" && currentAssetUnits < quote.AssetUnits) {
      throw new StoreOrderError(
        `No tienes ${asset} suficiente.`,
        "INSUFFICIENT_ASSET",
        409,
      );
    }
    const debitPlan =
      action === "buy"
        ? buildDebitPlan(
            userId,
            {
              cash: parseLegacyMoneyToCents(user.Efectivo ?? 0),
              checking: parseLegacyMoneyToCents(
                user.CuentaCorriente?.Balance ?? 0,
              ),
              salary: parseLegacyMoneyToCents(user.CuentaSalario?.Balance ?? 0),
            },
            quote.MxnAmountCents,
            paymentSource,
          ).map((entry) => ({ ...entry, Reason: `Compra de ${asset}` }))
        : [];
    const credits =
      action === "sell"
        ? [
            {
              AccountId: `${userId}:${targetAccount}`,
              AccountType: targetAccount,
              OwnerUserId: userId,
              AmountCents: quote.MxnAmountCents,
              Reason: `Venta de ${asset}`,
            },
          ]
        : [];
    const result = await economyService.executeEconomyOperation({
      guildId,
      idempotencyKey,
      type: action === "buy" ? "fx_buy" : "fx_sell",
      flow: action === "buy" ? "sink" : "source",
      actorUserId: userId,
      debits: debitPlan,
      credits,
      metadata: {
        QuoteId: quote.QuoteId,
        Action: action,
        Asset: asset,
        AssetUnits: quote.AssetUnits,
        AssetScale: quote.AssetScale,
        RateMinor: quote.RateMinor,
        RateScale: quote.RateScale,
        MarketDate: quote.MarketDate,
        PaymentSource: paymentSource,
        TargetAccount: targetAccount,
      },
      transactionalWork: async ({ session, operation }) => {
        const beforeUnits = currentAssetUnits;
        const afterUnits =
          action === "buy"
            ? beforeUnits + quote.AssetUnits
            : beforeUnits - quote.AssetUnits;
        const assetFilter = Number.isSafeInteger(user.DivisasUnits?.[asset])
          ? { [`DivisasUnits.${asset}`]: beforeUnits }
          : { [`Divisas.${asset}`]: Number(user.Divisas?.[asset] ?? 0) };
        const nextTotal = state.totalCents + quote.MxnAmountCents;
        const nextUsd =
          state.usdCents + (asset === "USD" ? quote.MxnAmountCents : 0);
        const nextBtc =
          state.btcCents + (asset === "BTC" ? quote.MxnAmountCents : 0);
        const updated = await economyUserModel.updateOne(
          { GuildId: guildId, UserId: userId, ...assetFilter },
          {
            $set: {
              [`DivisasUnits.${asset}`]: afterUnits,
              [`Divisas.${asset}`]: afterUnits / quote.AssetScale,
              FxControl: {
                DayKey: dayKey,
                TotalMxn: nextTotal / 100,
                USDMxn: nextUsd / 100,
                BTCMxn: nextBtc / 100,
                TotalMxnCents: nextTotal,
                USDMxnCents: nextUsd,
                BTCMxnCents: nextBtc,
                TransactionCount: state.count + 1,
                LastTradeAt: tradedAt,
              },
            },
          },
          { session, runValidators: true },
        );
        if (updated.matchedCount !== 1) {
          throw new StoreOrderError(
            "El saldo de divisas cambió.",
            "FX_BALANCE_CONFLICT",
            409,
          );
        }
        const quoteUpdate = await quoteModel.updateOne(
          {
            _id: quote._id,
            $or: [
              { UsedOperationId: null },
              { UsedOperationId: operation._id },
            ],
          },
          { $set: { UsedOperationId: operation._id } },
          { session },
        );
        if (quoteUpdate.matchedCount !== 1) {
          throw new StoreOrderError(
            "La cotización ya fue usada.",
            "FX_QUOTE_CONFLICT",
            409,
          );
        }
        await assetLedgerModel.create(
          [
            {
              GuildId: guildId,
              OperationId: operation._id,
              AccountId: `${userId}:${asset}`,
              Asset: asset,
              Direction: action === "buy" ? "credit" : "debit",
              AmountUnits: quote.AssetUnits,
              UnitScale: quote.AssetScale,
              BalanceBeforeUnits: beforeUnits,
              BalanceAfterUnits: afterUnits,
              MxnAmountCents: quote.MxnAmountCents,
              QuoteId: quote.QuoteId,
              CreatedAt: tradedAt,
            },
          ],
          { session },
        );
        return { AssetBalanceUnits: afterUnits, QuoteId: quote.QuoteId };
      },
    });
    return { outcome: result.outcome, operation: result.operation, quote };
  }

  return { createOrLoadQuote, trade };
}

module.exports = {
  ASSET_SCALE,
  LIMITS,
  createFxEconomyService,
  legacyAssetUnits,
  mxnCentsFor,
  parseAssetUnits,
};
