const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { GUILD_ID: DEFAULT_GUILD_ID } = require("../config");
const logger = require("../logger");
const CliLoginSession = require("../models/CliLoginSession");
const CliRefreshToken = require("../models/CliRefreshToken");
const StaffPermisos = require("../models/StaffPermisos");

const LOGIN_TTL_MS = 5 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
const guildId = () => process.env.GUILD_ID || DEFAULT_GUILD_ID;
const redirectUri = () => process.env.DISCORD_REDIRECT_URI;

function requiredConfig() {
  return ["CLIENT_ID", "CLIENT_SECRET", "CLI_JWT_SECRET", "DISCORD_TOKEN", "DISCORD_REDIRECT_URI"]
    .filter((name) => !process.env[name]);
}

function configuredRoleIds(config) {
  const envIds = (process.env.CLI_ALLOWED_ROLE_IDS || "").split(",").map((id) => id.trim()).filter(Boolean);
  const group = config?.Groups?.get ? config.Groups.get("cli_access") : config?.Groups?.cli_access;
  return new Set([...envIds, ...(group || []).map((role) => role.roleId)]);
}

async function fetchGuildMember(discordId) {
  const response = await fetch(`https://discord.com/api/v10/guilds/${guildId()}/members/${discordId}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Discord member lookup failed with HTTP ${response.status}`);
  return response.json();
}

async function authorizeMember(discordId) {
  const [member, config] = await Promise.all([
    fetchGuildMember(discordId),
    StaffPermisos.findOne({ GuildId: guildId() }).lean(),
  ]);
  if (!member) return { allowed: false, reason: "No perteneces al servidor configurado." };
  const allowedIds = configuredRoleIds(config);
  if (!member.roles.some((roleId) => allowedIds.has(roleId))) {
    return { allowed: false, reason: "No tienes un rol autorizado para usar el CLI." };
  }
  return { allowed: true, roles: member.roles };
}

function issueAccessToken(user) {
  return jwt.sign(
    { type: "cli", username: user.username, guildId: guildId() },
    process.env.CLI_JWT_SECRET,
    { algorithm: "HS256", subject: user.discordId, issuer: "mxrp-api", audience: "mxrp-cli", expiresIn: "15m" },
  );
}

async function issueTokenPair(user) {
  const refreshToken = randomToken(48);
  await CliRefreshToken.create({
    tokenHash: hash(refreshToken), discordId: user.discordId, username: user.username,
    avatar: user.avatar, expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return { accessToken: issueAccessToken(user), refreshToken, expiresIn: 900, user };
}

async function startLogin(req, res) {
  const missing = requiredConfig();
  if (missing.length) return res.status(503).json({ error: `Missing CLI auth configuration: ${missing.join(", ")}` });
  try {
    const loginId = randomToken(18);
    const pollSecret = randomToken();
    const state = randomToken();
    await CliLoginSession.create({
      loginId, pollSecretHash: hash(pollSecret), stateHash: hash(state),
      expiresAt: new Date(Date.now() + LOGIN_TTL_MS),
    });
    const params = new URLSearchParams({
      response_type: "code", client_id: process.env.CLIENT_ID, scope: "identify",
      redirect_uri: redirectUri(), state, prompt: "consent",
    });
    return res.status(201).json({
      loginId, pollSecret, authorizationUrl: `https://discord.com/oauth2/authorize?${params}`,
      expiresIn: LOGIN_TTL_MS / 1000,
    });
  } catch (error) {
    logger.error({ err: error }, "CLI login start failed");
    return res.status(500).json({ error: "Could not start Discord login" });
  }
}

function callbackPage(success, message) {
  const color = success ? "#23a55a" : "#da373c";
  const safeMessage = String(message).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>MXRP CLI</title><body style="font:16px system-ui;background:#1e1f22;color:#eee;display:grid;place-items:center;height:100vh"><main style="max-width:560px;padding:32px;border:1px solid #444;border-radius:12px"><h1 style="color:${color}">${success ? "Acceso autorizado" : "Acceso rechazado"}</h1><p>${safeMessage}</p><p>Ya puedes cerrar esta ventana y volver al CLI.</p></main></body></html>`;
}

async function discordCallback(req, res) {
  const { code, state, error: oauthError } = req.query;
  if (!state) return res.status(400).send(callbackPage(false, "Falta el estado de seguridad."));
  const session = await CliLoginSession.findOne({ stateHash: hash(state), status: "pending", expiresAt: { $gt: new Date() } });
  if (!session) return res.status(400).send(callbackPage(false, "La solicitud expiró o ya fue utilizada."));
  if (oauthError || !code) {
    session.status = "denied"; session.error = "Autorización cancelada en Discord."; await session.save();
    return res.status(400).send(callbackPage(false, session.error));
  }
  try {
    const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code", code, redirect_uri: redirectUri(),
        client_id: process.env.CLIENT_ID, client_secret: process.env.CLIENT_SECRET,
      }),
    });
    if (!tokenResponse.ok) throw new Error(`Discord token exchange failed with HTTP ${tokenResponse.status}`);
    const discordTokens = await tokenResponse.json();
    const userResponse = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${discordTokens.access_token}` },
    });
    if (!userResponse.ok) throw new Error(`Discord user lookup failed with HTTP ${userResponse.status}`);
    const user = await userResponse.json();
    const authorization = await authorizeMember(user.id);
    if (!authorization.allowed) {
      session.status = "denied"; session.error = authorization.reason; await session.save();
      return res.status(403).send(callbackPage(false, authorization.reason));
    }
    session.status = "approved";
    session.user = { discordId: user.id, username: user.global_name || user.username, avatar: user.avatar, roleIds: authorization.roles };
    await session.save();
    return res.send(callbackPage(true, `Sesión iniciada como ${session.user.username}.`));
  } catch (error) {
    logger.error({ err: error }, "Discord CLI callback failed");
    session.status = "denied"; session.error = "Discord no pudo completar la autenticación."; await session.save();
    return res.status(502).send(callbackPage(false, session.error));
  }
}

