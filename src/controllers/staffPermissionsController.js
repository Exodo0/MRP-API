const Joi = require("joi");
const { GUILD_ID: DEFAULT_GUILD_ID } = require("../config");
const logger = require("../logger");
const StaffPermisos = require("../models/StaffPermisos");
const StaffPermissionAudit = require("../models/StaffPermissionAudit");

const updateSchema = Joi.object({
  roleIds: Joi.array().items(Joi.string().pattern(/^\d{17,20}$/)).unique().required(),
  expectedVersion: Joi.number().integer().min(0).required(),
});
const groupMutationSchema = Joi.object({
  name: Joi.string().trim().min(2).max(48).pattern(/^[\p{L}][\p{L}\p{N}_-]*$/u).required(),
  expectedVersion: Joi.number().integer().min(0).required(),
});
const deleteSchema = Joi.object({
  expectedVersion: Joi.number().integer().min(0).required(),
});

const getGuildId = () => process.env.GUILD_ID || DEFAULT_GUILD_ID;
const isValidGroupName = (group) => /^[\p{L}][\p{L}\p{N}_-]{1,47}$/u.test(group);

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

function groupNames(document) {
  if (!document?.Groups) return [];
  return document.Groups instanceof Map
    ? [...document.Groups.keys()]
    : Object.keys(document.Groups);
}

function hasGroup(document, group) {
  return groupNames(document).includes(group);
}

function versionFilter(document, guildId, version) {
  if (!document) return { GuildId: guildId, PermissionsVersion: version };
  return {
    _id: document._id,
    ...(document.PermissionsVersion == null
      ? { PermissionsVersion: { $exists: false } }
      : { PermissionsVersion: version }),
  };
}

async function listGroups(req, res) {
  try {
    const config = await StaffPermisos.findOne({ GuildId: getGuildId() }).lean();
    const groups = groupNames(config).sort((a, b) => a.localeCompare(b, "es")).map((name) => ({
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
  if (!isValidGroupName(group)) return res.status(400).json({ error: "Invalid permission group name" });

  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 50);

  try {
    const [discordRoles, config] = await Promise.all([
      fetchDiscordRoles(),
      StaffPermisos.findOne({ GuildId: getGuildId() }).lean(),
    ]);
    if (!hasGroup(config, group)) return res.status(404).json({ error: "Unknown permission group" });
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
  if (!isValidGroupName(group)) return res.status(400).json({ error: "Invalid permission group name" });
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
    if (!hasGroup(current, group)) return res.status(404).json({ error: "Unknown permission group" });

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

    const updated = await StaffPermisos.findOneAndUpdate(
      versionFilter(current, guildId, currentVersion),
      { $set: { [`Groups.${group}`]: selected }, $inc: { PermissionsVersion: 1 } },
      { new: true, upsert: !current },
    );
    if (!updated) return res.status(409).json({ error: "Configuration changed; refresh and try again" });

    await StaffPermissionAudit.create({
      GuildId: guildId,
      Group: group,
      Action: "update",
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

async function createGroup(req, res) {
  const { error, value } = groupMutationSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  try {
    const guildId = getGuildId();
    const current = await StaffPermisos.findOne({ GuildId: guildId });
    const currentVersion = current?.PermissionsVersion || 0;
    if (currentVersion !== value.expectedVersion) {
      return res.status(409).json({ error: "Configuration changed; refresh and try again", version: currentVersion });
    }
    if (hasGroup(current, value.name)) return res.status(409).json({ error: "Permission group already exists" });

    const updated = await StaffPermisos.findOneAndUpdate(
      versionFilter(current, guildId, currentVersion),
      { $set: { [`Groups.${value.name}`]: [] }, $inc: { PermissionsVersion: 1 } },
      { new: true, upsert: !current },
    );
    if (!updated) return res.status(409).json({ error: "Configuration changed; refresh and try again" });
    const nextVersion = currentVersion + 1;
    await StaffPermissionAudit.create({
      GuildId: guildId, Group: value.name, Action: "create",
      Actor: req.apiKeyOwner || "API", PreviousVersion: currentVersion, Version: nextVersion,
    });
    return res.status(201).json({ ok: true, group: value.name, version: nextVersion });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "Permission group already exists" });
    logger.error({ err: error }, "create staff permission group error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function deleteGroup(req, res) {
  const { group } = req.params;
  if (!isValidGroupName(group)) return res.status(400).json({ error: "Invalid permission group name" });
  const { error, value } = deleteSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  try {
    const guildId = getGuildId();
    const current = await StaffPermisos.findOne({ GuildId: guildId });
    const currentVersion = current?.PermissionsVersion || 0;
    if (currentVersion !== value.expectedVersion) {
      return res.status(409).json({ error: "Configuration changed; refresh and try again", version: currentVersion });
    }
    if (!hasGroup(current, group)) return res.status(404).json({ error: "Unknown permission group" });
    const removed = groupRoles(current, group);
    const updated = await StaffPermisos.findOneAndUpdate(
      versionFilter(current, guildId, currentVersion),
      { $unset: { [`Groups.${group}`]: 1 }, $inc: { PermissionsVersion: 1 } },
      { new: true },
    );
    if (!updated) return res.status(409).json({ error: "Configuration changed; refresh and try again" });
    const nextVersion = currentVersion + 1;
    await StaffPermissionAudit.create({
      GuildId: guildId, Group: group, Action: "delete", Actor: req.apiKeyOwner || "API",
      PreviousVersion: currentVersion, Version: nextVersion, Removed: removed,
    });
    return res.json({ ok: true, group, version: nextVersion });
  } catch (error) {
    logger.error({ err: error, group }, "delete staff permission group error");
    return res.status(500).json({ error: "Internal Server Error" });
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

module.exports = { listGroups, listGroupRoles, createGroup, updateGroup, deleteGroup, listHistory };
