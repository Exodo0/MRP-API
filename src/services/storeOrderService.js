const Categoria = require("../models/Categoria");
const EconomyUser = require("../models/EconomyUser");
const Inventario = require("../models/Inventario");
const Item = require("../models/Item");
const StoreOrder = require("../models/StoreOrder");
const {
  createEconomyOperationService,
  hashRequest,
} = require("./economyOperationService");
const {
  calculateBasisPoints,
  parseLegacyMoneyToCents,
  parseMoneyToCents,
} = require("../utils/money");
const { sanitizeError } = require("../utils/safeError");

class StoreOrderError extends Error {
  constructor(message, code, status = 422, details = null) {
    super(message);
    this.name = "StoreOrderError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function resolveItemPricing(item) {
  const listUnitPriceCents = Number.isSafeInteger(item.PrecioCents)
    ? item.PrecioCents
    : parseMoneyToCents(item.Precio);
  const discountBasisPoints = Number.isSafeInteger(item.DiscountBasisPoints)
    ? item.DiscountBasisPoints
    : parseMoneyToCents(item.Descuento ?? 0);
  const discountCents = calculateBasisPoints(
    listUnitPriceCents,
    discountBasisPoints,
  );
  return {
    listUnitPriceCents,
    discountBasisPoints,
    unitPriceCents: listUnitPriceCents - discountCents,
  };
}

function resolveBalances(user) {
  return {
    cash: parseLegacyMoneyToCents(user?.Efectivo ?? 0),
    checking: parseLegacyMoneyToCents(user?.CuentaCorriente?.Balance ?? 0),
    salary: parseLegacyMoneyToCents(user?.CuentaSalario?.Balance ?? 0),
  };
}

function buildDebitPlan(userId, balances, amountCents, paymentAccount) {
  if (amountCents === 0) return [];
  const order =
    paymentAccount === "auto"
      ? ["cash", "checking", "salary"]
      : [paymentAccount];
  let remaining = amountCents;
  const plan = [];
  for (const accountType of order) {
    const amount = Math.min(remaining, balances[accountType] ?? 0);
    if (amount > 0) {
      plan.push({
        AccountId: `${userId}:${accountType}`,
        AccountType: accountType,
        OwnerUserId: userId,
        AmountCents: amount,
        Reason: "Compra en tienda web",
      });
      remaining -= amount;
    }
  }
  if (remaining > 0) {
    throw new StoreOrderError(
      "No tienes fondos suficientes.",
      "INSUFFICIENT_FUNDS",
      409,
    );
  }
  return plan;
}

function normalizeAttemptId(value) {
  const attemptId = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(attemptId)) {
    throw new StoreOrderError(
      "El identificador de compra no es válido.",
      "INVALID_ORDER_ID",
      400,
    );
  }
  return attemptId;
}

