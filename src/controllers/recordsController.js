const Joi = require("joi");
const logger = require("../logger");
const Multa = require("../models/Multa");
const Arresto = require("../models/Arresto");
const Antecedente = require("../models/Antecedente");

const GUILD_ID = "1193021133981765632";

// ── Schemas ──────────────────────────────────────────────────────────────────

const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildPagination(total, page, limit) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

function parseQuery(query) {
  const { error, value } = paginationSchema.validate(query);
  if (error) throw new Error(error.message);
  return value;
}

// ── Controllers ──────────────────────────────────────────────────────────────

const getUserMultas = async (req, res) => {
  const { userId } = req.params;

  try {
    const { page, limit } = parseQuery(req.query);
    const skip = (page - 1) * limit;

    const [multas, total] = await Promise.all([
      Multa.find({ GuildId: GUILD_ID, UserId: userId })
        .sort({ FechaMulta: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Multa.countDocuments({ GuildId: GUILD_ID, UserId: userId }),
    ]);

    return res.json({
      userId,
      guildId: GUILD_ID,
      multas,
      pagination: buildPagination(total, page, limit),
    });
  } catch (err) {
    if (err.message.includes("validation")) {
      return res.status(400).json({ error: err.message });
    }
    logger.error({ err, userId }, "getUserMultas error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const getUserArrestos = async (req, res) => {
  const { userId } = req.params;

  try {
    const { page, limit } = parseQuery(req.query);
    const skip = (page - 1) * limit;

    const [arrestos, total] = await Promise.all([
      Arresto.find({ GuildId: GUILD_ID, UserId: userId })
        .sort({ FechaArresto: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Arresto.countDocuments({ GuildId: GUILD_ID, UserId: userId }),
    ]);

    return res.json({
      userId,
      guildId: GUILD_ID,
      arrestos,
      pagination: buildPagination(total, page, limit),
    });
  } catch (err) {
    if (err.message.includes("validation")) {
      return res.status(400).json({ error: err.message });
    }
    logger.error({ err, userId }, "getUserArrestos error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const getUserAntecedentes = async (req, res) => {
  const { userId } = req.params;

  try {
    const { page, limit } = parseQuery(req.query);
    const skip = (page - 1) * limit;

    const [antecedentes, total] = await Promise.all([
      Antecedente.find({ GuildId: GUILD_ID, UserId: userId })
        .select("-Canal -_id -__v -GuildId")
        .sort({ FechaArresto: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Antecedente.countDocuments({ GuildId: GUILD_ID, UserId: userId }),
    ]);

    return res.json({
      userId,
      guildId: GUILD_ID,
      antecedentes,
      pagination: buildPagination(total, page, limit),
    });
  } catch (err) {
    if (err.message.includes("validation")) {
      return res.status(400).json({ error: err.message });
    }
    logger.error({ err, userId }, "getUserAntecedentes error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const getUserRecord = async (req, res) => {
  const { userId } = req.params;

  try {
    const [multasCount, arrestosCount, antecedentesCount, recentMultas, recentArrestos, recentAntecedentes] =
      await Promise.all([
        Multa.countDocuments({ GuildId: GUILD_ID, UserId: userId }),
        Arresto.countDocuments({ GuildId: GUILD_ID, UserId: userId }),
        Antecedente.countDocuments({ GuildId: GUILD_ID, UserId: userId }),
        Multa.find({ GuildId: GUILD_ID, UserId: userId }).sort({ FechaMulta: -1 }).limit(5).lean(),
        Arresto.find({ GuildId: GUILD_ID, UserId: userId }).sort({ FechaArresto: -1 }).limit(5).lean(),
        Antecedente.find({ GuildId: GUILD_ID, UserId: userId }).select("-Canal -_id -__v -GuildId").sort({ FechaArresto: -1 }).limit(5).lean(),
      ]);

    return res.json({
      userId,
      guildId: GUILD_ID,
      counts: {
        multas: multasCount,
        arrestos: arrestosCount,
        antecedentes: antecedentesCount,
      },
      recentMultas,
      recentArrestos,
      recentAntecedentes,
    });
  } catch (err) {
    logger.error({ err, userId }, "getUserRecord error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  getUserMultas,
  getUserArrestos,
  getUserAntecedentes,
  getUserRecord,
};
