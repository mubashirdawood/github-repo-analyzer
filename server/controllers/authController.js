import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import LoginAttempt from '../models/LoginAttempt.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/mailService.js';
import { normalizeEmail, validateStrongPassword } from '../utils/authValidation.js';
import { createUserSession, revokeAllSessions } from '../services/sessionService.js';
import { 
  setAuthCookies,
  resolveTokenExpiry,
  resolveSessionTtlMs,
} from '../utils/authCookies.js';

const SALT_ROUNDS = 12;
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const GENERIC_LOGIN_ERROR = 'Invalid email or password';

/** Dummy hash so unknown-email logins still burn bcrypt time (timing parity). */
const DUMMY_PASSWORD_HASH =
  '$2b$12$rseCZD2wjp68bsJCtT6B.ur3YHiFUMomfmuYLoptBX2vVdT82IxXW';

function signToken(userId, { sessionId, expiresIn } = {}) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set in environment');
  }
  const payload = { userId: String(userId) };
  if (sessionId) {
    payload.sid = String(sessionId);
  }
  return jwt.sign(payload, secret, {
    expiresIn: expiresIn || resolveTokenExpiry(false),
    algorithm: 'HS256',
  });
}

export { signToken };

function getClientUrl() {
  return (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function getRequestMeta(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) ||
    req.ip ||
    req.socket?.remoteAddress ||
    null;
  const userAgent = req.headers['user-agent'] || null;
  return { ip, userAgent };
}

async function auditLoginAttempt({ email, success, reason, userId, req }) {
  try {
    const { ip, userAgent } = getRequestMeta(req);
    await LoginAttempt.create({
      email,
      success,
      reason: reason || null,
      ip,
      userAgent,
      userId: userId || null,
    });
  } catch (err) {
    console.error('[auth] failed to audit login attempt:', err.message);
  }
}

function isAccountLocked(user) {
  return Boolean(user.lockUntil && user.lockUntil.getTime() > Date.now());
}

/** Raw token for email link; store only the SHA-256 hash in MongoDB. */
function createSecureToken(ttlMs) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expires = new Date(Date.now() + ttlMs);
  return { rawToken, tokenHash, expires };
}

