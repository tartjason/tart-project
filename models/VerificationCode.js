const mongoose = require('mongoose');

const verificationCodeSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  code: { type: String, required: true }, // 6-digit string
  purpose: { type: String, default: 'login' },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 5 },
  resendAvailableAt: { type: Date, default: () => new Date(0) }, // cooldown
  lockedUntil: { type: Date, default: () => new Date(0) },
  expiresAt: { type: Date, required: true }, // 10m TTL
  meta: { type: Object, default: {} }
}, { timestamps: true });

// TTL index for expiry
verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.VerificationCode || mongoose.model('VerificationCode', verificationCodeSchema);
