require("dotenv").config();
const mongoose = require("mongoose");
const logger = require("./logger");

let connectPromise = null;

const connectDB = async () => {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error("DATABASE_URL not set");

  if (mongoose.connection.readyState === 1) return mongoose;

  if (!connectPromise) {
    logger.info("Connecting to MongoDB...");
    connectPromise = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 5000 })
      .then((m) => {
        logger.info("MongoDB connected");
        return m;
      })
      .catch((err) => {
        connectPromise = null;
        logger.error({ err }, "MongoDB connection failed");
        throw err;
      });
  }

  await connectPromise;
  return mongoose;
};

module.exports = { mongoose, connectDB };