function createVerificationToken() {
  return createSecureToken(VERIFICATION_TOKEN_TTL_MS);
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

/**
 * POST /api/auth/signup — create unverified user, email a verification link.
 * Does not issue a JWT until the email is verified (login path).
 */
export async function signup(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const emailResult = normalizeEmail(email);
  if (emailResult.error) {
    return res.status(400).json({ error: emailResult.error });
  }
  const normalizedEmail = emailResult.email;

  const passwordError = validateStrongPassword(password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const { rawToken, tokenHash, expires } = createVerificationToken();

  let user;
  try {
    user = await User.create({
      email: normalizedEmail,
      passwordHash,
      provider: 'local',
      emailVerified: false,
      verificationToken: tokenHash,
      verificationTokenExpires: expires,
    });
  } catch (err) {
    // Unique index race — prevent duplicate email registration
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    throw err;
  }

  let emailSent = true;
  try {
    await sendVerificationEmail({
      to: user.email,
      rawToken,
    });
  } catch (mailErr) {
    console.error('[auth] verification email failed:', mailErr.message);
    emailSent = false;
  }

  // Never return the verification token or a JWT here.
  return res.status(201).json({
    message: emailSent
      ? 'Account created. Please check your email to verify your account before logging in.'
      : 'Account created, but we could not send the verification email. Use Resend verification to try again.',
    requiresVerification: true,
    emailSent,
    user: { id: user._id, email: user.email },
  });
}

/**
 * POST /api/auth/login — verify credentials and return JWT.
 * Existing users (emailVerified !== false) continue to work.
 * New unverified users are blocked with 403.
 */
export async function login(req, res) {
  const { email, password, rememberMe: rememberMeRaw } = req.body;
  const rememberMe = Boolean(rememberMeRaw);

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const emailResult = normalizeEmail(email);
  if (emailResult.error) {
    return res.status(400).json({ error: emailResult.error });
  }
  const normalizedEmail = emailResult.email;

  const user = await User.findOne({ email: normalizedEmail }).select(
    '+failedLoginAttempts +lockUntil',
  );

  if (!user) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    await auditLoginAttempt({
      email: normalizedEmail,
      success: false,
      reason: 'unknown_email',
      req,
    });
    return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
  }

  // Clear expired lockouts so the user can try again
  if (user.lockUntil && user.lockUntil.getTime() <= Date.now()) {
    user.lockUntil = null;
    user.failedLoginAttempts = 0;
    await user.save();
  }

  if (isAccountLocked(user)) {
    await auditLoginAttempt({
      email: normalizedEmail,
      success: false,
      reason: 'account_locked',
      userId: user._id,
      req,
    });
    return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
  }

  // Accounts without a local password — keep the same generic error.
  if (!user.passwordHash) {
    await auditLoginAttempt({
      email: normalizedEmail,
      success: false,
      reason: 'no_local_password',
      userId: user._id,
      req,
    });
    return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    const attempts = (user.failedLoginAttempts || 0) + 1;
    user.failedLoginAttempts = attempts;
    if (attempts >= MAX_FAILED_LOGINS) {
      user.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
      user.failedLoginAttempts = 0;
    }
    await user.save();

    await auditLoginAttempt({
      email: normalizedEmail,
      success: false,
      reason: attempts >= MAX_FAILED_LOGINS ? 'locked_after_failures' : 'bad_password',
      userId: user._id,
      req,
    });

    return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
  }

  // Successful password — clear lockout counters
  if (user.failedLoginAttempts || user.lockUntil) {
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();
  }

  // Only block when explicitly unverified (new signups). Legacy users stay allowed.
  if (user.emailVerified === false) {
    await auditLoginAttempt({
      email: normalizedEmail,
      success: false,
      reason: 'email_unverified',
      userId: user._id,
      req,
    });
    return res.status(403).json({
      error: 'Please verify your email before logging in.',
      requiresVerification: true,
    });
  }

  await auditLoginAttempt({
    email: normalizedEmail,
    success: true,
    reason: 'ok',
    userId: user._id,
    req,
  });

  const { session, refreshToken } = await createUserSession(user._id, req, {
    rememberMe,
    ttlMs: resolveSessionTtlMs(rememberMe),
  });
  const token = signToken(user._id, {
    sessionId: session._id,
    expiresIn: resolveTokenExpiry(rememberMe),
  });

  setAuthCookies(res, { accessToken: token, refreshToken, rememberMe });

  return res.status(200).json({
    token,
    refreshToken,
    sessionId: String(session._id),
    expiresIn: resolveTokenExpiry(rememberMe),
    rememberMe,
    user: { id: user._id, email: user.email },
  });
}

/**
 * GET /api/auth/verify-email/:token
 * Validates token, marks email verified, clears token fields, redirects to client.
 */
export async function verifyEmail(req, res) {
  const clientUrl = getClientUrl();
  const rawToken = String(req.params.token || '').trim();

  if (!rawToken || !/^[a-f0-9]{64}$/i.test(rawToken)) {
    return res.redirect(`${clientUrl}/verify-email/failed?reason=invalid`);
  }

  const tokenHash = hashToken(rawToken);
  const user = await User.findOne({ verificationToken: tokenHash }).select(
    '+verificationToken +verificationTokenExpires',
  );

  if (!user) {
    return res.redirect(`${clientUrl}/verify-email/failed?reason=invalid`);
  }

  if (!user.verificationTokenExpires || user.verificationTokenExpires.getTime() < Date.now()) {
    return res.redirect(`${clientUrl}/verify-email/failed?reason=expired`);
  }

  user.emailVerified = true;
  user.verificationToken = null;
  user.verificationTokenExpires = null;
  await user.save();

  return res.redirect(`${clientUrl}/verify-email/success`);
}

/**
 * POST /api/auth/resend-verification — { email }
 * Always returns a generic success message (no email enumeration).
 */
export async function resendVerification(req, res) {
  const { email } = req.body || {};
  const generic = {
    message: 'If an unverified account exists for that email, a new verification link has been sent.',
  };

  const emailResult = normalizeEmail(email);
  if (emailResult.error) {
    return res.status(400).json({ error: emailResult.error });
  }
  const normalizedEmail = emailResult.email;

  const user = await User.findOne({ email: normalizedEmail }).select(
    '+verificationToken +verificationTokenExpires',
  );

  // Already verified or unknown — same response (do not leak account status).
  if (!user || user.emailVerified !== false) {
    return res.status(200).json(generic);
  }

  const { rawToken, tokenHash, expires } = createVerificationToken();
  user.verificationToken = tokenHash;
  user.verificationTokenExpires = expires;
  await user.save();

  try {
    await sendVerificationEmail({
      to: user.email,
      rawToken,
    });
  } catch (mailErr) {
    console.error('[auth] resend verification email failed:', mailErr.message);
    const err = new Error('Failed to send verification email. Please try again later.');
    err.statusCode = mailErr.statusCode || 502;
    err.isOperational = true;
    throw err;
  }

  return res.status(200).json(generic);
}

/**
 * POST /api/auth/forgot-password — { email }
 * Always returns a generic success message (no email enumeration).
 */
export async function forgotPassword(req, res) {
  const { email } = req.body || {};
  const generic = {
    message:
      'If an account exists for that email, a password reset link has been sent. The link expires in 15 minutes.',
  };

  const emailResult = normalizeEmail(email);
  if (emailResult.error) {
    return res.status(400).json({ error: emailResult.error });
  }
  const normalizedEmail = emailResult.email;

  const user = await User.findOne({ email: normalizedEmail }).select(
    '+resetPasswordToken +resetPasswordExpires',
  );

  // Unknown email — same response (do not leak account status).
  if (!user) {
    return res.status(200).json(generic);
  }

  const { rawToken, tokenHash, expires } = createSecureToken(RESET_TOKEN_TTL_MS);
  user.resetPasswordToken = tokenHash;
  user.resetPasswordExpires = expires;
  await user.save();

  try {
    await sendPasswordResetEmail({
      to: user.email,
      rawToken,
    });
  } catch (mailErr) {
    // Do not reveal whether the account exists — log and still return generic success.
    console.error('[auth] password reset email failed:', mailErr.message);
  }

  return res.status(200).json(generic);
}

/**
 * POST /api/auth/reset-password/:token — { password }
 * Validates token + expiry, sets new bcrypt hash, clears reset fields.
 */
export async function resetPassword(req, res) {
  const rawToken = String(req.params.token || '').trim();
  const { password } = req.body || {};

  if (!rawToken || !/^[a-f0-9]{64}$/i.test(rawToken)) {
    return res.status(400).json({ error: 'Invalid or expired reset link' });
  }

  const passwordError = validateStrongPassword(password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  const tokenHash = hashToken(rawToken);
  const user = await User.findOne({ resetPasswordToken: tokenHash }).select(
    '+resetPasswordToken +resetPasswordExpires +failedLoginAttempts +lockUntil',
  );

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired reset link' });
  }

  if (!user.resetPasswordExpires || user.resetPasswordExpires.getTime() < Date.now()) {
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();
    return res.status(400).json({ error: 'Invalid or expired reset link' });
  }

  user.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  user.resetPasswordToken = null;
  user.resetPasswordExpires = null;
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  // Invalidate all existing sessions after a password reset
  await revokeAllSessions(user._id);

  return res.status(200).json({
    message: 'Password updated successfully. You can now log in with your new password.',
  });
}
