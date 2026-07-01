const ticketConn = require("../dbTicket");

const ticketSetupSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true, unique: true },
    LogId: { type: String, default: null },
    Soporte: { type: String, default: null },
    Reportes: { type: String, default: null },
    Ban: { type: String, default: null },
    Dudas: { type: String, default: null },
    Sugerencias: { type: String, default: null },
    Agradecimientos: { type: String, default: null },
    Bug: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: "ticketsetupmxrps",
  }
);

module.exports = ticketConn.model("TicketSetup", ticketSetupSchema);
