import mongoose from 'mongoose';

/**
 * Per-device login session. refreshToken stores a SHA-256 hash of the raw token.
 * expiresAt TTL index auto-removes expired sessions.
 */
const userSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  device: {
    type: String,
    default: 'Unknown device',
  },
  browser: {
    type: String,
    default: 'Unknown',
  },
  os: {
    type: String,
    default: 'Unknown',
  },
  ip: {
    type: String,
    default: null,
  },
  loginTime: {
    type: Date,
    default: Date.now,
  },
  lastActive: {
    type: Date,
    default: Date.now,
    index: true,
  },
  /** SHA-256 hash of the refresh token — never store the raw value. */
  refreshToken: {
    type: String,
    required: true,
    select: false,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  userAgent: {
    type: String,
    default: null,
  },
  rememberMe: {
    type: Boolean,
    default: false,
  },
});

// Automatically remove expired sessions from MongoDB
userSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const UserSession = mongoose.model('UserSession', userSessionSchema);
export default UserSession;
