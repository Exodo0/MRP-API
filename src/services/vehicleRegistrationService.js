const { createHash } = require("node:crypto");
const EconomyUser = require("../models/EconomyUser");
const Inventario = require("../models/Inventario");
const Item = require("../models/Item");
const VehiculoRegistrado = require("../models/VehiculoRegistrado");
const Verificado = require("../models/Verificado");
const { createEconomyOperationService } = require("./economyOperationService");
const { StoreOrderError, buildDebitPlan } = require("./storeOrderService");
const { parseLegacyMoneyToCents } = require("../utils/money");

const CUSTOM_PLATE_COST_CENTS = 5_000_000;
const CUSTOM_PLATE_PATTERN = /^[A-Z0-9-]{3,8}$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/;
const PREMIUM_COLORS = new Set([
  "#fc4c00",
  "#940000",
  "#5a0000",
  "#622c7d",
  "#ff67ad",
  "#637caa",
  "#186cac",
  "#1d295e",
  "#fffaf5",
  "#fcca14",
  "#bab4ab",
  "#96fa00",
  "#1e1d1d",
  "#050505",
  "#9c865f",
  "#4a4f3c",
  "#363434",
  "#004124",
  "#636363",
  "#3d2c23",
  "#665d53",
]);

function normalizeCategory(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeRequestId(value) {
  const requestId = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(requestId)) {
    throw new StoreOrderError(
      "El identificador de registro no es válido.",
      "INVALID_REQUEST_ID",
      400,
    );
  }
  return requestId;
}

function stableAutomaticPlate(guildId, requestId) {
  const digest = createHash("sha256")
    .update(`${guildId}:${requestId}`)
    .digest("hex")
    .slice(0, 7)
    .toUpperCase();
  return `MX-${digest}`;
}

function normalizePlate(value, custom, guildId, requestId) {
  const plate = custom
    ? String(value ?? "")
        .trim()
        .toUpperCase()
    : stableAutomaticPlate(guildId, requestId);
  if (custom && !CUSTOM_PLATE_PATTERN.test(plate)) {
    throw new StoreOrderError(
      "La placa personalizada debe tener entre 3 y 8 caracteres válidos.",
      "INVALID_PLATE",
      400,
    );
  }
  return { plate, normalized: plate.replace(/[^A-Z0-9]/g, "") };
}

function inventoryQuantity(inventory, itemId) {
  return (inventory?.Items ?? []).reduce(
    (total, entry) =>
      String(entry.ItemId) === String(itemId)
        ? total + Math.max(0, Number(entry.Cantidad ?? 0))
        : total,
    0,
  );
}

