const { connectDB } = require("../db");
const ApiKey = require("../models/ApiKey");

const apiKeyAuth = async (req, res, next) => {
  const apiKey = req.header("x-api-key");

  if (!apiKey) {
    return res
      .status(401)
      .json({ error: "Access denied. No API Key provided." });
  }

  try {
    await connectDB();
    const validKey = await ApiKey.findOne({ key: apiKey }).lean();

    if (!validKey || !validKey.isActive) {
      return res.status(403).json({ error: "Invalid or inactive API Key." });
    }

    // Attach key info to request if needed
    req.apiKeyOwner = validKey.owner;
    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = apiKeyAuth;
