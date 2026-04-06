const express = require("express");
const bodyParser = require("body-parser");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const safRoutes    = require("./routes/v1/saf");
const marketRoutes = require("./routes/v1/market");
const apiKeyAuth = require("./middleware/auth");
const logger = require("./logger");

const app = express();

// Fly.io (y cualquier proxy inverso) añade X-Forwarded-For.
// Sin esto, express-rate-limit lanza ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
app.set('trust proxy', 1);

app.use(bodyParser.json());
app.use(helmet());
app.use(cors());

const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use("/v1", limiter);

// Health check — no requiere auth, usado por Fly.io para mantener la máquina viva
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

app.get("/", (req, res) => {
  res.send("MXRP API is running.");
});

app.use("/v1/saf",    apiKeyAuth, safRoutes);
app.use("/v1/market", apiKeyAuth, marketRoutes);

// Global error handler — captura errores que lleguen con next(err)
app.use((err, req, res, next) => {
  logger.error({ err, method: req.method, url: req.url }, "Unhandled error");
  res.status(500).json({ error: "Internal Server Error" });
});

module.exports = app;
