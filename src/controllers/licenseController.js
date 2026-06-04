const { ROLES, GUILD_ID } = require("../config.js");
const Joi = require("joi");
const logger = require("../logger");
const webConn = require("../dbWebConn"); // Usamos webConn para las transacciones de economía
const EconomyUser = require("../models/EconomyUser");
const Verificado = require("../models/Verificado");
const Ine = require("../models/Ine");
const Pasaporte = require("../models/Pasaporte");
const SemoviLicense = require("../models/SemoviLicense");
const Debt = require("../models/Debt");

const schema = Joi.object({
  userId: Joi.string().required(),
  license: Joi.string()
    .valid(...Object.keys(ROLES))
    .required(),
  action: Joi.string().valid("add", "remove").required(),
  costo: Joi.number().min(0).default(0), // El costo es opcional, 0 por defecto
});

const issueSchema = Joi.object({
  userId: Joi.string().required(),
  type: Joi.string().trim().max(32).required(),
  price: Joi.number().min(0).default(0),
  paymentMode: Joi.string().valid("free", "paid", "debt").default("free"),
  expiresInDays: Joi.number().integer().min(1).max(3650).default(365),
  number: Joi.string().trim().max(32).optional(),
});

const getGuildId = () => process.env.GUILD_ID || GUILD_ID;

const getIdentityData = async (guildId, userId) => {
  const [verificado, ine, pasaporte] = await Promise.all([
    Verificado.findOne({ GuildId: guildId, UserId: userId, Activo: true })
      .sort({ FechaVerificacion: -1 })
      .lean(),
    Ine.findOne({ GuildId: guildId, UserId: userId }).sort({ createdAt: -1 }).lean(),
    Pasaporte.findOne({ GuildId: guildId, UserId: userId }).sort({ createdAt: -1 }).lean(),
  ]);

  const document = ine || pasaporte;
  if (!document) return null;

  const documentType = ine ? "ine" : "pasaporte";
  const nacionalidad = ine ? "MEXICANA" : pasaporte.Pais || null;

  return {
    discordId: userId,
    roblox: {
      id: verificado?.RobloxId ?? null,
      username: verificado?.RobloxUsername ?? document.RobloxName ?? null,
      verified: Boolean(verificado),
    },
    identity: {
      documentType,
      nombres: document.Nombre,
      apellidos: document.Apellido,
      nacionalidad,
      curp: document.Curp ?? null,
    },
  };
};

const generateLicenseNumber = (type) => {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replaceAll("-", "");
  const random = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
  return `SEMOVI-${String(type).toUpperCase()}-${ymd}-${random}`;
};

const serializeLicense = (license) => {
  if (!license) return null;

  return {
    id: String(license._id),
    active: Boolean(license.Active),
    type: license.Type,
    number: license.Number,
    issuedAt: license.IssuedAt,
    expiresAt: license.ExpiresAt,
    price: license.Price ?? 0,
    paymentStatus: license.PaymentStatus,
    debtId: license.DebtId ? String(license.DebtId) : null,
  };
};

const applyPaidCharge = async ({ session, guildId, userId, amount }) => {
  const semoviId = process.env.SEMOVI_ID;
  const satId = process.env.SAT_ID;

  if (!semoviId || !satId) {
    const err = new Error("SEMOVI_ID or SAT_ID is not set");
    err.statusCode = 500;
    throw err;
  }

  const buyer = await EconomyUser.findOne({ GuildId: guildId, UserId: userId }).session(session);
  if (!buyer) {
    const err = new Error("Economy user not found. Cannot process payment.");
    err.statusCode = 404;
    throw err;
  }

  let remainingCost = amount;

  if (buyer.Efectivo >= remainingCost) {
    buyer.Efectivo -= remainingCost;
    remainingCost = 0;
  } else if (buyer.Efectivo > 0) {
    remainingCost -= buyer.Efectivo;
    buyer.Efectivo = 0;
  }

  if (remainingCost > 0 && buyer.CuentaCorriente.Balance >= remainingCost) {
    buyer.CuentaCorriente.Balance -= remainingCost;
    remainingCost = 0;
  } else if (remainingCost > 0 && buyer.CuentaCorriente.Balance > 0) {
    remainingCost -= buyer.CuentaCorriente.Balance;
    buyer.CuentaCorriente.Balance = 0;
  }

  if (remainingCost > 0 && buyer.CuentaSalario.Balance >= remainingCost) {
    buyer.CuentaSalario.Balance -= remainingCost;
    remainingCost = 0;
  } else if (remainingCost > 0 && buyer.CuentaSalario.Balance > 0) {
    remainingCost -= buyer.CuentaSalario.Balance;
    buyer.CuentaSalario.Balance = 0;
  }

  if (remainingCost > 0) {
    const err = new Error("Insufficient funds across all valid accounts.");
    err.statusCode = 400;
    throw err;
  }

  await buyer.save({ session });
  await distributeGovernmentIncome({ session, guildId, amount });
};

