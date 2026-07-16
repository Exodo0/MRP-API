const mongoose = require("mongoose");
const webConn = require("../dbWebConn"); // DB MXRP

const EconomyUserSchema = new mongoose.Schema(
  {
    GuildId: { type: String, required: true },
    UserId: { type: String, required: true },

    // ── Cuentas bancarias ────────────────────────────────
    CuentaSalario: {
      Balance: { type: Number, default: 0, min: 0 },
      Activa: { type: Boolean, default: true },
    },
    CuentaCorriente: {
      Balance: { type: Number, default: 0, min: 0 },
      Activa: { type: Boolean, default: true },
    },

    // ── Dinero físico / negro ────────────────────────────
    Efectivo: { type: Number, default: 0, min: 0 },
    DineroNegro: { type: Number, default: 0, min: 0 },

    // ── Deuda ────────────────────────────────────────────
    Deuda: { type: Number, default: 0, min: 0 },

    // ── Divisas ──────────────────────────────────────────
    Divisas: {
      USD: { type: Number, default: 0, min: 0 },
      BTC: { type: Number, default: 0, min: 0 },
    },
    DivisasUnits: {
      USD: { type: Number, min: 0 },
      BTC: { type: Number, min: 0 },
    },
    FxControl: {
      DayKey: { type: String, default: null },
      TotalMxn: { type: Number, default: 0, min: 0 },
      USDMxn: { type: Number, default: 0, min: 0 },
      BTCMxn: { type: Number, default: 0, min: 0 },
      TotalMxnCents: { type: Number, default: 0, min: 0 },
      USDMxnCents: { type: Number, default: 0, min: 0 },
      BTCMxnCents: { type: Number, default: 0, min: 0 },
      TransactionCount: { type: Number, default: 0, min: 0 },
      LastTradeAt: { type: Date, default: null },
    },

    // ── SAT (cuenta recaudadora del gobierno) ────────────
    Sat: { type: Boolean, default: false },

    // ── Control de cobro de salario ──────────────────────
    LastCobro: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "economyusers", // Forzamos el nombre de la colección por si Mongoose lo está pluralizando raro.
  },
);

// Índice compuesto — búsqueda por guild + usuario en O(1)
EconomyUserSchema.index({ GuildId: 1, UserId: 1 }, { unique: true });

// Índice para el leaderboard
EconomyUserSchema.index({ GuildId: 1, "CuentaSalario.Balance": -1 });

module.exports = webConn.model("EconomyUser", EconomyUserSchema);
