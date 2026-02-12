const { connectDB, mongoose } = require("../src/db");
const ApiKey = require("../src/models/ApiKey");
const crypto = require("crypto");

const generateKey = () => {
  return crypto.randomBytes(32).toString("hex");
};

const createKey = async () => {
  const args = process.argv.slice(2);
  const owner = args[0];

  if (!owner) {
    console.error("Usage: node scripts/create-key.js <owner> [custom-key]");
    process.exit(1);
  }

  const key = args[1] || generateKey();

  try {
    await connectDB();
    const newKey = await ApiKey.create({ owner, key });
    console.log("API Key Created Successfully:");
    console.log(newKey);
  } catch (error) {
    console.error("Error creating API Key:", error);
  } finally {
    await mongoose.connection.close();
  }
};

createKey();
