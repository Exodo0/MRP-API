const { connectDB } = require('../db');
const User = require('../models/User');
const logger = require('../logger');
const crypto = require('crypto');

// Token simple: HMAC-SHA256 firmado con APP_SECRET
function generateToken(username) {
  const secret = process.env.APP_SECRET || 'changeme_secret';
  const payload = JSON.stringify({ username, iat: Date.now() });
  const b64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

const login = async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });
  }

  try {
    await connectDB();
    const user = await User.findOne({ username: username.toLowerCase().trim() });

    if (!user || !user.isActive) {
      logger.warn({ username, ip: req.ip }, 'Login failed: user not found or inactive');
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const valid = user.verifyPassword(password);
    if (!valid) {
      logger.warn({ username, ip: req.ip }, 'Login failed: wrong password');
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const token = generateToken(user.username);
    logger.info({ username: user.username }, 'Login successful');
    return res.status(200).json({ ok: true, token, username: user.username });
  } catch (err) {
    logger.error({ err }, 'Auth login error');
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

module.exports = { login };
