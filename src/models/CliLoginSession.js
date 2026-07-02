const { mongoose } = require("../db");

const cliLoginSessionSchema = new mongoose.Schema(
  {
    loginId: { type: String, required: true, unique: true, index: true },
    pollSecretHash: { type: String, required: true },
    stateHash: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ["pending", "approved", "issuing", "denied", "consumed"], default: "pending" },
    user: {
      discordId: String,
      username: String,
      avatar: String,
      roleIds: [String],
    },
    error: String,
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true, collection: "cliloginsessions" },
);

module.exports = mongoose.models.CliLoginSession || mongoose.model("CliLoginSession", cliLoginSessionSchema);
