const { ROLES, GUILD_ID } = require("../config.js");
const Joi = require("joi");
const logger = require("../logger");
const webConn = require("../dbWebConn"); // Usamos webConn para las transacciones de economía
const EconomyUser = require("../models/EconomyUser");

const schema = Joi.object({
  userId: Joi.string().required(),
  license: Joi.string()
    .valid(...Object.keys(ROLES))
    .required(),
  action: Joi.string().valid("add", "remove").required(),
  costo: Joi.number().min(0).default(0), // El costo es opcional, 0 por defecto
});

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

module.exports = { updateLicense };