const distributeGovernmentIncome = async ({ session, guildId, amount }) => {
  const semoviId = process.env.SEMOVI_ID;
  const satId = process.env.SAT_ID;

  if (!semoviId || !satId) {
    const err = new Error("SEMOVI_ID or SAT_ID is not set");
    err.statusCode = 500;
    throw err;
  }

  const iva = Math.round(amount * 0.16);
  const semoviIncome = amount - iva;

  await EconomyUser.findOneAndUpdate(
    { GuildId: guildId, UserId: satId },
    { $inc: { Efectivo: iva }, $setOnInsert: { Sat: true } },
    { new: true, upsert: true, session },
  );

  await EconomyUser.findOneAndUpdate(
    { GuildId: guildId, UserId: semoviId },
    { $inc: { Efectivo: semoviIncome } },
    { new: true, upsert: true, session },
  );

  return { iva, semoviIncome };
};

const getIdentity = async (req, res) => {
  const { userId } = req.params;
  const guildId = getGuildId();

  try {
    const identity = await getIdentityData(guildId, userId);
    if (!identity) {
      return res.status(404).json({ error: "Identity document not found for user." });
    }

    return res.json(identity);
  } catch (err) {
    logger.error({ err, userId }, "getIdentity error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const getDigitalLicense = async (req, res) => {
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

    if (!identity) {
      return res.status(404).json({ error: "Identity document not found for user." });
    }

    return res.json({
      ...identity,
      license: serializeLicense(license),
    });
  } catch (err) {
    logger.error({ err, userId }, "getDigitalLicense error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const issueDigitalLicense = async (req, res) => {
  const { error, value } = issueSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const { userId, type, price, paymentMode, expiresInDays } = value;
  const guildId = getGuildId();

  if (paymentMode === "free" && price > 0) {
    return res.status(400).json({ error: "paymentMode free requires price 0." });
  }

  if ((paymentMode === "paid" || paymentMode === "debt") && price <= 0) {
    return res.status(400).json({ error: "paid or debt licenses require price greater than 0." });
  }

  const session = await webConn.startSession();
  session.startTransaction();

  try {
    const identity = await getIdentityData(guildId, userId);
    if (!identity) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Identity document not found for user." });
    }

    await SemoviLicense.updateMany(
      { GuildId: guildId, UserId: userId, Active: true },
      { $set: { Active: false, CancelledAt: new Date() } },
      { session },
    );

    let debt = null;
    if (paymentMode === "paid") {
      await applyPaidCharge({ session, guildId, userId, amount: price });
    }

    if (paymentMode === "debt") {
      debt = await Debt.create(
        [
          {
            GuildId: guildId,
            UserId: userId,
            Institution: "SEMOVI",
            Concept: `Licencia de conducir tipo ${type}`,
            Amount: price,
            PaidAmount: 0,
            Status: "pending",
            Metadata: { type },
            CreatedBy: req.apiKeyOwner ?? null,
          },
        ],
        { session },
      ).then((docs) => docs[0]);

      await EconomyUser.findOneAndUpdate(
        { GuildId: guildId, UserId: userId },
        {
          $inc: { Deuda: price },
          $setOnInsert: { GuildId: guildId, UserId: userId },
        },
        { new: true, upsert: true, session },
      );

      await distributeGovernmentIncome({ session, guildId, amount: price });
    }

    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt);
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const license = await SemoviLicense.create(
      [
        {
          GuildId: guildId,
          UserId: userId,
          Type: type,
          Number: value.number || generateLicenseNumber(type),
          IssuedAt: issuedAt,
          ExpiresAt: expiresAt,
          Active: true,
          Price: price,
          PaymentStatus: paymentMode,
          DebtId: debt?._id ?? null,
          CreatedBy: req.apiKeyOwner ?? null,
        },
      ],
      { session },
    ).then((docs) => docs[0]);

    await session.commitTransaction();
    session.endSession();

    logger.info(
      { userId, type, price, paymentMode, owner: req.apiKeyOwner },
      "SEMOVI digital license issued",
    );

    return res.status(201).json({
      ...identity,
      license: serializeLicense(license),
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    logger.error({ err, userId, type, price, paymentMode }, "issueDigitalLicense error");
    return res.status(err.statusCode || 500).json({
      error: err.statusCode ? err.message : "Internal Server Error",
    });
  }
};

const updateLicense = async (req, res) => {
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const { userId, license, action, costo } = value;
  const roleId = ROLES[license];

  if (!roleId) {
    return res
      .status(400)
      .json({ error: `License role "${license}" not found in configuration.` });
  }

  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    logger.error("DISCORD_TOKEN is not set");
    return res
      .status(500)
      .json({ error: "Server misconfiguration: DISCORD_TOKEN not set." });
  }

  const semoviId = process.env.SEMOVI_ID;
  const satId = process.env.SAT_ID;

  if (action === "add" && costo > 0 && (!semoviId || !satId)) {
    logger.error("SEMOVI_ID or SAT_ID is not set in environment variables");
    return res
      .status(500)
      .json({ error: "Server misconfiguration: Government accounts not set." });
  }

  // Si la accion es add y el costo es > 0, iniciamos transaccion
  let session = null;
  let paymentProcessed = false;

  if (action === "add" && costo > 0) {
    // Usamos webConn en lugar de mongoose global porque la colección está en esa base de datos
    session = await webConn.startSession();
    session.startTransaction();

    try {
      // 1. Buscar al usuario comprador
      // Quitamos el filtro por GUILD_ID para asegurar que encuentre al usuario independientemente del servidor
      const buyer = await EconomyUser.findOne({ UserId: userId }).session(
        session,
      );

      console.log(`Buscando usuario ${userId}... Encontrado:`, buyer !== null);

      if (!buyer) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(404)
          .json({ error: "Economy user not found. Cannot process payment." });
      }

      // 2. Lógica de cobro en cascada (Efectivo -> Corriente -> Salario)
      let remainingCost = costo;

      // 2.1 Intentar de Efectivo
      if (buyer.Efectivo >= remainingCost) {
        buyer.Efectivo -= remainingCost;
        remainingCost = 0;
      } else if (buyer.Efectivo > 0) {
        remainingCost -= buyer.Efectivo;
        buyer.Efectivo = 0;
      }

      // 2.2 Intentar de Cuenta Corriente
      if (remainingCost > 0 && buyer.CuentaCorriente.Balance >= remainingCost) {
        buyer.CuentaCorriente.Balance -= remainingCost;
        remainingCost = 0;
      } else if (remainingCost > 0 && buyer.CuentaCorriente.Balance > 0) {
        remainingCost -= buyer.CuentaCorriente.Balance;
        buyer.CuentaCorriente.Balance = 0;
      }

      // 2.3 Intentar de Cuenta Salario
      if (remainingCost > 0 && buyer.CuentaSalario.Balance >= remainingCost) {
        buyer.CuentaSalario.Balance -= remainingCost;
        remainingCost = 0;
      } else if (remainingCost > 0 && buyer.CuentaSalario.Balance > 0) {
        remainingCost -= buyer.CuentaSalario.Balance;
        buyer.CuentaSalario.Balance = 0;
      }

      // Si aún queda costo por cubrir, fondos insuficientes
      if (remainingCost > 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          error:
            "Insufficient funds across all valid accounts (Efectivo, Corriente, Salario).",
        });
      }

      await buyer.save({ session });

      // 3. Distribución del dinero (16% SAT, 84% SEMOVI)
      const iva = Math.round(costo * 0.16);
      const semoviIncome = costo - iva;

      // 3.1 Pagar al SAT
      const satAccount = await EconomyUser.findOneAndUpdate(
        { GuildId: GUILD_ID, UserId: satId },
        { $inc: { Efectivo: iva }, $setOnInsert: { Sat: true } },
        { new: true, upsert: true, session },
      );

      // 3.2 Pagar a SEMOVI
      const semoviAccount = await EconomyUser.findOneAndUpdate(
        { GuildId: GUILD_ID, UserId: semoviId },
        { $inc: { Efectivo: semoviIncome } },
        { new: true, upsert: true, session },
      );

      await session.commitTransaction();
      session.endSession();
      paymentProcessed = true;
      logger.info(
        { userId, costo, iva, semoviIncome },
        "Payment processed successfully for license",
      );
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      logger.error(
        { err, userId, costo },
        "Error processing payment transaction",
      );
      return res
        .status(500)
        .json({ error: "Internal Server Error while processing payment." });
    }
  }

  const url = `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}/roles/${roleId}`;
  const method = action === "add" ? "PUT" : "DELETE";

  try {
    const discordRes = await fetch(url, {
      method,
      headers: {
        Authorization: `Bot ${token}`,
      },
    });

    if (discordRes.ok) {
      logger.info(
        { userId, license, action, owner: req.apiKeyOwner },
        "License role updated",
      );
      return res.status(200).json({
        message: `Role ${license} ${action === "add" ? "added to" : "removed from"} user ${userId}.`,
        paymentProcessed: paymentProcessed,
        costo: paymentProcessed ? costo : 0,
      });
    }

    // Si Discord falla y ya cobramos, necesitamos revertir el cobro
    if (paymentProcessed) {
      logger.warn(
        { userId, costo },
        "Discord API failed after payment. Attempting manual rollback...",
      );
      try {
        const rollbackSession = await webConn.startSession();
        rollbackSession.startTransaction();

        const iva = Math.round(costo * 0.16);
        const semoviIncome = costo - iva;

        // 1. Quitar al SAT
        await EconomyUser.findOneAndUpdate(
          { GuildId: GUILD_ID, UserId: satId },
          { $inc: { Efectivo: -iva } },
          { session: rollbackSession },
        );

        // 2. Quitar a SEMOVI
        await EconomyUser.findOneAndUpdate(
          { GuildId: GUILD_ID, UserId: semoviId },
          { $inc: { Efectivo: -semoviIncome } },
          { session: rollbackSession },
        );

        // 3. Devolver al comprador (al Efectivo para simplificar y asegurar que lo recupere)
        await EconomyUser.findOneAndUpdate(
          { GuildId: GUILD_ID, UserId: userId },
          { $inc: { Efectivo: costo } },
          { session: rollbackSession },
        );

        await rollbackSession.commitTransaction();
        rollbackSession.endSession();
        logger.info(
          { userId, costo },
          "Payment rollback completed successfully.",
        );
      } catch (rollbackErr) {
        logger.fatal(
          { rollbackErr, userId, costo },
          "CRITICAL: Failed to rollback payment after Discord API error.",
        );
      }
    }

    if (discordRes.status === 404) {
      return res
        .status(404)
        .json({ error: "User or Role not found in the Discord server." });
    }

    if (discordRes.status === 403) {
      logger.error(
        { userId, roleId, status: discordRes.status },
        "Discord API forbidden: Bot lacks permissions or hierarchy is incorrect.",
      );
      return res
        .status(500)
        .json({ error: "Bot lacks permissions to manage roles." });
    }

    const errorData = await discordRes.json().catch(() => ({}));
    logger.error(
      { err: errorData, status: discordRes.status, userId, license, action },
      "Discord API error",
    );
    return res
      .status(500)
      .json({ error: "Internal Server Error processing Discord request." });
  } catch (err) {
    logger.error(
      { err, userId, license, action },
      "Error updating license role via HTTP",
    );
    return res
      .status(500)
      .json({ error: "Internal Server Error processing Discord request." });
  }
};

module.exports = {
  getIdentity,
  getDigitalLicense,
  issueDigitalLicense,
  updateLicense,
};
