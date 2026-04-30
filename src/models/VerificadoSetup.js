const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const VerificadoSetupSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true, unique: true },
    CanalVerificacion: { type: String, default: null },
    RolCiudadano: { type: String, default: null },
    RolIndocumentado: { type: String, default: null },
    RolEstadoCiudadano: { type: String, default: null },
    RolUnverify: { type: String, default: null },
    RolWhiteList: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: "verificadosetups",
  }
);

module.exports = webConn.model("VerificadoSetup", VerificadoSetupSchema);
