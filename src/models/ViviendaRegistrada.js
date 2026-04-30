const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const StoredItemSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true },
    nombre: { type: String, required: true },
    cantidad: { type: Number, default: 1 },
    imagenURL: { type: String, default: null },
  },
  { _id: false }
);

const StoredVehicleSchema = new mongoose.Schema(
  {
    registroId: { type: String, required: true },
    plate: { type: String, required: true },
    itemName: { type: String, required: true },
    imagenURL: { type: String, default: null },
  },
  { _id: false }
);

const ViviendaRegistradaSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true },
    UserId: { type: String, required: true },
    ItemId: { type: String, required: true },
    ItemNombre: { type: String, required: true },
    MaxItems: { type: Number, default: 0 },
    MaxVehicles: { type: Number, default: 0 },
    Calle: { type: String, required: true },
    NumeroExterior: { type: String, required: true },
    CodigoPostal: { type: String, required: true },
    ColorFachada: { type: String, required: true },
    RobloxUsername: { type: String, required: true },
    OwnerDiscordUsername: { type: String, required: true },
    StoredItems: { type: [StoredItemSchema], default: [] },
    StoredVehicles: { type: [StoredVehicleSchema], default: [] },
  },
  {
    timestamps: true,
    collection: "viviendas_registradas",
  }
);

ViviendaRegistradaSchema.index(
  { GuildId: 1, UserId: 1, ItemId: 1, NumeroExterior: 1, Calle: 1 },
  { unique: true }
);
ViviendaRegistradaSchema.index({ GuildId: 1, UserId: 1, createdAt: -1 });

module.exports = webConn.model("ViviendaRegistrada", ViviendaRegistradaSchema);
