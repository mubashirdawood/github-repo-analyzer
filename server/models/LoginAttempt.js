import mongoose from 'mongoose';

/**
 * Audit trail for login attempts (success and failure).
 */
const loginAttemptSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    success: {
      type: Boolean,
      required: true,
      index: true,
    },
    reason: {
      type: String,
      default: null,
    },
    ip: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

loginAttemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }); // 90 days

const LoginAttempt = mongoose.model('LoginAttempt', loginAttemptSchema);
export default LoginAttempt;
