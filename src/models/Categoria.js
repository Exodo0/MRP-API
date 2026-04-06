const mongoose = require("mongoose");
const webConn  = require("../dbWebConn");

const CategoriaSchema = new mongoose.Schema(
  {
    GuildId:     { type: String, required: true },
    Nombre:      { type: String, required: true },
    Descripcion: { type: String, default: "" },
    Emoji:       { type: String, default: "🛒" },
    Orden:       { type: Number, default: 0 },
    Activa:      { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = webConn.model("Categoria", CategoriaSchema);
