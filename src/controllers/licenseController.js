const { client } = require("../discord/client");
const { ROLES, GUILD_ID } = require("../config");
const Joi = require("joi");

const schema = Joi.object({
  userId: Joi.string().required(),
  license: Joi.string()
    .valid(...Object.keys(ROLES))
    .required(),
  action: Joi.string().valid("add", "remove").required(),
});

const updateLicense = async (req, res) => {
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  const { userId, license, action } = value;

  const roleId = ROLES[license];
  if (!roleId) {
    return res
      .status(400)
      .json({ error: `License role "${license}" not found in configuration.` });
  }

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    if (!guild) {
      return res
        .status(500)
        .json({ error: "Guild not found (Bot not in server?)." });
    }

    const member = await guild.members.fetch(userId);
    if (!member) {
      return res
        .status(404)
        .json({ error: "User not found in the Discord server." });
    }

    if (action === "add") {
      await member.roles.add(roleId);
      return res
        .status(200)
        .json({ message: `Role ${license} added to user ${userId}.` });
    } else {
      await member.roles.remove(roleId);
      return res
        .status(200)
        .json({ message: `Role ${license} removed from user ${userId}.` });
    }
  } catch (error) {
    console.error("Error updating license:", error);
    if (error.code === 10007) {
      return res
        .status(404)
        .json({ error: "User not found in the Discord server." });
    }
    return res
      .status(500)
      .json({ error: "Internal Server Error processing Discord request." });
  }
};

module.exports = { updateLicense };
