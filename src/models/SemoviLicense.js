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
    PaymentStatus: {
      type: String,
      enum: ["free", "paid", "debt", "cancelled"],
      default: "free",
      index: true,
    },
    DebtId: { type: mongoose.Schema.Types.ObjectId, ref: "Debt", default: null },
    CreatedBy: { type: String, default: null },
    CancelledAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "semovilicenses",
  },
);

SemoviLicenseSchema.index({ GuildId: 1, UserId: 1, Active: 1 });
SemoviLicenseSchema.index({ GuildId: 1, Number: 1 }, { unique: true });

module.exports = webConn.model("SemoviLicense", SemoviLicenseSchema);
