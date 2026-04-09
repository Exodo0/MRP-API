const { mongoose } = require('../db');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true, index: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// Hash SHA-256 simple (sin dependencias externas)
userSchema.statics.hashPassword = function (plain) {
  return crypto.createHash('sha256').update(plain).digest('hex');
};

userSchema.methods.verifyPassword = function (plain) {
  const hash = crypto.createHash('sha256').update(plain).digest('hex');
  return hash === this.passwordHash;
};

module.exports = mongoose.model('User', userSchema);
