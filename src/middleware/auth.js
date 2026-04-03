const { connectDB } = require("../db");
const ApiKey = require("../models/ApiKey");
const logger = require("../logger");

const apiKeyAuth = async (req, res, next) => {
  const apiKey = req.header("x-api-key");

  if (!apiKey) {
    return res.status(401).json({ error: "Access denied. No API Key provided." });
  }

  try {
    await connectDB();
    const validKey = await ApiKey.findOne({ key: apiKey }).lean();

    if (!validKey || !validKey.isActive) {
      logger.warn({ ip: req.ip }, "Rejected invalid or inactive API key");
      return res.status(403).json({ error: "Invalid or inactive API Key." });
    }

    req.apiKeyOwner = validKey.owner;
    next();
  } catch (err) {
    logger.error({ err }, "Auth middleware error");
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = apiKeyAuth;
