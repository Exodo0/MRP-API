const dotenv = require("dotenv");
dotenv.config();

const app = require("./src/app");
const { startDiscordBot } = require("./src/discord/client");
const { connectDB } = require("./src/db");

const PORT = process.env.PORT || 3000;

const start = async () => {
  // 1. Connect to MongoDB
  await connectDB();

  // 2. Start Discord Bot
  await startDiscordBot();

  // 3. Start Express Server
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

start();