async function defaultRoleGrant({ guildId, userId, roleId }) {
  const token = process.env.DISCORD_TOKEN;
  if (!token)
    throw Object.assign(new Error("Discord delivery is not configured"), {
      code: "DELIVERY_NOT_CONFIGURED",
    });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`,
      {
        method: "PUT",
        headers: { Authorization: `Bot ${token}` },
        signal: controller.signal,
      },
    );
    if (!response.ok)
      throw Object.assign(new Error("Discord role delivery failed"), {
        code: `DISCORD_${response.status}`,
      });
  } finally {
    clearTimeout(timeout);
  }
}

function createStoreOrderService({
  itemModel = Item,
  categoryModel = Categoria,
  economyUserModel = EconomyUser,
  inventoryModel = Inventario,
  orderModel = StoreOrder,
  economyService = createEconomyOperationService(),
  roleGrant = defaultRoleGrant,
  now = () => new Date(),
} = {}) {
  async function loadOrder(guildId, orderId) {
    return orderModel.findOne({ GuildId: guildId, OrderId: orderId }).lean();
  }

  function assertSameRequest(
    order,
    { userId, itemId, quantity, paymentAccount },
  ) {
    if (
      order.UserId !== userId ||
      String(order.ItemId) !== String(itemId) ||
      order.Quantity !== quantity ||
      order.PaymentAccount !== paymentAccount
    ) {
      throw new StoreOrderError(
        "El identificador de compra ya pertenece a otra solicitud.",
        "IDEMPOTENCY_CONFLICT",
        409,
      );
    }
  }

  async function createOrLoadOrder({
    guildId,
    userId,
    itemId,
    quantity,
    paymentAccount,
    attemptId,
  }) {
    const existing = await loadOrder(guildId, attemptId);
    if (existing) {
      assertSameRequest(existing, { userId, itemId, quantity, paymentAccount });
      return existing;
    }
    const [item, user] = await Promise.all([
      itemModel.findOne({ _id: itemId, GuildId: guildId, Activo: true }).lean(),
      economyUserModel.findOne({ GuildId: guildId, UserId: userId }).lean(),
    ]);
    if (!item)
      throw new StoreOrderError(
        "El artículo no está disponible.",
        "ITEM_NOT_FOUND",
        404,
      );
    const category = await categoryModel
      .findOne({ _id: item.CategoriaId, GuildId: guildId, Activa: true })
      .lean();
    if (!category)
      throw new StoreOrderError(
        "La categoría no está disponible.",
        "CATEGORY_INACTIVE",
        409,
      );
    const pricing = resolveItemPricing(item);
    const totalCents = pricing.unitPriceCents * quantity;
    if (!Number.isSafeInteger(totalCents))
      throw new StoreOrderError(
        "El total excede el rango seguro.",
        "MONEY_UNSAFE_INTEGER",
        422,
      );
    if (totalCents > 0 && !user)
      throw new StoreOrderError(
        "No tienes economía disponible.",
        "ECONOMY_NOT_FOUND",
        409,
      );
    const debitPlan = buildDebitPlan(
      userId,
      resolveBalances(user),
      totalCents,
      paymentAccount,
    );
    const request = {
      UserId: userId,
      GuildId: guildId,
      ItemId: String(item._id),
      Quantity: quantity,
      PaymentAccount: paymentAccount,
      ...pricing,
      TotalCents: totalCents,
    };
    const effects = item.RolId
      ? [
          {
            StableId: `store-role:${guildId}:${attemptId}:${item.RolId}`,
            Type: "discord_role_add",
            Status: "pending",
            Payload: { RoleId: item.RolId },
          },
        ]
      : [];
    try {
      return await orderModel.findOneAndUpdate(
        { GuildId: guildId, OrderId: attemptId },
        {
          $setOnInsert: {
            GuildId: guildId,
            OrderId: attemptId,
            IdempotencyKey: `web:store:${guildId}:${attemptId}`,
            RequestHash: hashRequest(request),
            UserId: userId,
            ItemId: item._id,
            Quantity: quantity,
            ListUnitPriceCents: pricing.listUnitPriceCents,
            DiscountBasisPoints: pricing.discountBasisPoints,
            UnitPriceCents: pricing.unitPriceCents,
            TotalCents: totalCents,
            PaymentAccount: paymentAccount,
            DebitPlan: debitPlan,
            Status: "pending",
            Effects: effects,
            MoneyVersion: 2,
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      );
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const winner = await loadOrder(guildId, attemptId);
      assertSameRequest(winner, { userId, itemId, quantity, paymentAccount });
      return winner;
    }
  }

  async function applyInventoryAndStock({ session, operation, order }) {
    const item = await itemModel
      .findOne({ _id: order.ItemId, GuildId: order.GuildId, Activo: true })
      .session(session)
      .lean();
    if (!item)
      throw new StoreOrderError(
        "El artículo dejó de estar disponible.",
        "ITEM_NOT_FOUND",
        404,
      );
    const pricing = resolveItemPricing(item);
    if (
      pricing.unitPriceCents !== order.UnitPriceCents ||
      pricing.discountBasisPoints !== order.DiscountBasisPoints
    ) {
      throw new StoreOrderError(
        "El precio cambió; crea un nuevo intento.",
        "PRICE_CHANGED",
        409,
      );
    }
    const category = await categoryModel
      .findOne({ _id: item.CategoriaId, GuildId: order.GuildId, Activa: true })
      .session(session)
      .lean();
    if (!category)
      throw new StoreOrderError(
        "La categoría dejó de estar disponible.",
        "CATEGORY_INACTIVE",
        409,
      );
    if (item.Stock !== -1) {
      const stock = await itemModel.updateOne(
        {
          _id: item._id,
          GuildId: order.GuildId,
          Activo: true,
          Stock: { $gte: order.Quantity },
        },
        { $inc: { Stock: -order.Quantity } },
        { session },
      );
      if (stock.modifiedCount !== 1)
        throw new StoreOrderError(
          "No hay stock suficiente.",
          "INSUFFICIENT_STOCK",
          409,
        );
    }
    const inventory = await inventoryModel
      .findOne({ GuildId: order.GuildId, UserId: order.UserId })
      .session(session)
      .lean();
    const items = [...(inventory?.Items ?? [])];
    let owned = 0;
    const otherItems = [];
    for (const entry of items) {
      if (String(entry.ItemId) === String(item._id))
        owned += Number(entry.Cantidad ?? 0);
      else otherItems.push(entry);
    }
    if (
      item.LimitePorUsuario > 0 &&
      owned + order.Quantity > item.LimitePorUsuario
    ) {
      throw new StoreOrderError(
        "Alcanzaste el límite por usuario.",
        "USER_LIMIT_REACHED",
        409,
      );
    }
    const purchasedAt = now();
    const nextItems = [
      ...otherItems,
      {
        ItemId: item._id,
        NombreSnapshot: item.Nombre,
        CategoriaSnapshot: item.CategoriaNombre,
        PrecioSnapshot: order.UnitPriceCents / 100,
        PrecioSnapshotCents: order.UnitPriceCents,
        Cantidad: owned + order.Quantity,
        FechaAdquisicion: purchasedAt,
      },
    ];
    if (inventory) {
      const updated = await inventoryModel.updateOne(
        { _id: inventory._id, Revision: inventory.Revision ?? 0 },
        {
          $set: { Items: nextItems, UltimaActualizacion: purchasedAt },
          $inc: { Revision: 1 },
        },
        { session },
      );
      if (updated.modifiedCount !== 1)
        throw new StoreOrderError(
          "El inventario cambió concurrentemente.",
          "INVENTORY_CONFLICT",
          409,
        );
    } else {
      await inventoryModel.create(
        [
          {
            GuildId: order.GuildId,
            UserId: order.UserId,
            Items: nextItems,
            Revision: 1,
            UltimaActualizacion: purchasedAt,
          },
        ],
        { session },
      );
    }
    const updatedOrder = await orderModel.updateOne(
      { _id: order._id, Status: { $in: ["pending", "failed"] } },
      {
        $set: {
          Status: "committed",
          EconomyOperationId: operation._id,
          InventoryResult: {
            ItemId: String(item._id),
            Quantity: owned + order.Quantity,
          },
          Error: null,
        },
        $inc: { AttemptCount: 1 },
      },
      { session },
    );
    if (updatedOrder.matchedCount !== 1)
      throw new StoreOrderError(
        "La orden cambió concurrentemente.",
        "ORDER_CONFLICT",
        409,
      );
    return { ItemId: String(item._id), Quantity: owned + order.Quantity };
  }

  async function resumeDelivery(order) {
    if (!order.Effects?.length) {
      await orderModel.updateOne(
        { _id: order._id, Status: "committed" },
        { $set: { Status: "completed", CompletedAt: now() } },
      );
      return loadOrder(order.GuildId, order.OrderId);
    }
    const effect = order.Effects.find((entry) => entry.Status !== "completed");
    if (!effect) {
      await orderModel.updateOne(
        { _id: order._id, Status: { $ne: "completed" } },
        { $set: { Status: "completed", CompletedAt: now() } },
      );
      return loadOrder(order.GuildId, order.OrderId);
    }
    if (order.Status === "manual_review") return order;
    await orderModel.updateOne(
      {
        _id: order._id,
        "Effects.StableId": effect.StableId,
        "Effects.Status": { $ne: "completed" },
      },
      {
        $set: { Status: "delivery_pending", "Effects.$.Status": "processing" },
        $inc: { "Effects.$.AttemptCount": 1 },
      },
    );
    try {
      await roleGrant({
        guildId: order.GuildId,
        userId: order.UserId,
        roleId: effect.Payload.RoleId,
        stableId: effect.StableId,
      });
      await orderModel.updateOne(
        { _id: order._id, "Effects.StableId": effect.StableId },
        {
          $set: {
            Status: "completed",
            CompletedAt: now(),
            "Effects.$.Status": "completed",
            "Effects.$.CompletedAt": now(),
            "Effects.$.LastError": null,
          },
        },
      );
    } catch (error) {
      const attempts = Number(effect.AttemptCount ?? 0) + 1;
      await orderModel.updateOne(
        { _id: order._id, "Effects.StableId": effect.StableId },
        {
          $set: {
            Status: attempts >= 3 ? "manual_review" : "delivery_pending",
            "Effects.$.Status": "failed",
            "Effects.$.LastError": sanitizeError(error),
          },
        },
      );
    }
    return loadOrder(order.GuildId, order.OrderId);
  }

  async function executeStoreOrder({
    guildId,
    userId,
    itemId,
    quantity = 1,
    paymentAccount = "auto",
    attemptId,
  }) {
    const orderId = normalizeAttemptId(attemptId);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20)
      throw new StoreOrderError(
        "La cantidad debe estar entre 1 y 20.",
        "INVALID_QUANTITY",
        400,
      );
    if (!["auto", "cash", "checking", "salary"].includes(paymentAccount))
      throw new StoreOrderError(
        "La cuenta de pago no es válida.",
        "INVALID_PAYMENT_ACCOUNT",
        400,
      );
    let order = await createOrLoadOrder({
      guildId,
      userId,
      itemId,
      quantity,
      paymentAccount,
      attemptId: orderId,
    });
    if (
      ["completed", "delivery_pending", "manual_review", "committed"].includes(
        order.Status,
      )
    ) {
      return {
        outcome:
          order.Status === "completed" ? "already_completed" : order.Status,
        order: await resumeDelivery(order),
      };
    }
    try {
      const operationResult = await economyService.executeEconomyOperation({
        guildId,
        idempotencyKey: order.IdempotencyKey,
        type: "store_purchase",
        flow: order.TotalCents > 0 ? "sink" : "balanced",
        actorUserId: userId,
        debits: order.DebitPlan,
        metadata: { OrderId: order.OrderId, RequestHash: order.RequestHash },
        transactionalWork: (context) =>
          applyInventoryAndStock({ ...context, order }),
      });
      if (operationResult.outcome === "in_progress")
        return {
          outcome: "in_progress",
          order: await loadOrder(guildId, orderId),
        };
      if (operationResult.outcome === "manual_review")
        return {
          outcome: "manual_review",
          order: await loadOrder(guildId, orderId),
        };
      order = await loadOrder(guildId, orderId);
      return {
        outcome: operationResult.outcome,
        order: await resumeDelivery(order),
      };
    } catch (error) {
      const safe = sanitizeError(error);
      await orderModel.updateOne(
        { _id: order._id, Status: { $in: ["pending", "processing"] } },
        {
          $set: {
            Status: "failed",
            Error: {
              Code: error.code ?? safe.code ?? "STORE_ORDER_FAILED",
              Message: safe.message,
              At: now(),
            },
          },
        },
      );
      throw error;
    }
  }

  return { executeStoreOrder, loadOrder, resumeDelivery };
}

module.exports = {
  StoreOrderError,
  buildDebitPlan,
  createStoreOrderService,
  resolveItemPricing,
};
