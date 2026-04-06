require("dotenv").config();
const mongoose = require("mongoose");
const logger   = require("./logger");

const uri    = process.env.MONGO_URI_WEB;
const dbName = process.env.MONGO_DB_WEB_NAME || "MXRP";

if (!uri) {
  logger.error("MONGO_URI_WEB is not set — /v1/market endpoints will fail. Set it with: fly secrets set MONGO_URI_WEB=...");
}

// Conexión dedicada para la DB de MXRP (market/tienda).
// Separada de DATABASE_URL (MXRPAPI) para no mezclar bases de datos.
const webConn = mongoose.createConnection(uri || "mongodb://127.0.0.1/noop", {
  dbName,
  serverSelectionTimeoutMS: 5000,
});

webConn.on("connected",    () => logger.info("MongoDB MXRP-Web connected"));
webConn.on("error",   (err) => logger.error({ err }, "MongoDB MXRP-Web error"));
webConn.on("disconnected", () => logger.warn("MongoDB MXRP-Web disconnected"));

module.exports = webConn;
