const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const MultaVehiculoSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true },
    Matricula: { type: String },
    MatriculaNormalized: { type: String },
    Motivo: { type: String },
    Monto: { type: Number, default: 0 },
    Estado: { type: String, default: "pendiente" },
    FechaMulta: { type: Date, default: Date.now },
    FechaPago: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "vehiculos_multas",
  }
);

MultaVehiculoSchema.index({ GuildId: 1, MatriculaNormalized: 1, FechaMulta: -1 });
MultaVehiculoSchema.index({ GuildId: 1, MatriculaNormalized: 1, createdAt: -1 });

module.exports = webConn.model("MultaVehiculo", MultaVehiculoSchema);
