const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const statuses = [
  "pending",
  "processing",
  "committed",
  "delivery_pending",
  "completed",
  "failed",
  "cancelled",
  "manual_review",
];

const effectSchema = new mongoose.Schema(
  {
    StableId: { type: String, required: true },
    Type: { type: String, required: true },
    Status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    Payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    AttemptCount: { type: Number, default: 0 },
    LastError: { type: mongoose.Schema.Types.Mixed, default: null },
    CompletedAt: { type: Date, default: null },
  },
  { _id: false },
);

const schema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true },
    OrderId: { type: String, required: true },
    IdempotencyKey: { type: String, required: true },
    RequestHash: { type: String, required: true },
    UserId: { type: String, required: true },
    ItemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    Quantity: { type: Number, required: true, min: 1 },
    ListUnitPriceCents: { type: Number, required: true, min: 0 },
    DiscountBasisPoints: { type: Number, required: true, min: 0, max: 10000 },
    UnitPriceCents: { type: Number, required: true, min: 0 },
    TotalCents: { type: Number, required: true, min: 0 },
    PaymentAccount: {
      type: String,
      enum: ["auto", "cash", "checking", "salary"],
      required: true,
    },
    DebitPlan: { type: mongoose.Schema.Types.Mixed, default: [] },
    Status: {
      type: String,
      enum: statuses,
      default: "pending",
      required: true,
    },
    EconomyOperationId: { type: mongoose.Schema.Types.ObjectId, default: null },
    InventoryResult: { type: mongoose.Schema.Types.Mixed, default: null },
    Effects: { type: [effectSchema], default: [] },
    Error: { type: mongoose.Schema.Types.Mixed, default: null },
    AttemptCount: { type: Number, default: 0 },
    RefundedQuantity: { type: Number, default: 0, min: 0 },
    RefundedCents: { type: Number, default: 0, min: 0 },
    RefundedPlan: { type: mongoose.Schema.Types.Mixed, default: [] },
    MoneyVersion: { type: Number, default: 2, immutable: true },
    CompletedAt: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: "CreatedAt", updatedAt: "UpdatedAt" },
    collection: "storeorders",
    minimize: false,
    autoIndex: false,
  },
);

schema.index(
  { GuildId: 1, OrderId: 1 },
  { unique: true, name: "store_order_id" },
);
schema.index(
  { GuildId: 1, IdempotencyKey: 1 },
  { unique: true, name: "store_order_idempotency" },
);
schema.index(
  { GuildId: 1, UserId: 1, CreatedAt: -1 },
  { name: "store_order_user_history" },
);

module.exports =
  webConn.models.StoreOrder || webConn.model("StoreOrder", schema);
module.exports.STORE_ORDER_STATUSES = statuses;
