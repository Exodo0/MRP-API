const Joi = require("joi");
const { GUILD_ID: DEFAULT_GUILD_ID } = require("../config");
const logger = require("../logger");
const StaffPermisos = require("../models/StaffPermisos");
const StaffPermissionAudit = require("../models/StaffPermissionAudit");

const GROUPS = [
  "high", "medium", "jornada_start", "jornada_admin", "AuditGlobal", "ban_manage",
  "gulag", "economy_manage", "perfil_view", "notas_manage", "notas_view", "wip_manage",
  "wip_add", "infracciones_manage", "economia", "ck", "ine", "tesoreria", "vinculacion",
  "diseno", "diseño", "dev", "publicar_empresa", "publicar_legal",
];

const updateSchema = Joi.object({
  roleIds: Joi.array().items(Joi.string().pattern(/^\d{17,20}$/)).unique().required(),
  expectedVersion: Joi.number().integer().min(0).required(),
});

const getGuildId = () => process.env.GUILD_ID || DEFAULT_GUILD_ID;
const isKnownGroup = (group) => GROUPS.includes(group);

async function fetchDiscordRoles() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    const error = new Error("DISCORD_TOKEN is not configured");
    error.status = 503;
    throw error;
  }

  const response = await fetch(`https://discord.com/api/v10/guilds/${getGuildId()}/roles`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!response.ok) {
    const error = new Error(`Discord returned HTTP ${response.status}`);
    error.status = 502;
    throw error;
  }

  const roles = await response.json();
  return roles
    .filter((role) => role.id !== getGuildId() && !role.managed)
    .sort((a, b) => b.position - a.position)
    .map((role) => ({ id: role.id, name: role.name, position: role.position }));
}

function groupRoles(document, group) {
  if (!document?.Groups) return [];
  return document.Groups.get ? document.Groups.get(group) || [] : document.Groups[group] || [];
}

async function listGroups(req, res) {
  try {
    const config = await StaffPermisos.findOne({ GuildId: getGuildId() }).lean();
    const groups = GROUPS.map((name) => ({
      name,
      selectedCount: groupRoles(config, name).length,
    }));
    return res.json({ version: config?.PermissionsVersion || 0, groups });
  } catch (error) {
    logger.error({ err: error }, "list staff permission groups error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function listGroupRoles(req, res) {
  const { group } = req.params;
  if (!isKnownGroup(group)) return res.status(404).json({ error: "Unknown permission group" });

  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 50);

  try {
    const [discordRoles, config] = await Promise.all([
      fetchDiscordRoles(),
      StaffPermisos.findOne({ GuildId: getGuildId() }).lean(),
    ]);
    const saved = groupRoles(config, group);
    const selectedIds = new Set(saved.map((role) => role.roleId));
    const discordIds = new Set(discordRoles.map((role) => role.id));
    const total = discordRoles.length;
    const pages = Math.max(Math.ceil(total / limit), 1);
    const safePage = Math.min(page, pages);
    const start = (safePage - 1) * limit;

    return res.json({
      group,
      version: config?.PermissionsVersion || 0,
      page: safePage,
      limit,
      total,
      pages,
      roles: discordRoles.slice(start, start + limit).map((role) => ({
        ...role,
        selected: selectedIds.has(role.id),
      })),
      obsoleteRoles: saved.filter((role) => !discordIds.has(role.roleId)),
    });
  } catch (error) {
    logger.error({ err: error, group }, "list Discord roles error");
    return res.status(error.status || 500).json({ error: error.message || "Internal Server Error" });
  }
}

async function updateGroup(req, res) {
  const { group } = req.params;
  if (!isKnownGroup(group)) return res.status(404).json({ error: "Unknown permission group" });
  const { error, value } = updateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const guildId = getGuildId();
    const [discordRoles, current] = await Promise.all([
      fetchDiscordRoles(),
      StaffPermisos.findOne({ GuildId: guildId }),
    ]);
    const currentVersion = current?.PermissionsVersion || 0;
    if (currentVersion !== value.expectedVersion) {
      return res.status(409).json({ error: "Configuration changed; refresh and try again", version: currentVersion });
    }

    const existingRoles = groupRoles(current, group);
    const existingById = new Map(existingRoles.map((role) => [role.roleId, role]));
    const discordById = new Map(discordRoles.map((role) => [role.id, role]));
    const invalidIds = value.roleIds.filter((id) => !discordById.has(id) && !existingById.has(id));
    if (invalidIds.length) return res.status(400).json({ error: "Some roles do not belong to the guild", roleIds: invalidIds });

    const selected = value.roleIds.map((id) => {
      const live = discordById.get(id);
      return live ? { roleId: live.id, roleName: live.name } : existingById.get(id);
    });
    const selectedIds = new Set(selected.map((role) => role.roleId));
    const previousIds = new Set(existingRoles.map((role) => role.roleId));
    const added = selected.filter((role) => !previousIds.has(role.roleId));
    const removed = existingRoles.filter((role) => !selectedIds.has(role.roleId));
    const nextVersion = currentVersion + 1;

    const versionFilter = current
      ? {
          _id: current._id,
          ...(current.PermissionsVersion == null
            ? { PermissionsVersion: { $exists: false } }
            : { PermissionsVersion: currentVersion }),
        }
      : { GuildId: guildId, PermissionsVersion: currentVersion };
    const updated = await StaffPermisos.findOneAndUpdate(
      versionFilter,
      { $set: { [`Groups.${group}`]: selected }, $inc: { PermissionsVersion: 1 } },
      { new: true, upsert: !current },
    );
    if (!updated) return res.status(409).json({ error: "Configuration changed; refresh and try again" });

    await StaffPermissionAudit.create({
      GuildId: guildId,
      Group: group,
      Actor: req.apiKeyOwner || "API",
      PreviousVersion: currentVersion,
      Version: nextVersion,
      Added: added,
      Removed: removed,
    });
    return res.json({ ok: true, group, version: nextVersion, roles: selected, added, removed });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "Configuration changed; refresh and try again" });
    logger.error({ err: error, group }, "update staff permission group error");
    return res.status(error.status || 500).json({ error: error.message || "Internal Server Error" });
  }
}

async function listHistory(req, res) {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
  try {
    const history = await StaffPermissionAudit.find({ GuildId: getGuildId() })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return res.json({ history });
  } catch (error) {
    logger.error({ err: error }, "list staff permission history error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = { GROUPS, listGroups, listGroupRoles, updateGroup, listHistory };
