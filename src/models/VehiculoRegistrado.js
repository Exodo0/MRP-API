const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const VehiculoRegistradoSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true },
    UserId: { type: String, required: true },
    ItemId: { type: String, required: true },
    ItemNombre: { type: String, required: true },
    Matricula: { type: String, required: true },
    MatriculaNormalized: { type: String, required: true },
    RobloxUsername: { type: String, required: true },
    OwnerDiscordUsername: { type: String, required: true },
    ColorPintura: { type: String, required: true },
    ColorCategoria: {
      type: String,
      enum: ["REGULAR", "PREMIUM"],
      default: "REGULAR",
    },
    PlacaPersonalizada: { type: Boolean, default: false },
    EconomyOperationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EconomyOperation",
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "vehiculos_registrados",
  },
);

VehiculoRegistradoSchema.index(
  { GuildId: 1, MatriculaNormalized: 1 },
  { unique: true },
);
VehiculoRegistradoSchema.index({ GuildId: 1, UserId: 1, ItemId: 1 });
VehiculoRegistradoSchema.index({ GuildId: 1, UserId: 1, createdAt: -1 });
VehiculoRegistradoSchema.index(
  { GuildId: 1, EconomyOperationId: 1 },
  { unique: true, sparse: true },
);

module.exports = webConn.model("VehiculoRegistrado", VehiculoRegistradoSchema);
