const logger = require("../logger");
const {
  EconomyOperationError,
} = require("../services/economyOperationService");
const { StoreOrderError } = require("../services/storeOrderService");
const {
  createDashboardEconomyService,
} = require("../services/dashboardEconomyService");

const service = createDashboardEconomyService();

function requestId(req) {
  const value = String(
    req.body?.requestId ?? req.header("idempotency-key") ?? "",
  );
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(value)) {
    throw new StoreOrderError(
      "El identificador de operación no es válido.",
      "INVALID_REQUEST_ID",
      400,
    );
  }
  return value;
}

function handle(error, res, label) {
  if (
    error instanceof StoreOrderError ||
    error instanceof EconomyOperationError
  ) {
    return res
      .status(error.status ?? 409)
      .json({ ok: false, code: error.code, message: error.message });
  }
  logger.error({ code: error?.code, name: error?.name }, label);
  return res.status(500).json({
    ok: false,
    code: "ECONOMY_OPERATION_FAILED",
    message: "No se pudo completar la operación.",
  });
}

function pendingOutcome(result, res) {
  if (result.outcome === "in_progress") {
    res.status(409).json({
      ok: false,
      code: "OPERATION_IN_PROGRESS",
      message: "La operación ya se está procesando.",
    });
    return true;
  }
  if (result.outcome === "manual_review") {
    res.status(202).json({
      ok: true,
      status: "manual_review",
      message: "La operación requiere revisión administrativa.",
    });
    return true;
  }
  return false;
}

async function launder(req, res) {
  try {
    const result = await service.launder({
      guildId: req.dashboardUser.guildId,
      userId: req.dashboardUser.discordId,
      requestId: requestId(req),
    });
    if (pendingOutcome(result, res)) return res;
    return res.status(result.outcome === "already_committed" ? 200 : 201).json({
      ok: true,
      idempotent: result.outcome === "already_committed",
      montoOriginal: result.grossCents / 100,
      comisionPct: result.rateBasisPoints / 100,
      comision: result.feeCents / 100,
      neto: result.netCents / 100,
      grossCents: result.grossCents,
      feeCents: result.feeCents,
      netCents: result.netCents,
    });
  } catch (error) {
    return handle(error, res, "Money laundering failed");
  }
}

async function payDebt(req, res) {
  try {
    const result = await service.payDebt({
      guildId: req.dashboardUser.guildId,
      userId: req.dashboardUser.discordId,
      requestId: requestId(req),
      source: req.body?.paymentSource ?? "auto",
    });
    if (pendingOutcome(result, res)) return res;
    return res.status(result.outcome === "already_committed" ? 200 : 201).json({
      ok: true,
      idempotent: result.outcome === "already_committed",
      deudaPagada: result.debtPaidCents / 100,
      debtPaidCents: result.debtPaidCents,
    });
  } catch (error) {
    return handle(error, res, "Debt payment failed");
  }
}

async function operateLicense(req, res) {
  try {
    const result = await service.operateLicense({
      guildId: req.dashboardUser.guildId,
      userId: req.dashboardUser.discordId,
      requestId: requestId(req),
      action: req.body?.action,
      category: req.body?.categoria,
      code: req.body?.codigo,
      source: req.body?.paymentSource ?? "auto",
      memberRoles: Array.isArray(req.dashboardMember?.roles)
        ? req.dashboardMember.roles
        : [],
    });
    if (pendingOutcome(result, res)) return res;
    return res.status(result.outcome === "already_committed" ? 200 : 201).json({
      ok: true,
      idempotent: result.outcome === "already_committed",
      action: result.action,
      licencia: {
        categoria: result.category,
        codigo: result.code,
        FechaExpiracion: result.expiresAt?.toISOString() ?? null,
      },
      precioPagado: result.action === "cancelar" ? 0 : result.priceCents / 100,
      reembolso: result.refundCents / 100,
      priceCents: result.priceCents,
      refundCents: result.refundCents,
    });
  } catch (error) {
    return handle(error, res, "License operation failed");
  }
}

module.exports = { launder, operateLicense, payDebt };
