const { Client, GatewayIntentBits } = require("discord.js");
require("dotenv").config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once("clientReady", () => {
  console.log(`Discord Bot logged in as ${client.user.tag}`);
});

const startDiscordBot = async () => {
  try {
    if (!process.env.DISCORD_TOKEN) {
      console.warn("DISCORD_TOKEN is missing in .env");
      return;
    }
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    console.error("Failed to login to Discord:", error);
  }
};

module.exports = { client, startDiscordBot };
