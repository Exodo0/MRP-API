const mongoose = require("mongoose");
const EconomyUser = require("../models/EconomyUser");
const Licencias = require("../models/Licencias");
const Antecedente = require("../models/Antecedente");
const Arresto = require("../models/Arresto");
const GulagUser = require("../models/GulagUser");
const Verificado = require("../models/Verificado");
const VerificadoSetup = require("../models/VerificadoSetup");
const Inventario = require("../models/Inventario");
const Item = require("../models/Item");
const Categoria = require("../models/Categoria");
const VehiculoRegistrado = require("../models/VehiculoRegistrado");
const MultaVehiculo = require("../models/MultaVehiculo");
const ViviendaRegistrada = require("../models/ViviendaRegistrada");
const logger = require("../logger");

function getGuildId() {
  const id = process.env.GUILD_ID;
  if (!id) throw new Error("GUILD_ID env var is not set");
  return id;
}

/**
 * GET /v1/dashboard/me
 *
 * Devuelve todos los datos del usuario autenticado para el dashboard:
 * - Economía (saldo, efectivo, dinero negro, deuda, divisas)
 * - Licencias vigentes
 * - Arresto activo
 * - Antecedentes (últimos 5)
 * - Estado de gulag
 * - Estado de verificación
 * - Inventario
 * - Vehículos registrados
 * - Viviendas registradas
 */
