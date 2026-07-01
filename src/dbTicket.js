require("dotenv").config();
const mongoose = require("mongoose");
const logger = require("./logger");

const uri = process.env.MONGO_URI_TICKETS || process.env.MONGO_URI;

if (!uri) {
  logger.error("MONGO_URI_TICKETS (or MONGO_URI) is not set — ticket endpoints will fail.");
}

const ticketConn = mongoose.createConnection(uri || "mongodb://127.0.0.1/noop", {
  dbName: process.env.MONGO_DB_TICKETS_NAME || "MXRP",
  serverSelectionTimeoutMS: 5000,
});

ticketConn.on("connected", () => logger.info("MongoDB MXRP-Tickets connected"));
ticketConn.on("error", (err) => logger.error({ err }, "MongoDB MXRP-Tickets error"));
ticketConn.on("disconnected", () => logger.warn("MongoDB MXRP-Tickets disconnected"));

module.exports = ticketConn;
