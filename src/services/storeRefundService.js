const Inventario = require("../models/Inventario");
const Item = require("../models/Item");
const StoreOrder = require("../models/StoreOrder");
const StoreRefund = require("../models/StoreRefund");
const {
  createEconomyOperationService,
  hashRequest,
} = require("./economyOperationService");
const { StoreOrderError } = require("./storeOrderService");
const { sanitizeError } = require("../utils/safeError");

function cumulativeRefundPlan(order, newRefundedQuantity) {
  const debits = order.DebitPlan ?? [];
  const cumulativeTotal = order.UnitPriceCents * newRefundedQuantity;
  let allocated = 0;
  return debits.map((entry, index) => {
    const amount =
      index === debits.length - 1
        ? cumulativeTotal - allocated
        : Math.floor(
            (entry.AmountCents * newRefundedQuantity) / order.Quantity,
          );
    allocated += amount;
    return {
      ...entry,
      AmountCents: amount,
      Reason: `Reembolso de orden ${order.OrderId}`,
    };
  });
}

function incrementalCreditPlan(order, quantity) {
  const previous = new Map(
    (order.RefundedPlan ?? []).map((entry) => [
      `${entry.AccountType}:${entry.AccountId}`,
      entry.AmountCents,
    ]),
  );
  const cumulative = cumulativeRefundPlan(
    order,
    order.RefundedQuantity + quantity,
  );
  return cumulative
    .map((entry) => ({
      ...entry,
      AmountCents:
        entry.AmountCents -
        (previous.get(`${entry.AccountType}:${entry.AccountId}`) ?? 0),
    }))
    .filter((entry) => entry.AmountCents > 0);
}

