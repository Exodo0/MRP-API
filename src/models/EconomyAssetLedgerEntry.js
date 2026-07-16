const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const schema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true },
    OperationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EconomyOperation",
      required: true,
    },
    AccountId: { type: String, required: true },
    Asset: { type: String, enum: ["USD", "BTC"], required: true },
    Direction: { type: String, enum: ["debit", "credit"], required: true },
    AmountUnits: { type: Number, required: true, min: 1 },
    UnitScale: { type: Number, required: true, min: 1 },
    BalanceBeforeUnits: { type: Number, required: true, min: 0 },
    BalanceAfterUnits: { type: Number, required: true, min: 0 },
    MxnAmountCents: { type: Number, required: true, min: 1 },
    QuoteId: { type: String, required: true },
    CreatedAt: { type: Date, required: true },
  },
  { collection: "economyassetledgerentries", autoIndex: false },
);

schema.index(
  { OperationId: 1, Asset: 1 },
  { unique: true, name: "asset_ledger_operation_asset" },
);
schema.index(
  { GuildId: 1, AccountId: 1, CreatedAt: -1 },
  { name: "asset_ledger_account_history" },
);

for (const hook of [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "deleteOne",
  "deleteMany",
]) {
  schema.pre(hook, function immutableAssetLedger() {
    throw new Error("EconomyAssetLedgerEntry is immutable");
  });
}

module.exports =
  webConn.models.EconomyAssetLedgerEntry ||
  webConn.model("EconomyAssetLedgerEntry", schema);
