import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  /** Set on email/password signup and password reset. */
  passwordHash: {
    type: String,
  },
  /** Auth provider — kept for legacy documents; new accounts use 'local'. */
  provider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local',
  },
  /** Legacy Google OAuth id (unused after Google sign-in removal). */
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  profilePicture: {
    type: String,
    default: null,
  },
  /**
   * Default true so existing accounts (created before email verification)
   * keep working. New signups explicitly set this to false.
   */
  emailVerified: {
    type: Boolean,
    default: true,
  },
  /** SHA-256 hash of the raw verification token — never store or return the raw token. */
  verificationToken: {
    type: String,
    default: null,
    select: false,
    index: true,
  },
  verificationTokenExpires: {
    type: Date,
    default: null,
    select: false,
  },
  /** SHA-256 hash of the raw password-reset token — never store or return the raw token. */
  resetPasswordToken: {
    type: String,
    default: null,
    select: false,
    index: true,
  },
  resetPasswordExpires: {
    type: Date,
    default: null,
    select: false,
  },
  /** Consecutive failed password logins (reset on success). */
  failedLoginAttempts: {
    type: Number,
    default: 0,
    select: false,
  },
  /** If set and in the future, password login is blocked. */
  lockUntil: {
    type: Date,
    default: null,
    select: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const User = mongoose.model('User', userSchema);
export default User;
