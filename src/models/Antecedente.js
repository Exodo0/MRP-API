const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const AntecedenteSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true },
    UserId: { type: String, required: true },
    Motivo: { type: String, required: true },
    ArrestadoPor: { type: String, required: true },
    Canal: { type: String, default: "" },
    Duracion: { type: Number, default: 0 },
    Activo: { type: Boolean, default: true },
    FechaArresto: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    collection: "antecedentes",
  }
);

AntecedenteSchema.index({ GuildId: 1, UserId: 1, FechaArresto: -1 });

module.exports = webConn.model("Antecedente", AntecedenteSchema);
