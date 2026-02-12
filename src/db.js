require("dotenv").config();
const mongoose = require("mongoose");

let connectPromise = null;

const connectDB = async () => {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error("DATABASE_URL not set");

  if (mongoose.connection.readyState === 1) return mongoose;
  if (!connectPromise) {
    connectPromise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 5000,
      })
      .catch((err) => {
        connectPromise = null;
        throw err;
      });
  }

  await connectPromise;
  return mongoose;
};

module.exports = { mongoose, connectDB };
