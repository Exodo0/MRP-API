/**
 * Middleware que captura el body raw antes de que bodyParser lo parsee.
 * Necesario para la verificación de firma Ed25519 de ER:LC.
 */
const rawBodySaver = (req, res, buf, encoding) => {
  if (buf && buf.length) {
    req.rawBody = buf;
  }
};

module.exports = rawBodySaver;
