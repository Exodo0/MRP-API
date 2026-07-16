const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const DebtSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true, index: true },
    UserId: { type: String, required: true, index: true },
    Institution: { type: String, required: true, index: true },
    Concept: { type: String, required: true },
    Amount: { type: Number, required: true, min: 0 },
    AmountCents: { type: Number, min: 0 },
    PaidAmount: { type: Number, default: 0, min: 0 },
    PaidAmountCents: { type: Number, min: 0, default: 0 },
    MoneyVersion: { type: Number, enum: [2] },
    EconomyOperationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EconomyOperation",
      default: null,
    },
    Status: {
      type: String,
      enum: ["pending", "paid", "cancelled"],
      default: "pending",
      index: true,
    },
    Metadata: { type: Object, default: {} },
    CreatedBy: { type: String, default: null },
    PaidAt: { type: Date, default: null },
    CancelledAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "debts",
  },
);

DebtSchema.index({ GuildId: 1, UserId: 1, Institution: 1, Status: 1 });
DebtSchema.index(
  { GuildId: 1, EconomyOperationId: 1 },
  { unique: true, sparse: true },
);

module.exports = webConn.model("Debt", DebtSchema);
