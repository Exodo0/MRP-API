const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const IneSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true, index: true },
    UserId: { type: String, required: true, index: true },
    RobloxName: { type: String, required: true },
    Nombre: { type: String, required: true },
    Apellido: { type: String, required: true },
    Edad: { type: Number },
    Estado: { type: String },
    Municipio: { type: String },
    Curp: { type: String },
    Seccion: { type: String },
    Localidad: { type: String },
    FechaNacimiento: { type: String },
    Sexo: { type: String },
    ImageURL: { type: String },
    Number: { type: Number },
    Creada: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    collection: "ines",
  },
);

IneSchema.index({ GuildId: 1, UserId: 1 });

module.exports = webConn.model("Ine", IneSchema);
