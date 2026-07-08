const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const MultaSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true },
    UserId: { type: String, required: true },
    Razon: { type: String, required: true },
    Cantidad: { type: Number, default: 0, min: 0 },
    AplicadoPor: { type: String, default: "" },
    FechaMulta: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    collection: "multas",
  }
);

MultaSchema.index({ GuildId: 1, UserId: 1 });
MultaSchema.index({ GuildId: 1, UserId: 1, FechaMulta: -1 });

module.exports = webConn.model("Multa", MultaSchema);
