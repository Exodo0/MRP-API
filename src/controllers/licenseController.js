const { GUILD_ID } = require("../config");
const Ine = require("../models/Ine");
const Pasaporte = require("../models/Pasaporte");
const SemoviLicense = require("../models/SemoviLicense");
const Verificado = require("../models/Verificado");
const logger = require("../logger");

const getGuildId = () => process.env.GUILD_ID || GUILD_ID;

async function getIdentityData(guildId, userId) {
  const [verified, ine, passport] = await Promise.all([
    Verificado.findOne({ GuildId: guildId, UserId: userId, Activo: true })
      .sort({ FechaVerificacion: -1 })
      .lean(),
    Ine.findOne({ GuildId: guildId, UserId: userId })
      .sort({ createdAt: -1 })
      .lean(),
    Pasaporte.findOne({ GuildId: guildId, UserId: userId })
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  const document = ine || passport;
  if (!document) return null;
  return {
    discordId: userId,
    roblox: {
      id: verified?.RobloxId ?? null,
      username: verified?.RobloxUsername ?? document.RobloxName ?? null,
      verified: Boolean(verified),
    },
    identity: {
      documentType: ine ? "ine" : "pasaporte",
      nombres: document.Nombre,
      apellidos: document.Apellido,
      nacionalidad: ine ? "MEXICANA" : passport.Pais || null,
      curp: document.Curp ?? null,
    },
  };
}

function serializeLicense(license) {
  if (!license) return null;
  return {
    id: String(license._id),
    active: Boolean(license.Active),
    type: license.Type,
    number: license.Number,
    issuedAt: license.IssuedAt,
    expiresAt: license.ExpiresAt,
    price: license.Price ?? 0,
    priceCents: license.PriceCents ?? null,
    paymentStatus: license.PaymentStatus,
    deliveryStatus: license.RoleEffect?.Status ?? "not_required",
    debtId: license.DebtId ? String(license.DebtId) : null,
  };
}

async function getIdentity(req, res) {
  const { userId } = req.params;
  try {
    const identity = await getIdentityData(getGuildId(), userId);
    if (!identity)
      return res
        .status(404)
        .json({ error: "Identity document not found for user." });
    return res.json(identity);
  } catch (error) {
    logger.error({ name: error?.name }, "getIdentity error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getDigitalLicense(req, res) {
  const { userId } = req.params;
  const guildId = getGuildId();
  try {
    const [identity, license] = await Promise.all([
      getIdentityData(guildId, userId),
      SemoviLicense.findOne({
        GuildId: guildId,
        UserId: userId,
        Active: true,
        ExpiresAt: { $gt: new Date() },
      })
        .sort({ IssuedAt: -1 })
        .lean(),
    ]);
    if (!identity)
      return res
        .status(404)
        .json({ error: "Identity document not found for user." });
    return res.json({ ...identity, license: serializeLicense(license) });
  } catch (error) {
    logger.error({ name: error?.name }, "getDigitalLicense error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  getDigitalLicense,
  getIdentity,
  getIdentityData,
  serializeLicense,
};
