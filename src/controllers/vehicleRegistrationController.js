const logger = require("../logger");
const {
  EconomyOperationError,
} = require("../services/economyOperationService");
const { StoreOrderError } = require("../services/storeOrderService");
const {
  CUSTOM_PLATE_COST_CENTS,
  createVehicleRegistrationService,
} = require("../services/vehicleRegistrationService");

const service = createVehicleRegistrationService();

async function registerVehicle(req, res) {
  try {
    const result = await service.register({
      guildId: req.dashboardUser.guildId,
      userId: req.dashboardUser.discordId,
      discordUsername: req.dashboardUser.discordUsername,
      requestId: req.body?.requestId,
      itemId: req.body?.itemId,
      customPlate: req.body?.plateCustom === true,
      requestedPlate: req.body?.plate,
      color: req.body?.colorPintura,
    });
    if (result.outcome === "in_progress") {
      return res.status(409).json({
        ok: false,
        code: "OPERATION_IN_PROGRESS",
        message: "El registro ya se está procesando.",
      });
    }
    if (result.outcome === "manual_review") {
      return res.status(202).json({
        ok: true,
        status: "manual_review",
        message: "El registro requiere revisión administrativa.",
      });
    }
    return res.status(result.outcome === "already_committed" ? 200 : 201).json({
      ok: true,
      idempotent: result.outcome === "already_committed",
      customPlateCostCents: result.vehicle?.PlacaPersonalizada
        ? CUSTOM_PLATE_COST_CENTS
        : 0,
      record: result.vehicle
        ? {
            id: String(result.vehicle._id),
            itemId: result.vehicle.ItemId,
            itemName: result.vehicle.ItemNombre,
            plate: result.vehicle.Matricula,
            colorPintura: result.vehicle.ColorPintura,
            colorCategoria: result.vehicle.ColorCategoria,
            placaPersonalizada: result.vehicle.PlacaPersonalizada,
          }
        : null,
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
      "Vehicle registration failed",
    );
    return res.status(500).json({
      ok: false,
      code: "VEHICLE_REGISTRATION_FAILED",
      message: "No se pudo registrar el vehículo.",
    });
  }
}

module.exports = { registerVehicle };
