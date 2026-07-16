const logger = require("../logger");
const { StoreOrderError } = require("../services/storeOrderService");
const {
  EconomyOperationError,
} = require("../services/economyOperationService");
const {
  createSemoviEconomyService,
} = require("../services/semoviEconomyService");
const { serializeLicense } = require("./licenseController");

const service = createSemoviEconomyService();

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

function handle(error, res) {
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
    "SEMOVI operation failed",
  );
  return res.status(500).json({
    ok: false,
    code: "SEMOVI_OPERATION_FAILED",
    message: "No se pudo completar la operación de SEMOVI.",
  });
}

async function issueDigitalLicense(req, res) {
  try {
    const result = await service.issue({
      guildId: process.env.GUILD_ID,
      actorUserId: req.cliUser.discordId,
      targetUserId: String(req.body?.userId ?? ""),
      requestId: requestId(req),
      type: String(req.body?.type ?? ""),
      paymentMode: String(req.body?.paymentMode ?? ""),
    });
    const status =
      result.outcome === "in_progress"
        ? 409
        : result.outcome === "manual_review" ||
            result.delivery?.status === "manual_review"
          ? 202
          : result.delivery?.status === "failed" ||
              result.delivery?.status === "processing"
            ? 202
            : result.outcome === "already_committed"
              ? 200
              : 201;
    return res.status(status).json({
      ok: status < 400,
      idempotent: result.outcome === "already_committed",
      status:
        result.delivery?.status === "failed" ||
        result.delivery?.status === "processing"
          ? "delivery_pending"
          : (result.delivery?.status ?? result.outcome),
      license: serializeLicense(result.license),
    });
  } catch (error) {
    return handle(error, res);
  }
}

async function updateLicense(req, res) {
  try {
    const action = req.body?.action;
    if (!new Set(["add", "remove"]).has(action)) {
      throw new StoreOrderError(
        "La acción no es válida.",
        "INVALID_LICENSE_ACTION",
        400,
      );
    }
    const result = await service.issue({
      guildId: process.env.GUILD_ID,
      actorUserId: req.cliUser.discordId,
      targetUserId: String(req.body?.userId ?? ""),
      requestId: requestId(req),
      type: String(req.body?.license ?? ""),
      paymentMode:
        action === "remove" ? "free" : String(req.body?.paymentMode ?? "paid"),
      roleAction: action,
    });
    const pending = ["failed", "processing"].includes(result.delivery?.status);
    const manual = result.delivery?.status === "manual_review";
    return res
      .status(
        pending || manual
          ? 202
          : result.outcome === "already_committed"
            ? 200
            : 201,
      )
      .json({
        ok: true,
        idempotent: result.outcome === "already_committed",
        status: manual
          ? "manual_review"
          : pending
            ? "delivery_pending"
            : "completed",
        license: serializeLicense(result.license),
      });
  } catch (error) {
    return handle(error, res);
  }
}

module.exports = { issueDigitalLicense, updateLicense };
