const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const PasaporteSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true, index: true },
    UserId: { type: String, required: true, index: true },
    RobloxName: { type: String, required: true },
    Nombre: { type: String, required: true },
    Apellido: { type: String, required: true },
    Edad: { type: Number },
    Pais: { type: String },
    FechaNacimiento: { type: String },
    FechaExpedicion: { type: String },
    FechaExpiracion: { type: String },
    Curp: { type: String },
    NumeroPasaporte: { type: String },
    Sexo: { type: String },
    ImageURL: { type: String },
    Number: { type: Number },
    Creada: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    collection: "pasaportes",
  },
);

PasaporteSchema.index({ GuildId: 1, UserId: 1 });

module.exports = webConn.model("Pasaporte", PasaporteSchema);
