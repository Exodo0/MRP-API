const express = require("express");
const bodyParser = require("body-parser");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const semoviRoutes = require("./routes/v1/semovi");
const marketRoutes = require("./routes/v1/market");
const authRoutes = require("./routes/v1/auth");
const dashboardRoutes = require("./routes/v1/dashboard");
const webhookRoutes = require("./routes/v1/webhook");
const ticketRoutes = require("./routes/v1/ticket");
const staffPermissionsRoutes = require("./routes/v1/staffPermissions");
const cliAuthRoutes = require("./routes/v1/cliAuth");
const recordsRoutes = require("./routes/v1/records");
const adminRoutes = require("./routes/v1/admin");
const storeAdminRoutes = require("./routes/v1/storeAdmin");
const apiKeyAuth = require("./middleware/auth");
const cliAuth = require("./middleware/cliAuth");
const adminAuth = require("./middleware/adminAuth");
const marketUserAuth = require("./middleware/marketUserAuth");
const rawBodySaver = require("./middleware/rawBody");
const logger = require("./logger");

const app = express();

app.set("trust proxy", 1);

app.use(express.static("public"));

app.use(bodyParser.json({ verify: rawBodySaver }));
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://unpkg.com",
        ],
        "style-src": ["'self'", "'unsafe-inline'"],
        "connect-src": ["'self'"],
      },
    },
  }),
);
app.use(cors());

const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use("/v1", limiter);

// Health check — no requiere auth, usado por la plataforma de despliegue.
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

app.get("/", (req, res) => {
  res.send("MXRP API is running.");
});

app.use("/v1/auth", authRoutes); // público — sin x-api-key
app.use("/v1/cli-auth", cliAuthRoutes);
app.use("/v1/semovi", apiKeyAuth, semoviRoutes);
app.use("/v1/market", apiKeyAuth, marketUserAuth, marketRoutes);
app.use("/v1/dashboard", dashboardRoutes); // Dashboard — JWT auth
app.use("/v1/webhook", webhookRoutes); // ER:LC Event Webhook
app.use("/v1/tickets", apiKeyAuth, cliAuth, ticketRoutes);
app.use("/v1/staff-permissions", apiKeyAuth, cliAuth, staffPermissionsRoutes);
app.use("/v1/records", apiKeyAuth, recordsRoutes);
app.use("/v1/admin", adminAuth, adminRoutes);
app.use("/v1/store-admin", apiKeyAuth, cliAuth, storeAdminRoutes);

// Global error handler — captura errores que lleguen con next(err)
app.use((err, req, res, _next) => {
  logger.error({ err, method: req.method, url: req.url }, "Unhandled error");
  res.status(500).json({ error: "Internal Server Error" });
});

module.exports = app;
