const logger = require("../logger");

async function dashboardEconomyAuth(req, res, next) {
  const token = process.env.DISCORD_TOKEN;
  const guildId = process.env.GUILD_ID;
  const userId = req.dashboardUser?.discordId;
  if (!token || !guildId || !userId) {
    return res.status(503).json({
      code: "AUTHORIZATION_UNAVAILABLE",
      message: "No se pudo verificar el acceso económico.",
    });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bot ${token}` }, signal: controller.signal },
    );
    if (response.status === 404) {
      return res.status(403).json({
        code: "GUILD_MEMBERSHIP_REQUIRED",
        message: "Debes pertenecer al servidor para usar la economía.",
      });
    }
    if (!response.ok) {
      logger.warn(
        { status: response.status },
        "Dashboard economy authorization unavailable",
      );
      return res.status(503).json({
        code: "AUTHORIZATION_UNAVAILABLE",
        message: "No se pudo verificar el acceso económico.",
      });
    }
    req.dashboardMember = await response.json();
    return next();
  } catch (error) {
    logger.warn(
      { name: error?.name },
      "Dashboard economy authorization failed",
    );
    return res.status(503).json({
      code: "AUTHORIZATION_UNAVAILABLE",
      message: "No se pudo verificar el acceso económico.",
    });
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = dashboardEconomyAuth;
