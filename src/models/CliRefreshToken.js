const { mongoose } = require("../db");

const cliRefreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    discordId: { type: String, required: true, index: true },
    username: { type: String, required: true },
    avatar: String,
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    revokedAt: Date,
    replacedByHash: String,
  },
  { timestamps: true, collection: "clirefreshtokens" },
);

module.exports = mongoose.models.CliRefreshToken || mongoose.model("CliRefreshToken", cliRefreshTokenSchema);
