const StaffPermisos = require("../models/StaffPermisos");
const logger = require("../logger");

function roleIds(document, group) {
  const entries = document?.Groups?.get
    ? document.Groups.get(group)
    : document?.Groups?.[group];
  return new Set((entries ?? []).map((entry) => entry.roleId).filter(Boolean));
}

function requireStaffGroup(group) {
  return async function staffGroupMiddleware(req, res, next) {
    const guildId = process.env.GUILD_ID;
    const token = process.env.DISCORD_TOKEN;
    const actorId = req.cliUser?.discordId;
    if (!guildId || !token || !actorId) {
      return res
        .status(503)
        .json({ error: "Staff authorization is not configured" });
    }
    try {
      const permissions = await StaffPermisos.findOne({
        GuildId: guildId,
      }).lean();
      const allowed = roleIds(permissions, group);
      if (!allowed.size) {
        return res
          .status(403)
          .json({ error: `Required staff group ${group} is not configured` });
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      let response;
      try {
        response = await fetch(
          `https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(actorId)}`,
          {
            headers: { Authorization: `Bot ${token}` },
            signal: controller.signal,
          },
        );
      } finally {
        clearTimeout(timeout);
      }
      if (response.status === 404)
        return res
          .status(403)
          .json({ error: "Staff actor is not in the guild" });
      if (!response.ok)
        return res
          .status(503)
          .json({ error: "Staff authorization unavailable" });
      const member = await response.json();
      if (
        !Array.isArray(member.roles) ||
        !member.roles.some((roleId) => allowed.has(roleId))
      ) {
        return res.status(403).json({ error: "Staff permission denied" });
      }
      return next();
    } catch (error) {
      logger.warn({ name: error?.name }, "Staff group authorization failed");
      return res.status(503).json({ error: "Staff authorization unavailable" });
    }
  };
}

module.exports = requireStaffGroup;
