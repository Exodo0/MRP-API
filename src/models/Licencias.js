const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const LicenciaEntrySchema = new mongoose.Schema(
  {
    Activa: { type: Boolean, default: false },
    FechaCompra: { type: Date, default: null },
    FechaExpiracion: { type: Date, default: null },
    NotificacionEnviada: { type: Boolean, default: false },
    NotificacionExpiradaEnviada: { type: Boolean, default: false },
  },
  { _id: false }
);

const LicenciasSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true },
    UserId: { type: String, required: true },
    Armas: { type: Map, of: LicenciaEntrySchema, default: {} },
    Manejo: { type: Map, of: LicenciaEntrySchema, default: {} },
    Colectivas: { type: Map, of: LicenciaEntrySchema, default: {} },
    Restringidas: { type: Map, of: LicenciaEntrySchema, default: {} },
  },
  {
    timestamps: true,
    collection: "licencias",
  }
);

LicenciasSchema.index({ GuildId: 1, UserId: 1 }, { unique: true });

module.exports = webConn.model("Licencias", LicenciasSchema);
