const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const ArrestoSentenciaSchema = new mongoose.Schema(
  {
    Juez: { type: String, default: null },
    Motivo: { type: String, default: null },
    Minutos: { type: Number, default: null },
    FechaInicio: { type: Date, default: null },
    FechaExpira: { type: Date, default: null },
  },
  { _id: false }
);

const ArrestoSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true },
    UserId: { type: String, required: true },
    ArrestadoPor: { type: String, required: true },
    Motivo: { type: String, required: true },
    FechaArresto: { type: Date, default: Date.now },
    FechaExpiraPreventiva: { type: Date, required: true },
    Sentencia: { type: ArrestoSentenciaSchema, default: () => ({}) },
    Estado: {
      type: String,
      enum: ["preventiva", "sentenciado", "liberado", "expirado"],
      default: "preventiva",
    },
  },
  {
    timestamps: true,
    collection: "arrestos",
  }
);

ArrestoSchema.index({ GuildId: 1, UserId: 1, Estado: 1 });
ArrestoSchema.index({ GuildId: 1, UserId: 1, FechaArresto: -1 });

module.exports = webConn.model("Arresto", ArrestoSchema);
