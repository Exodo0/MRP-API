const mongoose = require("mongoose");
const logger = require("../logger");
const {
  EconomyOperationError,
} = require("../services/economyOperationService");
const {
  StoreOrderError,
  createStoreOrderService,
} = require("../services/storeOrderService");

const service = createStoreOrderService();

function paymentAccount(value) {
  return (
    {
      efectivo: "cash",
      corriente: "checking",
      salario: "salary",
      auto: "auto",
    }[value] ?? value
  );
}

function responseOrder(order) {
  return {
    orderId: order.OrderId,
    status: order.Status,
    itemId: String(order.ItemId),
    quantity: order.Quantity,
    unitPriceCents: order.UnitPriceCents,
    totalCents: order.TotalCents,
    paymentAccount: order.PaymentAccount,
    inventory: order.InventoryResult,
    effects: (order.Effects ?? []).map((effect) => ({
      type: effect.Type,
      status: effect.Status,
    })),
    completedAt: order.CompletedAt ?? null,
  };
}

function handleError(error, res) {
  const known =
    error instanceof StoreOrderError || error instanceof EconomyOperationError;
  if (known) {
    const conflictCodes = new Set([
      "INSUFFICIENT_FUNDS",
      "INSUFFICIENT_STOCK",
      "USER_LIMIT_REACHED",
      "INVENTORY_CONFLICT",
      "IDEMPOTENCY_CONFLICT",
      "ECONOMY_IDEMPOTENCY_CONFLICT",
    ]);
    const status = error.status ?? (conflictCodes.has(error.code) ? 409 : 422);
    return res
      .status(status)
      .json({ ok: false, code: error.code, message: error.message });
  }
  logger.error({ code: error?.code, name: error?.name }, "Store order failed");
  return res.status(500).json({
    ok: false,
    code: "STORE_ORDER_FAILED",
    message: "No se pudo completar la compra.",
  });
}

async function createStoreOrder(req, res) {
  try {
    const itemId = String(req.body?.itemId ?? "");
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        ok: false,
        code: "INVALID_ITEM",
        message: "El artículo no es válido.",
      });
    }
    const result = await service.executeStoreOrder({
      guildId: req.dashboardUser.guildId,
      userId: req.dashboardUser.discordId,
      itemId,
      quantity: Number(req.body?.quantity ?? req.body?.cantidad ?? 1),
      paymentAccount: paymentAccount(
        req.body?.paymentAccount ?? req.body?.paymentSource ?? "auto",
      ),
      attemptId: req.body?.orderId ?? req.header("idempotency-key"),
    });
    if (result.outcome === "in_progress") {
      return res.status(409).json({
        ok: false,
        code: "ORDER_IN_PROGRESS",
        message: "La compra sigue en proceso.",
        order: responseOrder(result.order),
      });
    }
    const status =
      result.order.Status === "delivery_pending"
        ? 202
        : result.outcome === "already_completed"
          ? 200
          : 201;
    return res.status(status).json({
      ok: true,
      idempotent: result.outcome === "already_completed",
      order: responseOrder(result.order),
    });
  } catch (error) {
    return handleError(error, res);
  }
}

async function getStoreOrder(req, res) {
  try {
    const order = await service.loadOrder(
      req.dashboardUser.guildId,
      req.params.orderId,
    );
    if (!order || order.UserId !== req.dashboardUser.discordId) {
      return res.status(404).json({
        ok: false,
        code: "ORDER_NOT_FOUND",
        message: "Orden no encontrada.",
      });
    }
    const refreshed = ["committed", "delivery_pending"].includes(order.Status)
      ? await service.resumeDelivery(order)
      : order;
    return res.json({ ok: true, order: responseOrder(refreshed) });
  } catch (error) {
    return handleError(error, res);
  }
}

module.exports = { createStoreOrder, getStoreOrder };
