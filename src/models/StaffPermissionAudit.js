const { mongoose } = require("../db");

const roleSnapshotSchema = new mongoose.Schema(
  {
    roleId: { type: String, required: true },
    roleName: { type: String, required: true },
  },
  { _id: false },
);

const auditSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true, index: true },
    Group: { type: String, required: true },
    Action: { type: String, enum: ["create", "update", "delete"], default: "update" },
    Actor: { type: String, required: true },
    PreviousVersion: { type: Number, required: true },
    Version: { type: Number, required: true },
    Added: { type: [roleSnapshotSchema], default: [] },
    Removed: { type: [roleSnapshotSchema], default: [] },
  },
  { timestamps: true, collection: "staffpermissionaudits" },
);

module.exports =
  mongoose.models.StaffPermissionAudit || mongoose.model("StaffPermissionAudit", auditSchema);
