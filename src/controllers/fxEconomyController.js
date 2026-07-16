const logger = require("../logger");
const {
  EconomyOperationError,
} = require("../services/economyOperationService");
const { createFxEconomyService } = require("../services/fxEconomyService");
const { snapshot } = require("../services/fxMarketService");
const { StoreOrderError } = require("../services/storeOrderService");

const service = createFxEconomyService();
const ACCOUNTS = Object.freeze({
  auto: "auto",
  efectivo: "cash",
  corriente: "checking",
  salario: "salary",
});

function requestId(req) {
  const value = String(
    req.body?.requestId ?? req.header("idempotency-key") ?? "",
  );
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(value)) {
    throw new StoreOrderError(
      "El identificador no es válido.",
      "INVALID_REQUEST_ID",
      400,
    );
  }
  return value;
}

function getMarket(_req, res) {
  return res.json({ ok: true, market: snapshot() });
}

async function trade(req, res) {
  try {
    const action = String(req.body?.action ?? "");
    const asset = String(req.body?.asset ?? "").toUpperCase();
    const paymentSource = ACCOUNTS[req.body?.paymentSource ?? "auto"];
    const targetAccount = ACCOUNTS[req.body?.targetAccount ?? "corriente"];
    const result = await service.trade({
      guildId: req.dashboardUser.guildId,
      userId: req.dashboardUser.discordId,
      requestId: requestId(req),
      action,
      asset,
      amount: req.body?.amount,
      paymentSource,
      targetAccount,
    });
    if (result.outcome === "in_progress") {
      return res.status(409).json({
        ok: false,
        code: "OPERATION_IN_PROGRESS",
        message: "El intercambio ya se está procesando.",
      });
    }
    if (result.outcome === "manual_review") {
      return res.status(202).json({
        ok: true,
        status: "manual_review",
        message: "El intercambio requiere revisión administrativa.",
      });
    }
    return res.status(result.outcome === "already_committed" ? 200 : 201).json({
      ok: true,
      idempotent: result.outcome === "already_committed",
      action,
      asset,
      amount: result.quote.AssetUnits / result.quote.AssetScale,
      amountUnits: result.quote.AssetUnits,
      unitScale: result.quote.AssetScale,
      rate: result.quote.RateMinor / result.quote.RateScale,
      mxnAmountCents: result.quote.MxnAmountCents,
      mxnDelta:
        (action === "buy" ? -1 : 1) * (result.quote.MxnAmountCents / 100),
      marketDate: result.quote.MarketDate,
    });
  } catch (error) {
    if (
      error instanceof StoreOrderError ||
      error instanceof EconomyOperationError
    ) {
      return res.status(error.status ?? 409).json({
        ok: false,
        code: error.code,
        message: error.message,
      });
    }
    logger.error(
      { code: error?.code, name: error?.name },
      "FX operation failed",
    );
    return res.status(500).json({
      ok: false,
      code: "FX_OPERATION_FAILED",
      message: "No se pudo completar el intercambio.",
    });
  }
}

module.exports = { getMarket, trade };
