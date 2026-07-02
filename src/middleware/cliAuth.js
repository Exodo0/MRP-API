const jwt = require("jsonwebtoken");
const logger = require("../logger");

function cliAuth(req, res, next) {
  const secret = process.env.CLI_JWT_SECRET;
  if (!secret) return res.status(503).json({ error: "CLI authentication is not configured" });
  const match = (req.header("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: "Missing CLI authorization token" });
  try {
    const payload = jwt.verify(match[1], secret, {
      algorithms: ["HS256"], issuer: "mxrp-api", audience: "mxrp-cli",
    });
    if (payload.type !== "cli" || !payload.sub) throw new Error("Invalid CLI token type");
    req.cliUser = {
      discordId: payload.sub,
      username: payload.username,
      guildId: payload.guildId,
    };
    return next();
  } catch (error) {
    logger.warn({ err: error.message }, "CLI JWT rejected");
    return res.status(401).json({ error: error.name === "TokenExpiredError" ? "CLI token expired" : "Invalid CLI token" });
  }
}

module.exports = cliAuth;