function createVehicleRegistrationService({
  economyUserModel = EconomyUser,
  inventoryModel = Inventario,
  itemModel = Item,
  vehicleModel = VehiculoRegistrado,
  verifiedModel = Verificado,
  economyService = createEconomyOperationService(),
  now = () => new Date(),
} = {}) {
  async function register({
    guildId,
    userId,
    discordUsername,
    requestId: rawRequestId,
    itemId,
    customPlate,
    requestedPlate,
    color,
  }) {
    const requestId = normalizeRequestId(rawRequestId);
    if (!/^[a-fA-F0-9]{24}$/.test(String(itemId ?? ""))) {
      throw new StoreOrderError(
        "El artículo no es válido.",
        "INVALID_ITEM",
        400,
      );
    }
    const colorValue = String(color ?? "").toLowerCase();
    if (!COLOR_PATTERN.test(colorValue)) {
      throw new StoreOrderError("El color no es válido.", "INVALID_COLOR", 400);
    }
    const { plate, normalized } = normalizePlate(
      requestedPlate,
      customPlate,
      guildId,
      requestId,
    );
    const idempotencyKey = `web:vehicle-registration:${guildId}:${requestId}`;
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
        existing.Metadata?.ItemId !== String(itemId) ||
        existing.Metadata?.Plate !== plate ||
        existing.Metadata?.CustomPlate !== Boolean(customPlate) ||
        existing.Metadata?.Color !== colorValue
      ) {
        throw new StoreOrderError(
          "El intento pertenece a otro registro.",
          "IDEMPOTENCY_CONFLICT",
          409,
        );
      }
      if (existing.Status !== "committed") {
        return {
          outcome:
            existing.Status === "processing" ? "in_progress" : "manual_review",
          operation: existing,
          vehicle: null,
        };
      }
      const vehicle = await vehicleModel
        .findOne({ GuildId: guildId, EconomyOperationId: existing._id })
        .lean();
      return { outcome: "already_committed", operation: existing, vehicle };
    }
    const [item, inventory, user, verified] = await Promise.all([
      itemModel.findOne({ _id: itemId, GuildId: guildId, Activo: true }).lean(),
      inventoryModel.findOne({ GuildId: guildId, UserId: userId }).lean(),
      customPlate
        ? economyUserModel.findOne({ GuildId: guildId, UserId: userId }).lean()
        : null,
      verifiedModel
        .findOne({ GuildId: guildId, UserId: userId, Activo: true })
        .lean(),
    ]);
    if (
      !item ||
      !normalizeCategory(item.CategoriaNombre).includes("vehiculo")
    ) {
      throw new StoreOrderError(
        "El artículo no es un vehículo activo.",
        "INVALID_ITEM",
        404,
      );
    }
    if (!verified?.RobloxUsername) {
      throw new StoreOrderError(
        "Debes vincular tu cuenta de Roblox antes de registrar vehículos.",
        "ROBLOX_LINK_REQUIRED",
        403,
      );
    }
    const ownedQuantity = inventoryQuantity(inventory, itemId);
    if (!inventory || ownedQuantity < 1) {
      throw new StoreOrderError(
        "Solo puedes registrar vehículos de tu inventario.",
        "VEHICLE_NOT_OWNED",
        403,
      );
    }
    const debits = customPlate
      ? buildDebitPlan(
          userId,
          {
            cash: parseLegacyMoneyToCents(user?.Efectivo ?? 0),
            checking: parseLegacyMoneyToCents(
              user?.CuentaCorriente?.Balance ?? 0,
            ),
            salary: parseLegacyMoneyToCents(user?.CuentaSalario?.Balance ?? 0),
          },
          CUSTOM_PLATE_COST_CENTS,
          "auto",
        ).map((movement) => ({
          ...movement,
          Reason: "Matrícula personalizada",
        }))
      : [];
    const result = await economyService.executeEconomyOperation({
      guildId,
      idempotencyKey,
      type: customPlate ? "custom_plate" : "vehicle_registration",
      flow: customPlate ? "sink" : "balanced",
      actorUserId: userId,
      debits,
      credits: [],
      metadata: {
        ItemId: String(itemId),
        Plate: plate,
        CustomPlate: Boolean(customPlate),
        Color: colorValue,
      },
      transactionalWork: async ({ session, operation }) => {
        const lockedInventory = await inventoryModel.findOneAndUpdate(
          {
            _id: inventory._id,
            GuildId: guildId,
            UserId: userId,
            Revision: Number(inventory.Revision ?? 0),
          },
          { $inc: { Revision: 1 }, $set: { UltimaActualizacion: now() } },
          { session, returnDocument: "after" },
        );
        if (!lockedInventory) {
          throw new StoreOrderError(
            "Tu inventario cambió concurrentemente.",
            "INVENTORY_CONFLICT",
            409,
          );
        }
        const registered = await vehicleModel
          .countDocuments({
            GuildId: guildId,
            UserId: userId,
            ItemId: String(itemId),
          })
          .session(session);
        if (registered >= ownedQuantity) {
          throw new StoreOrderError(
            "No quedan unidades de este vehículo por registrar.",
            "REGISTRATION_LIMIT_REACHED",
            409,
          );
        }
        const document = await vehicleModel
          .create(
            [
              {
                GuildId: guildId,
                UserId: userId,
                ItemId: String(itemId),
                ItemNombre: item.Nombre,
                Matricula: plate,
                MatriculaNormalized: normalized,
                RobloxUsername: verified.RobloxUsername,
                OwnerDiscordUsername: discordUsername || "Ciudadano",
                ColorPintura: colorValue,
                ColorCategoria: PREMIUM_COLORS.has(colorValue)
                  ? "PREMIUM"
                  : "REGULAR",
                PlacaPersonalizada: Boolean(customPlate),
                EconomyOperationId: operation._id,
              },
            ],
            { session },
          )
          .then((documents) => documents[0]);
        return { VehicleId: document._id, Plate: plate };
      },
    });
    if (
      result.outcome === "in_progress" ||
      result.outcome === "manual_review"
    ) {
      return {
        outcome: result.outcome,
        operation: result.operation,
        vehicle: null,
      };
    }
    const vehicle = await vehicleModel
      .findOne({ GuildId: guildId, EconomyOperationId: result.operation._id })
      .lean();
    return { outcome: result.outcome, operation: result.operation, vehicle };
  }

  return { register };
}

module.exports = {
  CUSTOM_PLATE_COST_CENTS,
  createVehicleRegistrationService,
  normalizePlate,
  stableAutomaticPlate,
};
