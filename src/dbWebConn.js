const mongoose = require("mongoose");
const logger = require("./logger");

// Conexión dedicada para la DB de MXRP (market/tienda).
// Se crea desconectada: importar modelos, ejecutar lint o pruebas nunca debe abrir red.
const webConn = mongoose.createConnection();
let connectionPromise = null;

async function connectWebDb() {
  if (webConn.readyState === 1) return webConn;
  if (connectionPromise) return connectionPromise;

  const uri = process.env.MONGO_URI_WEB;
  if (!uri) throw new Error("MONGO_URI_WEB is not set");

  connectionPromise = webConn
    .openUri(uri, {
      dbName: process.env.MONGO_DB_WEB_NAME || "MXRP",
      serverSelectionTimeoutMS: 5000,
      autoIndex: process.env.NODE_ENV !== "production",
    })
    .then(() => webConn)
    .catch((error) => {
      connectionPromise = null;
      throw error;
    });
  return connectionPromise;
}

webConn.on("connected", () => logger.info("MongoDB MXRP-Web connected"));
webConn.on("error", (err) => logger.error({ err }, "MongoDB MXRP-Web error"));
webConn.on("disconnected", () => logger.warn("MongoDB MXRP-Web disconnected"));

module.exports = webConn;
module.exports.connectWebDb = connectWebDb;
