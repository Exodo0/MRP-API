const mongoose = require("mongoose");
const webConn = require("../dbWebConn");

const GulagUserSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true },
    UserId: { type: String, required: true },
    Activo: { type: Boolean, default: false },
    FechaExpira: { type: Date, required: true },
  },
  {
    timestamps: true,
    collection: "gulagusers",
  }
);

GulagUserSchema.index({ GuildId: 1, UserId: 1 }, { unique: true });
GulagUserSchema.index({ GuildId: 1, Activo: 1, FechaExpira: 1 });

module.exports = webConn.model("GulagUser", GulagUserSchema);
