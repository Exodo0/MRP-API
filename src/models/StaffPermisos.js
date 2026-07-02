const { mongoose } = require("../db");

const selectedRoleSchema = new mongoose.Schema(
  {
    roleId: { type: String, required: true },
    roleName: { type: String, required: true },
  },
  { _id: false },
);

const staffPermisosSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true, unique: true },
    Groups: { type: Map, of: [selectedRoleSchema], default: {} },
    PermissionsVersion: { type: Number, default: 0 },
  },
  { timestamps: true, strict: false, collection: "staffpermisos" },
);

module.exports = mongoose.models.StaffPermisos || mongoose.model("StaffPermisos", staffPermisosSchema);
