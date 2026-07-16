const dotenv = require("dotenv");
const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);

dotenv.config();

const logger = require("./src/logger");
const app = require("./src/app");
const { connectDB } = require("./src/db");
const { connectWebDb } = require("./src/dbWebConn");
const { initWebhookKey } = require("./src/controllers/webhookController");

const PORT = process.env.PORT || 3000;

const start = async () => {
  // 1. Connect to MongoDB
  await connectDB();

  // 2. Connect explicitly to the economy/store database.
  await connectWebDb();

  // 3. Load ER:LC webhook public key
  await initWebhookKey();

  // 4. Start Express Server
  app.listen(PORT, () => {
    logger.info({ port: PORT }, "Server is running");
  });
};

// Catch unhandled promise rejections
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
  process.exit(1);
});

// Catch uncaught exceptions
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  process.exit(1);
});

start().catch((err) => {
  logger.fatal({ err }, "Failed to start server");
  process.exit(1);
});
