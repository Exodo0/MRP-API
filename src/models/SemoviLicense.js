const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const SemoviLicenseSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true, index: true },
    UserId: { type: String, required: true, index: true },
    Type: { type: String, required: true },
    Number: { type: String, required: true },
    IssuedAt: { type: Date, required: true },
    ExpiresAt: { type: Date, required: true },
    Active: { type: Boolean, default: true, index: true },
    Price: { type: Number, default: 0, min: 0 },
    PriceCents: { type: Number, default: 0, min: 0 },
    MoneyVersion: { type: Number, enum: [2], default: 2 },
    PaymentStatus: {
      type: String,
      enum: ["free", "paid", "debt", "cancelled"],
      default: "free",
      index: true,
    },
    DebtId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Debt",
      default: null,
    },
    CreatedBy: { type: String, default: null },
    CancelledAt: { type: Date, default: null },
    EconomyOperationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EconomyOperation",
      default: null,
    },
    RoleEffect: {
      RoleId: { type: String, default: null },
      Action: { type: String, enum: ["add", "remove", null], default: null },
      Status: {
        type: String,
        enum: [
          "not_required",
          "pending",
          "processing",
          "completed",
          "failed",
          "manual_review",
        ],
        default: "not_required",
      },
      AttemptCount: { type: Number, default: 0, min: 0 },
      LeaseToken: { type: String, default: null },
      LeaseExpiresAt: { type: Date, default: null },
      LastError: { type: String, default: null },
      CompletedAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
    collection: "semovilicenses",
  },
);

SemoviLicenseSchema.index({ GuildId: 1, UserId: 1, Active: 1 });
SemoviLicenseSchema.index({ GuildId: 1, Number: 1 }, { unique: true });
SemoviLicenseSchema.index(
  { EconomyOperationId: 1 },
  { unique: true, sparse: true },
);

module.exports = webConn.model("SemoviLicense", SemoviLicenseSchema);
