const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const ItemSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true },
    CategoriaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Categoria",
      required: true,
    },
    CategoriaNombre: { type: String, required: true },
    Subcategoria: { type: String, default: "" },
    Nombre: { type: String, required: true },
    Descripcion: { type: String, default: "" },
    Precio: { type: Number, required: true, min: 0 },
    Descuento: { type: Number, default: 0, min: 0, max: 100 },
    PrecioCents: { type: Number, min: 0 },
    DiscountBasisPoints: { type: Number, min: 0, max: 10000 },
    MoneyVersion: { type: Number, enum: [2] },
    Stock: { type: Number, default: -1 },
    LimitePorUsuario: { type: Number, default: 0 },
    RolId: { type: String, default: null },
    ImagenURL: { type: String, default: null },
    Activo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = webConn.model("Item", ItemSchema);
