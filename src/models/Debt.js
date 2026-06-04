const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const DebtSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true, index: true },
    UserId: { type: String, required: true, index: true },
    Institution: { type: String, required: true, index: true },
    Concept: { type: String, required: true },
    Amount: { type: Number, required: true, min: 0 },
    PaidAmount: { type: Number, default: 0, min: 0 },
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

module.exports = webConn.model("Debt", DebtSchema);
