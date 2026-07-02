const { Client, GatewayIntentBits, ChannelType, EmbedBuilder } = require("discord.js");
const { ChannelType: CT } = require("discord.js");
const Joi = require("joi");
const logger = require("../logger");
const { GUILD_ID } = require("../config");
const Ticket = require("../models/Ticket");
const TicketSetup = require("../models/TicketSetup");
let discordTranscripts;
try {
  discordTranscripts = require("discord-html-transcripts-v2");
} catch {
  discordTranscripts = null;
}

const getGuildId = () => process.env.GUILD_ID || GUILD_ID;
const actorName = (req) => req.cliUser ? `${req.cliUser.username} (${req.cliUser.discordId})` : req.apiKeyOwner || "API";

// ── Discord.js client singleton (para transcripts) ────────────────────────────

let discordClient = null;
let discordReady = null;

async function getDiscordClient() {
  if (discordClient && discordReady) {
    await discordReady;
    return discordClient;
  }

  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error("DISCORD_TOKEN not set");

  discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  discordReady = discordClient.login(token).then(() => {
    logger.info("Discord client connected (ticket module)");
    return discordClient;
  });

  return discordReady;
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const listSchema = Joi.object({
  estado: Joi.string().valid("abierto", "cerrado").optional(),
  staff: Joi.string().optional(),
  creator: Joi.string().optional(),
  limit: Joi.number().integer().min(1).max(200).default(50),
});

const closeSchema = Joi.object({
  reason: Joi.string().trim().min(1).max(512).required(),
  deleteChannel: Joi.boolean().default(false),
});

const bulkDeleteSchema = Joi.object({
  estado: Joi.string().valid("abierto", "cerrado").required(),
  deleteChannels: Joi.boolean().default(false),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function fecha(d) {
  if (!d) return "N/A";
  return new Date(d).toLocaleString("es-ES", { timeZone: "America/Argentina/Buenos_Aires" });
}

// ── Controllers ──────────────────────────────────────────────────────────────

const listTickets = async (req, res) => {
  const { error, value } = listSchema.validate(req.query);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const filter = {};
    if (value.estado) filter.Estado = value.estado;
    if (value.staff) filter.StaffAsignado = value.staff;
    if (value.creator) filter.CreadorId = value.creator;

    const tickets = await Ticket.find(filter).sort({ createdAt: -1 }).limit(value.limit).lean();

    const results = tickets.map((t) => ({
      ticketId: t.TicketId,
      channelId: t.ChannelId,
      estado: t.Estado,
      staff: t.StaffAsignado,
      creador: t.CreadorId,
      categoria: t.Categoria,
      number: t.Number,
      cerradoPor: t.CerradoPor,
      created: t.createdAt,
      updated: t.updatedAt,
    }));

    return res.json({ count: results.length, tickets: results });
  } catch (err) {
    logger.error({ err }, "listTickets error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const getTicketStats = async (req, res) => {
  try {
    const total = await Ticket.countDocuments({});
    const abiertos = await Ticket.countDocuments({ Estado: "abierto" });
    const cerrados = await Ticket.countDocuments({ Estado: "cerrado" });

    const topStaff = await Ticket.aggregate([
      { $match: { StaffAsignado: { $ne: null } } },
      { $group: { _id: "$StaffAsignado", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const topCreators = await Ticket.aggregate([
      { $group: { _id: "$CreadorId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const porCategoria = await Ticket.aggregate([
      { $group: { _id: "$Categoria", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    return res.json({
      total,
      abiertos,
      cerrados,
      topStaff: topStaff.map((s) => ({ staff: s._id, count: s.count })),
      topCreators: topCreators.map((c) => ({ creador: c._id, count: c.count })),
      porCategoria: porCategoria.map((c) => ({ categoria: c._id || "Sin categoría", count: c.count })),
    });
  } catch (err) {
    logger.error({ err }, "getTicketStats error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const getTicketSetup = async (req, res) => {
  try {
    const guildId = getGuildId();
    const setup = await TicketSetup.findOne({ GuildId: guildId }).lean();

    if (!setup) {
      return res.status(404).json({ error: "No ticket setup found for this guild" });
    }

    const token = process.env.DISCORD_TOKEN;
    const resolved = { ...setup };

    // Resolver nombres de canales
    const channelFields = ["LogId", "Soporte", "Reportes", "Ban", "Dudas", "Sugerencias", "Agradecimientos", "Bug"];
    for (const field of channelFields) {
      const id = setup[field];
      if (id && token) {
        try {
          const discordRes = await fetch(`https://discord.com/api/v10/channels/${id}`, {
            headers: { Authorization: `Bot ${token}` },
          });
          if (discordRes.ok) {
            const ch = await discordRes.json();
            resolved[`${field}_name`] = ch.name;
          }
        } catch { /* ignore */ }
      }
    }

    return res.json(resolved);
  } catch (err) {
    logger.error({ err }, "getTicketSetup error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const getTicketCategories = async (req, res) => {
  try {
    const guildId = getGuildId();
    const setup = await TicketSetup.findOne({ GuildId: guildId }).lean();
    if (!setup) return res.status(404).json({ error: "No ticket setup found for this guild" });

    const ignoredFields = new Set(["_id", "GuildId", "LogId", "createdAt", "updatedAt", "__v"]);
    const categoryFields = Object.keys(TicketSetup.schema.paths).filter(
      (field) => !ignoredFields.has(field) && TicketSetup.schema.paths[field].instance === "String",
    );
    const token = process.env.DISCORD_TOKEN;
    const categories = await Promise.all(
      categoryFields.filter((field) => setup[field]).map(async (field) => {
        const category = { key: field, channelId: setup[field], channelName: null };
        if (!token) return category;
        try {
          const discordRes = await fetch(`https://discord.com/api/v10/channels/${setup[field]}`, {
            headers: { Authorization: `Bot ${token}` },
          });
          if (discordRes.ok) category.channelName = (await discordRes.json()).name;
        } catch { /* El ID sigue siendo útil si Discord no responde. */ }
        return category;
      }),
    );
    return res.json({ guildId, categories });
  } catch (err) {
    logger.error({ err }, "getTicketCategories error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const getTicketHistory = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Channel ID or Ticket ID is required" });

  try {
    let ticket = await Ticket.findOne({ ChannelId: id }).lean();
    if (!ticket) ticket = await Ticket.findOne({ TicketId: id }).lean();
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const result = {
      ticketId: ticket.TicketId,
      channelId: ticket.ChannelId,
      estado: ticket.Estado,
      staff: ticket.StaffAsignado,
      creador: ticket.CreadorId,
      categoria: ticket.Categoria,
      number: ticket.Number,
      cerradoPor: ticket.CerradoPor,
      created: ticket.createdAt,
      updated: ticket.updatedAt,
      messages: [],
    };

    // Obtener últimos mensajes si el canal existe
    if (ticket.ChannelId) {
      try {
        const client = await getDiscordClient();
        const channel = await client.channels.fetch(ticket.ChannelId);
        if (channel && channel.isTextBased()) {
          const messages = await channel.messages.fetch({ limit: 20 });
          const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
          result.messages = sorted.map((m) => ({
            author: m.author.tag,
            content: m.content ? m.content.slice(0, 200) : m.embeds.length ? "[embed]" : "[sin contenido]",
            timestamp: fecha(m.createdTimestamp),
          }));
        }
      } catch (chErr) {
        logger.warn({ err: chErr, channelId: ticket.ChannelId }, "Could not fetch channel messages");
      }
    }

    return res.json(result);
  } catch (err) {
    logger.error({ err, id }, "getTicketHistory error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const closeTicket = async (req, res) => {
  const { channelId } = req.params;
  if (!channelId) return res.status(400).json({ error: "Channel ID is required" });

  const { error, value } = closeSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const ticket = await Ticket.findOne({ ChannelId: channelId });
    if (!ticket) return res.status(404).json({ error: "Ticket not found for this channel" });
    if (ticket.Estado === "cerrado") return res.status(400).json({ error: "Ticket is already closed" });

    const client = await getDiscordClient();
    const guildId = getGuildId();
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return res.status(404).json({ error: "Channel not found in guild" });

    const setup = await TicketSetup.findOne({ GuildId: guildId });
    let logChannel = null;
    if (setup?.LogId) {
      logChannel = await guild.channels.fetch(setup.LogId).catch(() => null);
    }

    // Generar transcript
    if (discordTranscripts && channel.type === CT.GuildText) {
      try {
        const transcript = await discordTranscripts.createTranscript(channel, {
          filename: `ticket-${channel.id}.html`,
          saveImages: true,
          poweredBy: false,
          sortType: "ASC",
          includePinnedMessages: true,
          footerText: `Ticket: ${channel.name} | Cerrado por: API\nRazón: ${value.reason}`,
        });

        if (logChannel && logChannel.type === CT.GuildText) {
          await logChannel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("🔐 Ticket Cerrado (API)")
                .setColor(0xff0000)
                .addFields(
                  { name: "ID del Ticket", value: `\`${ticket.TicketId}\``, inline: true },
                  { name: "Canal", value: `\`${channel.name}\``, inline: true },
                  { name: "Razón", value: value.reason },
                  { name: "Cerrado por", value: actorName(req), inline: true },
                  { name: "Atendido por", value: ticket.StaffAsignado ? `<@${ticket.StaffAsignado}>` : "Sin asignar", inline: true },
                  { name: "Usuario que Aperturó", value: ticket.CreadorId ? `<@${ticket.CreadorId}>` : "N/A", inline: true }
                )
                .setTimestamp(),
            ],
            files: [transcript],
          });
          logger.info({ ticketId: ticket.TicketId }, "Transcript sent to log channel");
        }
      } catch (transcriptErr) {
        logger.error({ err: transcriptErr, channelId }, "Error generating transcript");
      }
    }

    // Actualizar DB
    await Ticket.updateOne(
      { _id: ticket._id },
      { $set: { Estado: "cerrado", CerradoPor: actorName(req) } }
    );

    // Eliminar canal si se pide
    let channelDeleted = false;
    if (value.deleteChannel) {
      await channel.delete().catch(() => {});
      channelDeleted = true;
    }

    logger.info({ ticketId: ticket.TicketId, reason: value.reason, deletedBy: actorName(req) }, "Ticket closed");
    return res.json({ ok: true, channelDeleted });
  } catch (err) {
    logger.error({ err, channelId }, "closeTicket error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const unclaimTicket = async (req, res) => {
  const { channelId } = req.params;
  if (!channelId) return res.status(400).json({ error: "Channel ID is required" });

  try {
    const ticket = await Ticket.findOne({ ChannelId: channelId });
    if (!ticket) return res.status(404).json({ error: "Ticket not found for this channel" });
    if (!ticket.StaffAsignado) return res.status(400).json({ error: "Ticket has no staff assigned" });

    const prev = ticket.StaffAsignado;
    await Ticket.updateOne({ _id: ticket._id }, { $set: { StaffAsignado: null } });

    logger.info({ ticketId: ticket.TicketId, previousStaff: prev }, "Ticket unclaimed");
    return res.json({ ok: true, previousStaff: prev });
  } catch (err) {
    logger.error({ err, channelId }, "unclaimTicket error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteTicket = async (req, res) => {
  const { id } = req.params;
  const deleteChannel = req.query.deleteChannel === "true";

  try {
    let ticket = await Ticket.findOne({ ChannelId: id });
    if (!ticket) ticket = await Ticket.findOne({ TicketId: id });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    if (deleteChannel && ticket.ChannelId) {
      const client = await getDiscordClient();
      const guildId = getGuildId();
      const guild = await client.guilds.fetch(guildId);
      const ch = await guild.channels.fetch(ticket.ChannelId).catch(() => null);
      if (ch) await ch.delete().catch(() => {});
    }

    await Ticket.deleteOne({ _id: ticket._id });

    logger.info({ ticketId: ticket.TicketId, deletedBy: actorName(req) }, "Ticket deleted");
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err, id }, "deleteTicket error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const bulkDeleteTickets = async (req, res) => {
  const { error, value } = bulkDeleteSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const tickets = await Ticket.find({ Estado: value.estado }).lean();
    if (!tickets.length) return res.json({ ok: true, deleted: 0 });

    let client = null;
    let guild = null;

    if (value.deleteChannels) {
      client = await getDiscordClient();
      guild = await client.guilds.fetch(getGuildId());
    }

    let deleted = 0;
    for (const t of tickets) {
      if (value.deleteChannels && t.ChannelId && guild) {
        const ch = await guild.channels.fetch(t.ChannelId).catch(() => null);
        if (ch) await ch.delete().catch(() => {});
      }
      await Ticket.deleteOne({ _id: t._id });
      deleted++;
    }

    logger.info({ estado: value.estado, deleted, deletedBy: actorName(req) }, "Bulk ticket delete");
    return res.json({ ok: true, deleted });
  } catch (err) {
    logger.error({ err, estado: value?.estado }, "bulkDeleteTickets error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  listTickets,
  getTicketStats,
  getTicketSetup,
  getTicketCategories,
  getTicketHistory,
  closeTicket,
  unclaimTicket,
  deleteTicket,
  bulkDeleteTickets,
};
