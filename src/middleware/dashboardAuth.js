const jwt = require("jsonwebtoken");
const logger = require("../logger");

const JWT_SECRET = process.env.DASHBOARD_JWT_SECRET;
const EXPECTED_GUILD_ID = process.env.GUILD_ID;
if (!JWT_SECRET) {
  logger.warn(
    "DASHBOARD_JWT_SECRET not set — dashboard auth will reject all requests",
  );
}

/**
 * Middleware de autenticación para el Dashboard (mxrp-web).
 *
 * La web envía un JWT firmado con el usuario de Discord autenticado.
 * El API valida el JWT y extrae el discordId para las operaciones.
 *
 * Headers esperados:
 *   Authorization: Bearer <jwt>
 */
async function dashboardAuth(req, res, next) {
  if (!JWT_SECRET) {
    return res.status(503).json({ error: "Dashboard auth not configured" });
  }

  const authHeader = req.header("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({ error: "Missing authorization token" });
  }

  try {
    const payload = jwt.verify(match[1], JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "mxrp-web",
      audience: "mrp-api",
      maxAge: "60s",
    });

    if (!payload.discordId || payload.sub !== payload.discordId) {
      return res.status(401).json({ error: "Invalid token subject" });
    }
    if (!EXPECTED_GUILD_ID) {
      return res
        .status(503)
        .json({ error: "Dashboard guild is not configured" });
    }
    if (payload.guildId !== EXPECTED_GUILD_ID) {
      return res.status(403).json({ error: "Guild is not authorized" });
    }

    req.dashboardUser = {
      discordId: payload.discordId,
      discordUsername: payload.discordUsername,
      guildId: EXPECTED_GUILD_ID,
    };

    return next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    logger.warn({ err: err.message }, "Dashboard auth failed");
    return res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = dashboardAuth;