function createStoreRefundService({
  orderModel = StoreOrder,
  refundModel = StoreRefund,
  itemModel = Item,
  inventoryModel = Inventario,
  economyService = createEconomyOperationService(),
  now = () => new Date(),
} = {}) {
  const loadRefund = (guildId, refundId) =>
    refundModel.findOne({ GuildId: guildId, RefundId: refundId }).lean();

  async function executeStoreRefund({
    guildId,
    orderId,
    refundId,
    actorUserId,
    quantity,
  }) {
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(String(refundId ?? "")))
      throw new StoreOrderError(
        "El identificador de reembolso no es válido.",
        "INVALID_REFUND_ID",
        400,
      );
    if (!Number.isSafeInteger(quantity) || quantity < 1)
      throw new StoreOrderError(
        "La cantidad de reembolso no es válida.",
        "INVALID_REFUND_QUANTITY",
        400,
      );
    const existing = await loadRefund(guildId, refundId);
    if (existing) {
      if (
        existing.OrderId !== orderId ||
        existing.ActorUserId !== actorUserId ||
        existing.Quantity !== quantity
      )
        throw new StoreOrderError(
          "La clave de reembolso pertenece a otra solicitud.",
          "IDEMPOTENCY_CONFLICT",
          409,
        );
      if (existing.Status === "completed")
        return { outcome: "already_completed", refund: existing };
    }
    const order = await orderModel
      .findOne({ GuildId: guildId, OrderId: orderId })
      .lean();
    if (!order)
      throw new StoreOrderError(
        "La orden original no existe.",
        "ORDER_NOT_FOUND",
        404,
      );
    if (order.Status !== "completed")
      throw new StoreOrderError(
        "La orden no está disponible para reembolso.",
        "ORDER_NOT_REFUNDABLE",
        409,
      );
    if (order.RefundedQuantity + quantity > order.Quantity)
      throw new StoreOrderError(
        "El reembolso supera la cantidad original.",
        "REFUND_EXCEEDS_ORDER",
        409,
      );
    const credits = incrementalCreditPlan(order, quantity);
    const amountCents = credits.reduce(
      (sum, entry) => sum + entry.AmountCents,
      0,
    );
    const requestHash = hashRequest({
      GuildId: guildId,
      OrderId: orderId,
      RefundId: refundId,
      ActorUserId: actorUserId,
      Quantity: quantity,
      AmountCents: amountCents,
      Credits: credits,
    });
    let refund = existing;
    if (!refund) {
      refund = await refundModel.findOneAndUpdate(
        { GuildId: guildId, RefundId: refundId },
        {
          $setOnInsert: {
            GuildId: guildId,
            RefundId: refundId,
            IdempotencyKey: `web:store-refund:${guildId}:${refundId}`,
            RequestHash: requestHash,
            OrderId: orderId,
            UserId: order.UserId,
            ActorUserId: actorUserId,
            Quantity: quantity,
            AmountCents: amountCents,
            CreditPlan: credits,
            Status: "pending",
            MoneyVersion: 2,
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      );
    }
    try {
      const operation = await economyService.executeEconomyOperation({
        guildId,
        idempotencyKey: refund.IdempotencyKey,
        type: "store_refund",
        flow: "source",
        actorUserId,
        credits: refund.CreditPlan,
        metadata: { OrderId: orderId, RefundId: refundId },
        transactionalWork: async ({ session, operation: economyOperation }) => {
          const currentOrder = await orderModel
            .findOne({ _id: order._id })
            .session(session)
            .lean();
          if (
            !currentOrder ||
            currentOrder.Status !== "completed" ||
            currentOrder.RefundedQuantity !== order.RefundedQuantity
          )
            throw new StoreOrderError(
              "La orden cambió concurrentemente.",
              "ORDER_CONFLICT",
              409,
            );
          const inventory = await inventoryModel
            .findOne({ GuildId: guildId, UserId: order.UserId })
            .session(session)
            .lean();
          const entry = inventory?.Items?.find(
            (candidate) => String(candidate.ItemId) === String(order.ItemId),
          );
          if (!inventory || !entry || entry.Cantidad < quantity)
            throw new StoreOrderError(
              "El inventario no contiene la cantidad reembolsable.",
              "REFUND_INVENTORY_CONFLICT",
              409,
            );
          const nextItems = inventory.Items.map((candidate) =>
            String(candidate.ItemId) === String(order.ItemId)
              ? { ...candidate, Cantidad: candidate.Cantidad - quantity }
              : candidate,
          ).filter((candidate) => candidate.Cantidad > 0);
          const inventoryUpdate = await inventoryModel.updateOne(
            { _id: inventory._id, Revision: inventory.Revision ?? 0 },
            {
              $set: { Items: nextItems, UltimaActualizacion: now() },
              $inc: { Revision: 1 },
            },
            { session },
          );
          if (inventoryUpdate.modifiedCount !== 1)
            throw new StoreOrderError(
              "El inventario cambió concurrentemente.",
              "INVENTORY_CONFLICT",
              409,
            );
          const item = await itemModel
            .findOne({ _id: order.ItemId, GuildId: guildId })
            .session(session)
            .lean();
          if (!item)
            throw new StoreOrderError(
              "El artículo original ya no existe.",
              "REFUND_ITEM_MISSING",
              409,
            );
          if (item.Stock !== -1)
            await itemModel.updateOne(
              { _id: item._id, GuildId: guildId },
              { $inc: { Stock: quantity } },
              { session },
            );
          const newQuantity = order.RefundedQuantity + quantity;
          const cumulativePlan = cumulativeRefundPlan(order, newQuantity);
          const orderUpdate = await orderModel.updateOne(
            { _id: order._id, RefundedQuantity: order.RefundedQuantity },
            {
              $set: { RefundedPlan: cumulativePlan },
              $inc: { RefundedQuantity: quantity, RefundedCents: amountCents },
            },
            { session },
          );
          if (orderUpdate.modifiedCount !== 1)
            throw new StoreOrderError(
              "La orden cambió concurrentemente.",
              "ORDER_CONFLICT",
              409,
            );
          await refundModel.updateOne(
            { _id: refund._id, Status: { $in: ["pending", "failed"] } },
            {
              $set: {
                Status: "completed",
                EconomyOperationId: economyOperation._id,
                InventoryResult: {
                  RemainingQuantity: entry.Cantidad - quantity,
                },
                CompletedAt: now(),
                Error: null,
              },
              $inc: { AttemptCount: 1 },
            },
            { session },
          );
        },
      });
      return {
        outcome: operation.outcome,
        refund: await loadRefund(guildId, refundId),
      };
    } catch (error) {
      const safe = sanitizeError(error);
      await refundModel.updateOne(
        { _id: refund._id, Status: { $in: ["pending", "processing"] } },
        {
          $set: {
            Status:
              error?.code === "ECONOMY_MANUAL_REVIEW_REQUIRED"
                ? "manual_review"
                : "failed",
            Error: {
              Code: error?.code ?? "STORE_REFUND_FAILED",
              Message: safe.message,
              At: now(),
            },
          },
        },
      );
      throw error;
    }
  }

  return { executeStoreRefund, loadRefund };
}

module.exports = {
  createStoreRefundService,
  cumulativeRefundPlan,
  incrementalCreditPlan,
};
