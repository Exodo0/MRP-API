require("dotenv").config();
const { MongoClient } = require("mongodb");
const logger = require("./logger");

const uri    = process.env.MONGO_URI_WEB;
const dbName = process.env.MONGO_DB_WEB_NAME || "MXRP";

if (!uri) throw new Error("MONGO_URI_WEB not set in .env");

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });

let connected = false;

async function connectWebDB() {
  if (connected) return;
  await client.connect();
  connected = true;
  logger.info("MongoDB MXRP-Web connected");
}

function getWebDb() {
  if (!connected) throw new Error("WebDB not connected yet. Call connectWebDB() first.");
  return client.db(dbName);
}

module.exports = { connectWebDB, getWebDb };
