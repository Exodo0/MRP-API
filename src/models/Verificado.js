const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const VerificadoSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true },
    UserId: { type: String, required: true },
    RobloxId: { type: String, required: true },
    RobloxUsername: { type: String, required: true },
    FechaVerificacion: { type: Date, default: Date.now },
    Activo: { type: Boolean, default: true },
    DiscordRolesStatus: {
      type: String,
      enum: ["pending", "applied", "error"],
      default: "pending",
    },
    DiscordRolesAppliedAt: { type: Date, default: null },
    DiscordRolesLastSyncAt: { type: Date, default: null },
    DiscordRolesError: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: "verificados",
  }
);

VerificadoSchema.index({ GuildId: 1, UserId: 1 }, { unique: true });
VerificadoSchema.index({ GuildId: 1, RobloxId: 1 }, { unique: true });
VerificadoSchema.index({ GuildId: 1, Activo: 1, FechaVerificacion: -1 });

module.exports = webConn.model("Verificado", VerificadoSchema);
