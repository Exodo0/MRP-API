const { Client, GatewayIntentBits } = require("discord.js");
require("dotenv").config();
const logger = require("../logger");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once("clientReady", () => {
  logger.info({ tag: client.user.tag }, "Discord Bot ready");
});

const startDiscordBot = async () => {
  if (!process.env.DISCORD_TOKEN) {
    logger.warn("DISCORD_TOKEN not set — bot will not start");
    return;
  }
  try {
    await client.login(process.env.DISCORD_TOKEN);
  } catch (err) {
    logger.error({ err }, "Failed to login to Discord");
    throw err; // propaga el error para que index.js lo capture
  }
};

module.exports = { client, startDiscordBot };