async function getMe(req, res) {
  try {
    const GUILD_ID = getGuildId();
    const userId = req.dashboardUser.discordId;

    const [
      economyUser,
      licenciasDoc,
      arrestoActivo,
      antecedentes,
      gulagUser,
      verificado,
      inventarioDoc,
      vehiculos,
      viviendas,
    ] = await Promise.all([
      EconomyUser.findOne({ GuildId: GUILD_ID, UserId: userId }).lean(),
      Licencias.findOne({ GuildId: GUILD_ID, UserId: userId }).lean(),
      Arresto.findOne({
        GuildId: GUILD_ID,
        UserId: userId,
        Estado: { $in: ["preventiva", "sentenciado"] },
      })
        .sort({ FechaArresto: -1 })
        .lean(),
      Antecedente.find({ GuildId: GUILD_ID, UserId: userId })
        .sort({ FechaArresto: -1 })
        .limit(5)
        .lean(),
      GulagUser.findOne({
        GuildId: GUILD_ID,
        UserId: userId,
        Activo: true,
        FechaExpira: { $gt: new Date() },
      }).lean(),
      Verificado.findOne({
        GuildId: GUILD_ID,
        UserId: userId,
        Activo: true,
      }).lean(),
      Inventario.findOne({ GuildId: GUILD_ID, UserId: userId }).lean(),
      VehiculoRegistrado.find({ GuildId: GUILD_ID, UserId: userId })
        .sort({ createdAt: -1 })
        .lean(),
      ViviendaRegistrada.find({ GuildId: GUILD_ID, UserId: userId })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    // Procesar licencias vigentes
    const licenciasVigentes = [];
    if (licenciasDoc) {
      const ahora = new Date();
      const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
      const categorias = ["Armas", "Colectivas", "Restringidas"];

      for (const cat of categorias) {
        const mapa = licenciasDoc[cat];
        if (!mapa) continue;
        const entries = mapa instanceof Map ? Object.fromEntries(mapa) : mapa;

        for (const [codigo, entry] of Object.entries(entries)) {
          if (!entry.Activa) continue;
          const expiracion = entry.FechaExpiracion
            ? new Date(entry.FechaExpiracion)
            : null;
          if (expiracion && expiracion < ahora) continue;
          licenciasVigentes.push({
            categoria: cat,
            codigo,
            FechaExpiracion: expiracion,
            proximaAExpirar: expiracion
              ? expiracion.getTime() - ahora.getTime() < SIETE_DIAS_MS
              : false,
          });
        }
      }
    }

    // Procesar inventario con datos de items
    let inventarioItems = [];
    if (inventarioDoc?.Items?.length) {
      const itemIds = inventarioDoc.Items.map((entry) => {
        try {
          return typeof entry.ItemId === "string"
            ? new mongoose.Types.ObjectId(entry.ItemId)
            : entry.ItemId;
        } catch {
          return null;
        }
      }).filter(Boolean);

      const itemDocs = itemIds.length
        ? await Item.find({ _id: { $in: itemIds } }).lean()
        : [];

      const itemMap = Object.fromEntries(
        itemDocs.map((d) => [d._id.toString(), d])
      );

      inventarioItems = inventarioDoc.Items.map((entry) => {
        const k =
          typeof entry.ItemId === "string"
            ? entry.ItemId
            : entry.ItemId.toString();
        const itemActual = itemMap[k];
        return {
          ItemId: k,
          NombreSnapshot: entry.NombreSnapshot,
          CategoriaSnapshot: entry.CategoriaSnapshot,
          PrecioSnapshot: entry.PrecioSnapshot,
          Cantidad: entry.Cantidad,
          FechaAdquisicion: entry.FechaAdquisicion,
          NombreActual: itemActual?.Nombre ?? entry.NombreSnapshot,
          CategoriaActual:
            itemActual?.CategoriaNombre ?? entry.CategoriaSnapshot,
          ImagenURL: itemActual?.ImagenURL ?? null,
          ItemActivo: itemActual?.Activo ?? false,
        };
      });
    }

    // Procesar vehículos
    const vehiculosView = vehiculos.map((doc) => ({
      id: doc._id?.toString() ?? "",
      itemId: doc.ItemId,
      itemName: doc.ItemNombre,
      plate: doc.Matricula,
      robloxUsername: doc.RobloxUsername,
      ownerDiscordUsername: doc.OwnerDiscordUsername,
      colorPintura: doc.ColorPintura,
      colorCategoria: doc.ColorCategoria,
      placaPersonalizada: doc.PlacaPersonalizada ?? false,
      createdAt: doc.createdAt?.toISOString(),
    }));

    // Procesar viviendas
    const viviendasView = viviendas.map((doc) => ({
      id: doc._id?.toString() ?? "",
      itemId: doc.ItemId,
      itemName: doc.ItemNombre,
      calle: `${doc.Calle} #${doc.NumeroExterior}`,
      codigoPostal: doc.CodigoPostal,
      colorFachada: doc.ColorFachada,
      maxItems: doc.MaxItems,
      maxVehicles: doc.MaxVehicles,
      storedItems: doc.StoredItems ?? [],
      storedVehicles: doc.StoredVehicles ?? [],
      robloxUsername: doc.RobloxUsername,
      ownerDiscordUsername: doc.OwnerDiscordUsername,
      createdAt: doc.createdAt?.toISOString(),
    }));

    // Calcular patrimonio
    const totalBancario = economyUser
      ? (economyUser.CuentaSalario?.Balance ?? 0) +
        (economyUser.CuentaCorriente?.Balance ?? 0)
      : 0;
    const patrimonio = economyUser
      ? totalBancario +
        (economyUser.Efectivo ?? 0) -
        (economyUser.Deuda ?? 0)
      : 0;

    return res.json({
      economy: economyUser
        ? {
            cuentaSalario: economyUser.CuentaSalario,
            cuentaCorriente: economyUser.CuentaCorriente,
            efectivo: economyUser.Efectivo ?? 0,
            dineroNegro: economyUser.DineroNegro ?? 0,
            deuda: economyUser.Deuda ?? 0,
            divisas: economyUser.Divisas ?? { USD: 0, BTC: 0 },
            sat: economyUser.Sat ?? false,
            lastCobro: economyUser.LastCobro,
            patrimonio,
          }
        : null,
      licencias: {
        vigentes: licenciasVigentes,
        total: licenciasVigentes.length,
      },
      arresto: arrestoActivo
        ? {
            id: arrestoActivo._id?.toString(),
            estado: arrestoActivo.Estado,
            motivo: arrestoActivo.Motivo,
            arrestadoPor: arrestoActivo.ArrestadoPor,
            fechaArresto: arrestoActivo.FechaArresto,
            fechaExpiraPreventiva: arrestoActivo.FechaExpiraPreventiva,
            sentencia: arrestoActivo.Sentencia,
          }
        : null,
      antecedentes: {
        total: antecedentes.length,
        peligroso: antecedentes.length >= 3,
        recientes: antecedentes.map((d) => ({
          id: d._id?.toString(),
          motivo: d.Motivo,
          duracion: d.Duracion,
          activo: d.Activo,
          fechaArresto: d.FechaArresto,
          arrestadoPor: d.ArrestadoPor,
        })),
      },
      gulag: gulagUser
        ? {
            activo: true,
            fechaExpira: gulagUser.FechaExpira,
          }
        : { activo: false },
      verificacion: verificado
        ? {
            verificado: true,
            robloxId: verificado.RobloxId,
            robloxUsername: verificado.RobloxUsername,
            fechaVerificacion: verificado.FechaVerificacion,
          }
        : { verificado: false },
      inventario: {
        items: inventarioItems,
        total: inventarioItems.reduce(
          (sum, item) => sum + (item.Cantidad ?? 0),
          0
        ),
      },
      vehiculos: {
        registros: vehiculosView,
        total: vehiculosView.length,
      },
      viviendas: {
        registros: viviendasView,
        total: viviendasView.length,
      },
    });
  } catch (err) {
    logger.error({ err }, "getMe error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * GET /v1/dashboard/economy
 *
 * Devuelve solo los datos económicos del usuario.
 */
async function getEconomy(req, res) {
  try {
    const GUILD_ID = getGuildId();
    const userId = req.dashboardUser.discordId;

    const economyUser = await EconomyUser.findOne({
      GuildId: GUILD_ID,
      UserId: userId,
    }).lean();

    if (!economyUser) {
      return res.json({
        cuentaSalario: { Balance: 0, Activa: true },
        cuentaCorriente: { Balance: 0, Activa: true },
        efectivo: 0,
        dineroNegro: 0,
        deuda: 0,
        divisas: { USD: 0, BTC: 0 },
        sat: false,
        lastCobro: null,
        patrimonio: 0,
      });
    }

    const totalBancario =
      (economyUser.CuentaSalario?.Balance ?? 0) +
      (economyUser.CuentaCorriente?.Balance ?? 0);
    const patrimonio =
      totalBancario + (economyUser.Efectivo ?? 0) - (economyUser.Deuda ?? 0);

    return res.json({
      cuentaSalario: economyUser.CuentaSalario,
      cuentaCorriente: economyUser.CuentaCorriente,
      efectivo: economyUser.Efectivo ?? 0,
      dineroNegro: economyUser.DineroNegro ?? 0,
      deuda: economyUser.Deuda ?? 0,
      divisas: economyUser.Divisas ?? { USD: 0, BTC: 0 },
      sat: economyUser.Sat ?? false,
      lastCobro: economyUser.LastCobro,
      patrimonio,
    });
  } catch (err) {
    logger.error({ err }, "getEconomy error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * POST /v1/dashboard/economy/lavar
 *
 * Convierte todo el Dinero Negro a Efectivo con comisión escalonada:
 * - < $500,000 → 30%
 * - $500,000–$1,500,000 → 20%
 * - > $1,500,000 → 10%
 */
async function lavarDinero(req, res) {
  try {
    const GUILD_ID = getGuildId();
    const userId = req.dashboardUser.discordId;

    const db = mongoose.connection.db;
    const session = mongoose.startSession();

    let result = null;

    try {
      await session.withTransaction(async () => {
        const ecoDoc = await db
          .collection("economyusers")
          .findOne({ GuildId: GUILD_ID, UserId: userId }, { session });

        if (!ecoDoc) {
          throw new Error("no_economy");
        }

        const dineroNegro = Math.max(0, Number(ecoDoc.DineroNegro ?? 0));

        if (dineroNegro <= 0) {
          throw new Error("no_dinero_negro");
        }

        let pct;
        if (dineroNegro < 500000) {
          pct = 0.3;
        } else if (dineroNegro <= 1500000) {
          pct = 0.2;
        } else {
          pct = 0.1;
        }

        const comision = Math.round(dineroNegro * pct);
        const neto = dineroNegro - comision;

        const updateResult = await db.collection("economyusers").updateOne(
          {
            GuildId: GUILD_ID,
            UserId: userId,
            DineroNegro: dineroNegro,
          },
          {
            $set: { DineroNegro: 0, updatedAt: new Date() },
            $inc: { Efectivo: neto },
          },
          { session }
        );

        if (updateResult.modifiedCount !== 1) {
          throw new Error("concurrent_update");
        }

        result = {
          montoOriginal: dineroNegro,
          comisionPct: Math.round(pct * 100),
          comision,
          neto,
        };
      });
    } finally {
      await session.endSession();
    }

    if (!result) {
      return res.status(500).json({ error: "Lavado failed" });
    }

    return res.json({ ok: true, ...result });
  } catch (err) {
    if (err.message === "no_economy") {
      return res.status(409).json({ error: "No tienes economia registrada" });
    }
    if (err.message === "no_dinero_negro") {
      return res
        .status(409)
        .json({ error: "No tienes Dinero Negro disponible para lavar" });
    }
    if (err.message === "concurrent_update") {
      return res.status(409).json({
        error: "El saldo cambio mientras procesabas. Intenta de nuevo.",
      });
    }
    logger.error({ err }, "lavarDinero error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * GET /v1/dashboard/licencias
 *
 * Devuelve las licencias vigentes del usuario.
 */
async function getLicencias(req, res) {
  try {
    const GUILD_ID = getGuildId();
    const userId = req.dashboardUser.discordId;

    const licenciasDoc = await Licencias.findOne({
      GuildId: GUILD_ID,
      UserId: userId,
    }).lean();

    if (!licenciasDoc) {
      return res.json({ vigentes: [], total: 0 });
    }

    const ahora = new Date();
    const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
    const categorias = ["Armas", "Colectivas", "Restringidas"];
    const vigentes = [];

    for (const cat of categorias) {
      const mapa = licenciasDoc[cat];
      if (!mapa) continue;
      const entries = mapa instanceof Map ? Object.fromEntries(mapa) : mapa;

      for (const [codigo, entry] of Object.entries(entries)) {
        if (!entry.Activa) continue;
        const expiracion = entry.FechaExpiracion
          ? new Date(entry.FechaExpiracion)
          : null;
        if (expiracion && expiracion < ahora) continue;
        vigentes.push({
          categoria: cat,
          codigo,
          FechaExpiracion: expiracion,
          proximaAExpirar: expiracion
            ? expiracion.getTime() - ahora.getTime() < SIETE_DIAS_MS
            : false,
        });
      }
    }

    return res.json({ vigentes, total: vigentes.length });
  } catch (err) {
    logger.error({ err }, "getLicencias error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * GET /v1/dashboard/arresto
 *
 * Devuelve el arresto activo y los antecedentes del usuario.
 */
async function getArresto(req, res) {
  try {
    const GUILD_ID = getGuildId();
    const userId = req.dashboardUser.discordId;

    const [arrestoActivo, antecedentes] = await Promise.all([
      Arresto.findOne({
        GuildId: GUILD_ID,
        UserId: userId,
        Estado: { $in: ["preventiva", "sentenciado"] },
      })
        .sort({ FechaArresto: -1 })
        .lean(),
      Antecedente.find({ GuildId: GUILD_ID, UserId: userId })
        .sort({ FechaArresto: -1 })
        .lean(),
    ]);

    return res.json({
      arresto: arrestoActivo
        ? {
            id: arrestoActivo._id?.toString(),
            estado: arrestoActivo.Estado,
            motivo: arrestoActivo.Motivo,
            arrestadoPor: arrestoActivo.ArrestadoPor,
            fechaArresto: arrestoActivo.FechaArresto,
            fechaExpiraPreventiva: arrestoActivo.FechaExpiraPreventiva,
            sentencia: arrestoActivo.Sentencia,
          }
        : null,
      antecedentes: {
        total: antecedentes.length,
        peligroso: antecedentes.length >= 3,
        recientes: antecedentes.map((d) => ({
          id: d._id?.toString(),
          motivo: d.Motivo,
          duracion: d.Duracion,
          activo: d.Activo,
          fechaArresto: d.FechaArresto,
          arrestadoPor: d.ArrestadoPor,
        })),
      },
    });
  } catch (err) {
    logger.error({ err }, "getArresto error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * GET /v1/dashboard/gulag
 *
 * Devuelve el estado del gulag del usuario.
 */
async function getGulag(req, res) {
  try {
    const GUILD_ID = getGuildId();
    const userId = req.dashboardUser.discordId;

    const gulagUser = await GulagUser.findOne({
      GuildId: GUILD_ID,
      UserId: userId,
      Activo: true,
      FechaExpira: { $gt: new Date() },
    }).lean();

    if (!gulagUser) {
      return res.json({ activo: false });
    }

    return res.json({
      activo: true,
      fechaExpira: gulagUser.FechaExpira,
    });
  } catch (err) {
    logger.error({ err }, "getGulag error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * GET /v1/dashboard/verificacion
 *
 * Devuelve el estado de verificación del usuario.
 */
async function getVerificacion(req, res) {
  try {
    const GUILD_ID = getGuildId();
    const userId = req.dashboardUser.discordId;

    const verificado = await Verificado.findOne({
      GuildId: GUILD_ID,
      UserId: userId,
      Activo: true,
    }).lean();

    if (!verificado) {
      return res.json({ verificado: false });
    }

    return res.json({
      verificado: true,
      robloxId: verificado.RobloxId,
      robloxUsername: verificado.RobloxUsername,
      fechaVerificacion: verificado.FechaVerificacion,
    });
  } catch (err) {
    logger.error({ err }, "getVerificacion error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * GET /v1/dashboard/inventario
 *
 * Devuelve el inventario del usuario con datos de items.
 */
async function getInventario(req, res) {
  try {
    const GUILD_ID = getGuildId();
    const userId = req.dashboardUser.discordId;

    const inventarioDoc = await Inventario.findOne({
      GuildId: GUILD_ID,
      UserId: userId,
    }).lean();

    if (!inventarioDoc?.Items?.length) {
      return res.json({ items: [], total: 0 });
    }

    const itemIds = inventarioDoc.Items.map((entry) => {
      try {
        return typeof entry.ItemId === "string"
          ? new mongoose.Types.ObjectId(entry.ItemId)
          : entry.ItemId;
      } catch {
        return null;
      }
    }).filter(Boolean);

    const itemDocs = itemIds.length
      ? await Item.find({ _id: { $in: itemIds } }).lean()
      : [];

    const itemMap = Object.fromEntries(
      itemDocs.map((d) => [d._id.toString(), d])
    );

    const items = inventarioDoc.Items.map((entry) => {
      const k =
        typeof entry.ItemId === "string"
          ? entry.ItemId
          : entry.ItemId.toString();
      const itemActual = itemMap[k];
      return {
        ItemId: k,
        NombreSnapshot: entry.NombreSnapshot,
        CategoriaSnapshot: entry.CategoriaSnapshot,
        PrecioSnapshot: entry.PrecioSnapshot,
        Cantidad: entry.Cantidad,
        FechaAdquisicion: entry.FechaAdquisicion,
        NombreActual: itemActual?.Nombre ?? entry.NombreSnapshot,
        CategoriaActual:
          itemActual?.CategoriaNombre ?? entry.CategoriaSnapshot,
        ImagenURL: itemActual?.ImagenURL ?? null,
        ItemActivo: itemActual?.Activo ?? false,
      };
    });

    return res.json({
      items,
      total: items.reduce((sum, item) => sum + (item.Cantidad ?? 0), 0),
    });
  } catch (err) {
    logger.error({ err }, "getInventario error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * GET /v1/dashboard/vehiculos
 *
 * Devuelve los vehículos registrados del usuario.
 */
async function getVehiculos(req, res) {
  try {
    const GUILD_ID = getGuildId();
    const userId = req.dashboardUser.discordId;

    const vehiculos = await VehiculoRegistrado.find({
      GuildId: GUILD_ID,
      UserId: userId,
    })
      .sort({ createdAt: -1 })
      .lean();

    const registros = vehiculos.map((doc) => ({
      id: doc._id?.toString() ?? "",
      itemId: doc.ItemId,
      itemName: doc.ItemNombre,
      plate: doc.Matricula,
      robloxUsername: doc.RobloxUsername,
      ownerDiscordUsername: doc.OwnerDiscordUsername,
      colorPintura: doc.ColorPintura,
      colorCategoria: doc.ColorCategoria,
      placaPersonalizada: doc.PlacaPersonalizada ?? false,
      createdAt: doc.createdAt?.toISOString(),
    }));

    return res.json({ registros, total: registros.length });
  } catch (err) {
    logger.error({ err }, "getVehiculos error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * GET /v1/dashboard/vehiculos/:id/multas
 *
 * Devuelve las multas de un vehículo específico.
 */
async function getVehiculoMultas(req, res) {
  try {
    const GUILD_ID = getGuildId();
    const { id } = req.params;
    const { page = 1, pageSize = 4 } = req.query;

    const vehiculo = await VehiculoRegistrado.findOne({
      _id: id,
      GuildId: GUILD_ID,
    }).lean();

    if (!vehiculo) {
      return res.status(404).json({ error: "Vehiculo not found" });
    }

    const safePage = Math.max(1, Math.floor(Number(page)));
    const safePageSize = Math.max(1, Math.min(20, Math.floor(Number(pageSize))));

    const filter = {
      GuildId: GUILD_ID,
      MatriculaNormalized: vehiculo.MatriculaNormalized,
    };

    const total = await MultaVehiculo.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / safePageSize));
    const pageInRange = Math.min(safePage, totalPages);
    const skip = (pageInRange - 1) * safePageSize;

    const docs = await MultaVehiculo.find(filter)
      .sort({ FechaMulta: -1, createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(safePageSize)
      .lean();

    const dateFormatter = new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Mexico_City",
    });

    const items = docs.map((doc) => {
      const issuedAtDate = doc.FechaMulta ?? doc.createdAt ?? new Date(0);
      const paidAtDate = doc.FechaPago ?? null;
      const reason =
        typeof doc.Motivo === "string" && doc.Motivo.trim().length > 0
          ? doc.Motivo.trim()
          : "Sin motivo especificado";
      const status =
        typeof doc.Estado === "string" && doc.Estado.trim().length > 0
          ? doc.Estado.trim()
          : "pendiente";
      const amount = Number.isFinite(doc.Monto) ? Number(doc.Monto) : 0;

      return {
        id: doc._id?.toString() ?? "",
        plate: doc.Matricula ?? vehiculo.MatriculaNormalized,
        reason,
        amount,
        status,
        issuedAt: issuedAtDate.toISOString(),
        issuedAtLabel: dateFormatter.format(issuedAtDate),
        paidAt: paidAtDate ? paidAtDate.toISOString() : null,
        paidAtLabel: paidAtDate ? dateFormatter.format(paidAtDate) : null,
      };
    });

    return res.json({
      page: pageInRange,
      pageSize: safePageSize,
      total,
      totalPages,
      items,
    });
  } catch (err) {
    logger.error({ err }, "getVehiculoMultas error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * GET /v1/dashboard/viviendas
 *
 * Devuelve las viviendas registradas del usuario.
 */
async function getViviendas(req, res) {
  try {
    const GUILD_ID = getGuildId();
    const userId = req.dashboardUser.discordId;

    const viviendas = await ViviendaRegistrada.find({
      GuildId: GUILD_ID,
      UserId: userId,
    })
      .sort({ createdAt: -1 })
      .lean();

    const registros = viviendas.map((doc) => ({
      id: doc._id?.toString() ?? "",
      itemId: doc.ItemId,
      itemName: doc.ItemNombre,
      calle: `${doc.Calle} #${doc.NumeroExterior}`,
      codigoPostal: doc.CodigoPostal,
      colorFachada: doc.ColorFachada,
      maxItems: doc.MaxItems,
      maxVehicles: doc.MaxVehicles,
      storedItems: doc.StoredItems ?? [],
      storedVehicles: doc.StoredVehicles ?? [],
      robloxUsername: doc.RobloxUsername,
      ownerDiscordUsername: doc.OwnerDiscordUsername,
      createdAt: doc.createdAt?.toISOString(),
    }));

    return res.json({ registros, total: registros.length });
  } catch (err) {
    logger.error({ err }, "getViviendas error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * PUT /v1/dashboard/viviendas/:id/almacen
 *
 * Actualiza el almacenamiento de una vivienda.
 */
async function updateViviendaAlmacen(req, res) {
  try {
    const GUILD_ID = getGuildId();
    const userId = req.dashboardUser.discordId;
    const { id } = req.params;
    const { storedItems, storedVehicles } = req.body;

    const vivienda = await ViviendaRegistrada.findOne({
      _id: id,
      GuildId: GUILD_ID,
      UserId: userId,
    });

    if (!vivienda) {
      return res.status(404).json({ error: "Vivienda not found" });
    }

    // Validar límites
    if (storedItems && storedItems.length > vivienda.MaxItems) {
      return res
        .status(400)
        .json({ error: `Maximo ${vivienda.MaxItems} items` });
    }
    if (storedVehicles && storedVehicles.length > vivienda.MaxVehicles) {
      return res
        .status(400)
        .json({ error: `Maximo ${vivienda.MaxVehicles} vehiculos` });
    }

    await ViviendaRegistrada.updateOne(
      { _id: id, GuildId: GUILD_ID, UserId: userId },
      {
        $set: {
          StoredItems: storedItems ?? vivienda.StoredItems,
          StoredVehicles: storedVehicles ?? vivienda.StoredVehicles,
          updatedAt: new Date(),
        },
      }
    );

    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "updateViviendaAlmacen error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * GET /v1/dashboard/tienda
 *
 * Devuelve las categorías y items de la tienda.
 */
async function getTienda(req, res) {
  try {
    const GUILD_ID = getGuildId();

    const [categorias, items] = await Promise.all([
      Categoria.find({ GuildId: GUILD_ID }).sort({ Orden: 1 }).lean(),
      Item.find({ GuildId: GUILD_ID, Activo: true })
        .sort({ CategoriaNombre: 1, Nombre: 1 })
        .lean(),
    ]);

    return res.json({ categorias, items });
  } catch (err) {
    logger.error({ err }, "getTienda error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * POST /v1/dashboard/tienda/comprar
 *
 * Compra un item de la tienda.
 */
async function comprarItem(req, res) {
  try {
    const GUILD_ID = getGuildId();
    const userId = req.dashboardUser.discordId;
    const { itemId, cantidad = 1 } = req.body;

    if (!itemId) {
      return res.status(400).json({ error: "itemId is required" });
    }

    const item = await Item.findOne({
      _id: itemId,
      GuildId: GUILD_ID,
      Activo: true,
    }).lean();

    if (!item) {
      return res.status(404).json({ error: "Item not found or inactive" });
    }

    // Verificar stock
    if (item.Stock !== -1 && item.Stock < cantidad) {
      return res.status(400).json({ error: "Stock insuficiente" });
    }

    // Verificar límite por usuario
    if (item.LimitePorUsuario > 0) {
      const inventario = await Inventario.findOne({
        GuildId: GUILD_ID,
        UserId: userId,
      }).lean();

      const yaComprados =
        inventario?.Items?.filter(
          (i) => i.ItemId?.toString() === itemId
        ).reduce((sum, i) => sum + (i.Cantidad ?? 0), 0) ?? 0;

      if (yaComprados + cantidad > item.LimitePorUsuario) {
        return res.status(400).json({
          error: `Limite de ${item.LimitePorUsuario} por usuario`,
        });
      }
    }

    // Calcular precio
    const precioUnitario =
      item.Descuento > 0
        ? Math.round(item.Precio * (1 - item.Descuento / 100))
        : item.Precio;
    const precioTotal = precioUnitario * cantidad;

    // Verificar economía
    const economyUser = await EconomyUser.findOne({
      GuildId: GUILD_ID,
      UserId: userId,
    }).lean();

    if (!economyUser || economyUser.Efectivo < precioTotal) {
      return res
        .status(400)
        .json({ error: "Efectivo insuficiente" });
    }

    const db = mongoose.connection.db;
    const session = mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        // Descontar efectivo
        const ecoUpdate = await db.collection("economyusers").updateOne(
          {
            GuildId: GUILD_ID,
            UserId: userId,
            Efectivo: { $gte: precioTotal },
          },
          {
            $inc: { Efectivo: -precioTotal },
            $set: { updatedAt: new Date() },
          },
          { session }
        );

        if (ecoUpdate.modifiedCount !== 1) {
          throw new Error("insufficient_funds");
        }

        // Actualizar stock si no es infinito
        if (item.Stock !== -1) {
          const stockUpdate = await db.collection("items").updateOne(
            {
              _id: new mongoose.Types.ObjectId(itemId),
              Stock: { $gte: cantidad },
            },
            { $inc: { Stock: -cantidad } },
            { session }
          );

          if (stockUpdate.modifiedCount !== 1) {
            throw new Error("insufficient_stock");
          }
        }

        // Agregar al inventario
        await db.collection("inventarios").updateOne(
          { GuildId: GUILD_ID, UserId: userId },
          {
            $push: {
              Items: {
                ItemId: new mongoose.Types.ObjectId(itemId),
                NombreSnapshot: item.Nombre,
                CategoriaSnapshot: item.CategoriaNombre,
                PrecioSnapshot: precioUnitario,
                Cantidad: cantidad,
                FechaAdquisicion: new Date(),
              },
            },
            $set: { UltimaActualizacion: new Date() },
            $setOnInsert: { GuildId: GUILD_ID, UserId: userId },
          },
          { upsert: true, session }
        );
      });
    } finally {
      await session.endSession();
    }

    return res.json({
      ok: true,
      item: item.Nombre,
      cantidad,
      precioTotal,
    });
  } catch (err) {
    if (err.message === "insufficient_funds") {
      return res.status(400).json({ error: "Efectivo insuficiente" });
    }
    if (err.message === "insufficient_stock") {
      return res.status(400).json({ error: "Stock insuficiente" });
    }
    logger.error({ err }, "comprarItem error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  getMe,
  getEconomy,
  lavarDinero,
  getLicencias,
  getArresto,
  getGulag,
  getVerificacion,
  getInventario,
  getVehiculos,
  getVehiculoMultas,
  getViviendas,
  updateViviendaAlmacen,
  getTienda,
  comprarItem,
};
