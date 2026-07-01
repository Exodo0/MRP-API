const mongoose = require("mongoose");
const ticketConn = require("../dbTicket");

const ticketSchema = new mongoose.Schema(
  {
    TicketId: { type: String, required: true, index: true },
    ChannelId: { type: String, index: true },
    Estado: { type: String, enum: ["abierto", "cerrado"], default: "abierto", index: true },
    StaffAsignado: { type: String, default: null, index: true },
    CreadorId: { type: String, index: true },
    Categoria: { type: String, default: null },
    Number: { type: Number, default: null },
    CerradoPor: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: "ticketsmxrps",
  }
);

ticketSchema.index({ Estado: 1, createdAt: -1 });
ticketSchema.index({ StaffAsignado: 1, Estado: 1 });
ticketSchema.index({ CreadorId: 1, createdAt: -1 });

module.exports = ticketConn.model("Ticket", ticketSchema);
