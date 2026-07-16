const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const schema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true, immutable: true },
    OperationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EconomyOperation",
      required: true,
      immutable: true,
    },
    Sequence: { type: Number, required: true, min: 0, immutable: true },
    AccountId: { type: String, required: true, immutable: true },
    AccountType: { type: String, required: true, immutable: true },
    Direction: {
      type: String,
      enum: ["debit", "credit"],
      required: true,
      immutable: true,
    },
    AmountCents: { type: Number, required: true, min: 1, immutable: true },
    BalanceBeforeCents: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
    },
    BalanceAfterCents: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
    },
    Reason: { type: String, required: true, maxlength: 200, immutable: true },
    MonetaryVersion: {
      type: Number,
      default: 2,
      required: true,
      immutable: true,
    },
    CreatedAt: {
      type: Date,
      default: Date.now,
      required: true,
      immutable: true,
    },
  },
  { versionKey: false, collection: "economyledgerentries", autoIndex: false },
);

schema.index(
  { OperationId: 1, Sequence: 1 },
  { unique: true, name: "economy_ledger_operation_sequence" },
);
schema.index(
  { GuildId: 1, AccountId: 1, CreatedAt: -1 },
  { name: "economy_ledger_account_history" },
);

function rejectMutation() {
  throw new Error("Las entradas confirmadas del ledger son inmutables");
}

schema.pre(
  [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "findOneAndReplace",
    "replaceOne",
    "deleteOne",
    "deleteMany",
  ],
  rejectMutation,
);
schema.pre("save", function rejectExistingSave() {
  if (!this.isNew) rejectMutation();
});

module.exports =
  webConn.models.EconomyLedgerEntry ||
  webConn.model("EconomyLedgerEntry", schema);
