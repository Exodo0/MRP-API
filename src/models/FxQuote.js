const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const schema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true },
    QuoteId: { type: String, required: true },
    RequestHash: { type: String, required: true },
    UserId: { type: String, required: true },
    Action: { type: String, enum: ["buy", "sell"], required: true },
    Asset: { type: String, enum: ["USD", "BTC"], required: true },
    AssetUnits: { type: Number, required: true, min: 1 },
    AssetScale: { type: Number, required: true, min: 1 },
    RateMinor: { type: Number, required: true, min: 1 },
    RateScale: { type: Number, required: true, min: 1 },
    MxnAmountCents: { type: Number, required: true, min: 1 },
    MarketDate: { type: String, required: true },
    ExpiresAt: { type: Date, required: true },
    UsedOperationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EconomyOperation",
      default: null,
    },
  },
  {
    timestamps: { createdAt: "CreatedAt", updatedAt: "UpdatedAt" },
    collection: "fxquotes",
    autoIndex: false,
  },
);

schema.index(
  { GuildId: 1, QuoteId: 1 },
  { unique: true, name: "fx_quote_identity" },
);
schema.index({ ExpiresAt: 1 }, { name: "fx_quote_expiration_lookup" });

module.exports = webConn.models.FxQuote || webConn.model("FxQuote", schema);
