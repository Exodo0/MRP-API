require("dotenv").config();
const mongoose = require("mongoose");
const logger   = require("./logger");

// Conexión dedicada para la DB de MXRP (market/tienda)
// Separada de DATABASE_URL (MXRPAPI) para no mezclar bases de datos.
const webConn = mongoose.createConnection(process.env.MONGO_URI_WEB, {
  dbName:                   process.env.MONGO_DB_WEB_NAME || "MXRP",
  serverSelectionTimeoutMS: 5000,
});

webConn.on("connected",    () => logger.info("MongoDB MXRP-Web connected"));
webConn.on("error",   (err) => logger.error({ err }, "MongoDB MXRP-Web error"));
webConn.on("disconnected", () => logger.warn("MongoDB MXRP-Web disconnected"));

module.exports = webConn;