async function loginStatus(req, res) {
  const session = await CliLoginSession.findOne({ loginId: req.params.loginId });
  if (!session || session.expiresAt <= new Date()) return res.status(410).json({ error: "Login request expired" });
  if (!req.header("x-login-secret") || hash(req.header("x-login-secret")) !== session.pollSecretHash) {
    return res.status(403).json({ error: "Invalid login secret" });
  }
  if (session.status === "pending" || session.status === "issuing") return res.status(202).json({ status: "pending" });
  if (session.status === "denied") return res.status(403).json({ status: "denied", error: session.error });
  if (session.status !== "approved") return res.status(410).json({ error: "Login result already consumed" });
  const claimed = await CliLoginSession.findOneAndUpdate(
    { _id: session._id, status: "approved" }, { $set: { status: "issuing" } }, { new: false },
  );
  if (!claimed) return res.status(410).json({ error: "Login result already consumed" });
  try {
    const pair = await issueTokenPair(claimed.user.toObject());
    await CliLoginSession.updateOne({ _id: session._id, status: "issuing" }, { $set: { status: "consumed" } });
    return res.json({ status: "approved", ...pair });
  } catch (error) {
    await CliLoginSession.updateOne({ _id: session._id, status: "issuing" }, { $set: { status: "approved" } });
    throw error;
  }
}

async function refresh(req, res) {
  const rawToken = req.body?.refreshToken;
  if (!rawToken) return res.status(400).json({ error: "Refresh token is required" });
  const existing = await CliRefreshToken.findOneAndUpdate(
    { tokenHash: hash(rawToken), revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { revokedAt: new Date() } },
    { new: false },
  );
  if (!existing) return res.status(401).json({ error: "Invalid or expired refresh token" });
  try {
    const authorization = await authorizeMember(existing.discordId);
    if (!authorization.allowed) {
      return res.status(403).json({ error: authorization.reason });
    }
    const pair = await issueTokenPair({ discordId: existing.discordId, username: existing.username, avatar: existing.avatar });
    await CliRefreshToken.updateOne(
      { _id: existing._id }, { $set: { replacedByHash: hash(pair.refreshToken) } },
    );
    return res.json(pair);
  } catch (error) {
    logger.error({ err: error }, "CLI refresh failed");
    return res.status(502).json({ error: "Could not verify Discord membership" });
  }
}

async function logout(req, res) {
  const rawToken = req.body?.refreshToken;
  if (rawToken) await CliRefreshToken.updateOne(
    { tokenHash: hash(rawToken), revokedAt: null }, { $set: { revokedAt: new Date() } },
  );
  return res.json({ ok: true });
}

function me(req, res) {
  return res.json({ user: req.cliUser });
}

module.exports = { startLogin, discordCallback, loginStatus, refresh, logout, me };
