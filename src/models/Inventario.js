const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const InventarioEntrySchema = new mongoose.Schema(
  {
    ItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true,
    },
    NombreSnapshot: { type: String, required: true },
    CategoriaSnapshot: { type: String, required: true },
    PrecioSnapshot: { type: Number, required: true },
    PrecioSnapshotCents: { type: Number, min: 0 },
    Cantidad: { type: Number, required: true, min: 1 },
    FechaAdquisicion: { type: Date, default: Date.now },
  },
  { _id: false },
);

const InventarioSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true },
    UserId: { type: String, required: true },
    Items: { type: [InventarioEntrySchema], default: [] },
    UltimaActualizacion: { type: Date, default: Date.now },
    Revision: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    collection: "inventarios",
  },
);

InventarioSchema.index({ GuildId: 1, UserId: 1 }, { unique: true });
InventarioSchema.index({ GuildId: 1, "Items.ItemId": 1 });

module.exports = webConn.model("Inventario", InventarioSchema);
