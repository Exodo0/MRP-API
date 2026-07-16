const logger = require("../logger");
const {
  EconomyOperationError,
} = require("../services/economyOperationService");
const { StoreOrderError } = require("../services/storeOrderService");
const { createStoreRefundService } = require("../services/storeRefundService");

const service = createStoreRefundService();

async function refundStoreOrder(req, res) {
  try {
    const result = await service.executeStoreRefund({
      guildId: process.env.GUILD_ID,
      orderId: req.params.orderId,
      refundId: req.body?.refundId ?? req.header("idempotency-key"),
      actorUserId: req.cliUser.discordId,
      quantity: Number(req.body?.quantity),
    });
    return res.status(result.outcome === "already_completed" ? 200 : 201).json({
      ok: true,
      idempotent: result.outcome === "already_completed",
      refund: {
        refundId: result.refund.RefundId,
        orderId: result.refund.OrderId,
        status: result.refund.Status,
        quantity: result.refund.Quantity,
        amountCents: result.refund.AmountCents,
        completedAt: result.refund.CompletedAt,
      },
    });
  } catch (error) {
    if (
      error instanceof StoreOrderError ||
      error instanceof EconomyOperationError
    ) {
      return res
        .status(error.status ?? 409)
        .json({ ok: false, code: error.code, message: error.message });
    }
    logger.error(
      { code: error?.code, name: error?.name },
      "Store refund failed",
    );
    return res.status(500).json({
      ok: false,
      code: "STORE_REFUND_FAILED",
      message: "No se pudo completar el reembolso.",
    });
  }
}

module.exports = { refundStoreOrder };
