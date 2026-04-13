const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const AuditLogSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true, index: true },
    entityType: { type: String, required: true, enum: ["categoria", "item"], index: true },
    entityId: { type: String, required: true, index: true },
    entityName: { type: String, default: "" },
    action: {
      type: String,
      required: true,
      enum: ["create", "update", "delete", "toggle", "reorder"],
      index: true,
    },
    actor: {
      username: { type: String, default: null, index: true },
      source: { type: String, default: "unknown" },
      apiKeyOwner: { type: String, default: null },
      ip: { type: String, default: null },
    },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

module.exports = webConn.model("AuditLog", AuditLogSchema);
