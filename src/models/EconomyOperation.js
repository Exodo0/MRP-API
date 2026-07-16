const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const STATUSES = [
  "pending",
  "processing",
  "committed",
  "failed",
  "manual_review",
];

const movementSchema = new mongoose.Schema(
  {
    AccountId: { type: String, required: true },
    AccountType: { type: String, required: true },
    OwnerUserId: { type: String, required: true },
    AmountCents: { type: Number, required: true, min: 1 },
    Reason: { type: String, required: true, maxlength: 200 },
  },
  { _id: false },
);

const effectSchema = new mongoose.Schema(
  {
    Type: { type: String, required: true },
    Payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const errorSchema = new mongoose.Schema(
  {
    Code: { type: String, default: null },
    Message: { type: String, default: null },
    At: { type: Date, default: null },
  },
  { _id: false },
);

const schema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true },
    IdempotencyKey: { type: String, required: true },
    RequestHash: { type: String, required: true },
    Type: { type: String, required: true },
    Flow: {
      type: String,
      enum: ["balanced", "source", "sink"],
      required: true,
    },
    Status: {
      type: String,
      enum: STATUSES,
      default: "pending",
      required: true,
    },
    ActorUserId: { type: String, required: true },
    MonetaryVersion: {
      type: Number,
      default: 2,
      immutable: true,
      required: true,
    },
    Metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    Debits: { type: [movementSchema], default: [] },
    Credits: { type: [movementSchema], default: [] },
    Effects: { type: [effectSchema], default: [] },
    Error: { type: errorSchema, default: null },
    Result: { type: mongoose.Schema.Types.Mixed, default: null },
    AttemptCount: { type: Number, default: 0, min: 0 },
    LeaseToken: { type: String, default: null },
    LeaseExpiresAt: { type: Date, default: null },
    CompletedAt: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: "CreatedAt", updatedAt: "UpdatedAt" },
    minimize: false,
    collection: "economyoperations",
    autoIndex: false,
  },
);

schema.index(
  { GuildId: 1, IdempotencyKey: 1 },
  { unique: true, name: "economy_operation_idempotency" },
);
schema.index(
  { Status: 1, LeaseExpiresAt: 1 },
  { name: "economy_operation_recovery" },
);
schema.index(
  { GuildId: 1, ActorUserId: 1, CreatedAt: -1 },
  { name: "economy_operation_actor_history" },
);

module.exports =
  webConn.models.EconomyOperation || webConn.model("EconomyOperation", schema);
module.exports.ECONOMY_OPERATION_STATUSES = STATUSES;
