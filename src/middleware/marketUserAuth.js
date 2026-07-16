const crypto = require("crypto");
const { connectDB } = require("../db");
const User = require("../models/User");
const logger = require("../logger");

function verifyToken(token) {
  const secret = process.env.APP_SECRET || "changeme_secret";
  const [payloadB64, signature] = String(token || "").split(".");
  if (!payloadB64 || !signature) return null;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");
  if (expected !== signature) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    );
    if (!payload?.username) return null;
    return payload;
  } catch {
    return null;
  }
}

async function marketUserAuth(req, res, next) {
  req.marketActor = {
    username: null,
    source: "apiKey",
    apiKeyOwner: req.apiKeyOwner || null,
    ip: req.ip,
  };

  const authHeader = req.header("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match)
    return res.status(401).json({ error: "Market user token required" });

  const payload = verifyToken(match[1]);
  if (!payload?.username) {
    logger.warn({ ip: req.ip }, "Rejected invalid market user token");
    return res.status(401).json({ error: "Invalid market user token" });
  }

  try {
    await connectDB();
    const user = await User.findOne({
      username: String(payload.username).toLowerCase().trim(),
      isActive: true,
    }).lean();

    if (!user) {
      logger.warn(
        { username: payload.username, ip: req.ip },
        "Rejected market user token for inactive or missing user",
      );
      return res.status(403).json({ error: "Inactive market user" });
    }

    req.marketActor = {
      username: user.username,
      source: "token",
      apiKeyOwner: req.apiKeyOwner || null,
      ip: req.ip,
    };
  } catch (err) {
    logger.error({ err }, "marketUserAuth error");
    return res.status(503).json({ error: "Market authorization unavailable" });
  }

  return next();
}

module.exports = marketUserAuth;
