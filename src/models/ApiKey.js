const { mongoose } = require('../db');

const apiKeySchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true, index: true },
  owner: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('ApiKey', apiKeySchema);
