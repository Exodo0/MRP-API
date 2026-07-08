const crypto = require("crypto");
const Joi = require("joi");
const logger = require("../logger");
const ApiKey = require("../models/ApiKey");
const User = require("../models/User");

// ── Schemas ──────────────────────────────────────────────────────────────────

const createKeySchema = Joi.object({
  owner: Joi.string().trim().min(1).max(100).required(),
  key: Joi.string().trim().min(8).max(128).optional(),
});

const createUserSchema = Joi.object({
  username: Joi.string().trim().min(1).max(50).required(),
});

const listKeysSchema = Joi.object({
  owner: Joi.string().trim().optional(),
  isActive: Joi.boolean().optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
});

const listUsersSchema = Joi.object({
  isActive: Joi.boolean().optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateKey() {
  return crypto.randomBytes(32).toString("hex");
}

function randomPassword(len = 16) {
  return crypto.randomBytes(len).toString("base64url").slice(0, len);
}

// ── Controllers ──────────────────────────────────────────────────────────────

const createApiKey = async (req, res) => {
  const { error, value } = createKeySchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const key = value.key || generateKey();
    const newKey = await ApiKey.create({ owner: value.owner, key });

    logger.info({ owner: value.owner }, "API key created via admin");
    return res.status(201).json({
      id: newKey._id,
      owner: newKey.owner,
      key: newKey.key,
      isActive: newKey.isActive,
      createdAt: newKey.createdAt,
    });
  } catch (err) {
    logger.error({ err }, "createApiKey error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const listApiKeys = async (req, res) => {
  const { error, value } = listKeysSchema.validate(req.query);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const filter = {};
    if (value.owner) filter.owner = value.owner;
    if (value.isActive !== undefined) filter.isActive = value.isActive;

    const keys = await ApiKey.find(filter)
      .select("-__v")
      .sort({ createdAt: -1 })
      .limit(value.limit)
      .lean();

    return res.json({ count: keys.length, keys });
  } catch (err) {
    logger.error({ err }, "listApiKeys error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const toggleApiKey = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "ID is required" });

  try {
    const key = await ApiKey.findById(id);
    if (!key) return res.status(404).json({ error: "API key not found" });

    key.isActive = !key.isActive;
    await key.save();

    logger.info({ id, isActive: key.isActive }, "API key toggled");
    return res.json({ id: key._id, owner: key.owner, isActive: key.isActive });
  } catch (err) {
    logger.error({ err }, "toggleApiKey error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteApiKey = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "ID is required" });

  try {
    const key = await ApiKey.findByIdAndDelete(id);
    if (!key) return res.status(404).json({ error: "API key not found" });

    logger.info({ id, owner: key.owner }, "API key deleted");
    return res.json({ ok: true, deleted: { id: key._id, owner: key.owner } });
  } catch (err) {
    logger.error({ err }, "deleteApiKey error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const createUser = async (req, res) => {
  const { error, value } = createUserSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const username = value.username.toLowerCase().trim();

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ error: `User "${username}" already exists` });
    }

    const password = randomPassword(16);
    const passwordHash = User.hashPassword(password);
    const newUser = await User.create({ username, passwordHash });

    logger.info({ username }, "User created via admin");
    return res.status(201).json({
      id: newUser._id,
      username: newUser.username,
      password,
      isActive: newUser.isActive,
      createdAt: newUser.createdAt,
    });
  } catch (err) {
    logger.error({ err }, "createUser error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const listUsers = async (req, res) => {
  const { error, value } = listUsersSchema.validate(req.query);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const filter = {};
    if (value.isActive !== undefined) filter.isActive = value.isActive;

    const users = await User.find(filter)
      .select("-passwordHash -__v")
      .sort({ createdAt: -1 })
      .limit(value.limit)
      .lean();

    return res.json({ count: users.length, users });
  } catch (err) {
    logger.error({ err }, "listUsers error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const toggleUser = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "ID is required" });

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.isActive = !user.isActive;
    await user.save();

    logger.info({ id, username: user.username, isActive: user.isActive }, "User toggled");
    return res.json({ id: user._id, username: user.username, isActive: user.isActive });
  } catch (err) {
    logger.error({ err }, "toggleUser error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteUser = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "ID is required" });

  try {
    const user = await User.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ error: "User not found" });

    logger.info({ id, username: user.username }, "User deleted");
    return res.json({ ok: true, deleted: { id: user._id, username: user.username } });
  } catch (err) {
    logger.error({ err }, "deleteUser error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  createApiKey,
  listApiKeys,
  toggleApiKey,
  deleteApiKey,
  createUser,
  listUsers,
  toggleUser,
  deleteUser,
};
