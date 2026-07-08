const logger = require("../logger");

const adminAuth = (req, res, next) => {
  const adminKey = req.header("x-admin-key");
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!expectedKey) {
    logger.error("ADMIN_API_KEY not configured");
    return res.status(500).json({ error: "Admin auth not configured" });
  }

  if (!adminKey) {
    return res.status(401).json({ error: "Access denied. No admin key provided." });
  }

  if (adminKey !== expectedKey) {
    logger.warn({ ip: req.ip }, "Invalid admin key attempt");
    return res.status(403).json({ error: "Invalid admin key." });
  }

  next();
};

module.exports = adminAuth;
