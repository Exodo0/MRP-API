const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const schema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true },
    RefundId: { type: String, required: true },
    IdempotencyKey: { type: String, required: true },
    RequestHash: { type: String, required: true },
    OrderId: { type: String, required: true },
    UserId: { type: String, required: true },
    ActorUserId: { type: String, required: true },
    Quantity: { type: Number, required: true, min: 1 },
    AmountCents: { type: Number, required: true, min: 1 },
    CreditPlan: { type: mongoose.Schema.Types.Mixed, required: true },
    Status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "committed",
        "completed",
        "failed",
        "manual_review",
      ],
      default: "pending",
    },
    EconomyOperationId: { type: mongoose.Schema.Types.ObjectId, default: null },
    InventoryResult: { type: mongoose.Schema.Types.Mixed, default: null },
    Error: { type: mongoose.Schema.Types.Mixed, default: null },
    AttemptCount: { type: Number, default: 0 },
    MoneyVersion: { type: Number, default: 2, immutable: true },
    CompletedAt: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: "CreatedAt", updatedAt: "UpdatedAt" },
    collection: "storerefunds",
    minimize: false,
    autoIndex: false,
  },
);

schema.index(
  { GuildId: 1, RefundId: 1 },
  { unique: true, name: "store_refund_id" },
);
schema.index(
  { GuildId: 1, IdempotencyKey: 1 },
  { unique: true, name: "store_refund_idempotency" },
);
schema.index(
  { GuildId: 1, OrderId: 1, CreatedAt: -1 },
  { name: "store_refund_order_history" },
);

module.exports =
  webConn.models.StoreRefund || webConn.model("StoreRefund", schema);
