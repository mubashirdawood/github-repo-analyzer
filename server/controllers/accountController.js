import bcrypt from 'bcrypt';
import crypto from 'crypto';
import User from '../models/User.js';
import Repo from '../models/Repo.js';
import Question from '../models/Question.js';
import FileCache from '../models/FileCache.js';
import RepositoryAnalysis from '../models/RepositoryAnalysis.js';
import RequestFlowAnalysis from '../models/RequestFlowAnalysis.js';
import UserSession from '../models/UserSession.js';
import LoginAttempt from '../models/LoginAttempt.js';
import { sendVerificationEmail } from '../services/mailService.js';
import { normalizeEmail, validateStrongPassword } from '../utils/authValidation.js';
import { clearAuthCookies } from '../utils/authCookies.js';
import { revokeAllSessions } from '../services/sessionService.js';

const SALT_ROUNDS = 12;
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function createVerificationToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expires = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
  return { rawToken, tokenHash, expires };
}

function publicUser(user) {
  return {
    id: user._id,
    email: user.email,
    emailVerified: user.emailVerified !== false,
    provider: user.provider || 'local',
    profilePicture: user.profilePicture || null,
    hasPassword: Boolean(user.passwordHash),
    createdAt: user.createdAt,
  };
}

/**
 * GET /api/auth/me
 */
export async function getAccount(req, res) {
  const user = await User.findById(req.userId).select('+passwordHash');
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  return res.status(200).json({
    user: publicUser(user),
  });
}

/**
 * PATCH /api/auth/password — { currentPassword?, newPassword }
 * Accounts without a password (legacy) may set one without currentPassword.
 */
export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  const passwordError = validateStrongPassword(newPassword);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  const user = await User.findById(req.userId).select(
    '+passwordHash +failedLoginAttempts +lockUntil',
  );
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (user.passwordHash) {
    if (!currentPassword || typeof currentPassword !== 'string') {
      return res.status(400).json({ error: 'Current password is required' });
    }
    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
  }

  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  // Keep current device session; revoke every other device after password change
  await revokeAllSessions(req.userId, { exceptSessionId: req.sessionId || null });

  return res.status(200).json({ message: 'Password updated successfully' });
}

/**
 * PATCH /api/auth/email — { email, password? }
 * Requires password when the account has one. Marks email unverified and sends link.
 */
export async function changeEmail(req, res) {
  const { email, password } = req.body || {};
  const emailResult = normalizeEmail(email);
  if (emailResult.error) {
    return res.status(400).json({ error: emailResult.error });
  }
  const newEmail = emailResult.email;

  const user = await User.findById(req.userId).select(
    '+passwordHash +verificationToken +verificationTokenExpires',
  );
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (newEmail === user.email) {
    return res.status(400).json({ error: 'That is already your email address' });
  }

  if (user.passwordHash) {
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required to change email' });
    }
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }
  }

  const taken = await User.findOne({ email: newEmail });
  if (taken) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const { rawToken, tokenHash, expires } = createVerificationToken();
  user.email = newEmail;
  user.emailVerified = false;
  user.verificationToken = tokenHash;
  user.verificationTokenExpires = expires;
  await user.save();

  let emailSent = true;
  try {
    await sendVerificationEmail({ to: user.email, rawToken });
  } catch (err) {
    console.error('[account] verification email after change failed:', err.message);
    emailSent = false;
  }

  return res.status(200).json({
    message: emailSent
      ? 'Email updated. Please verify your new address before signing in again on other devices.'
      : 'Email updated, but we could not send the verification email. Use Resend verification.',
    emailSent,
    user: publicUser(user),
  });
}

/**
 * POST /api/auth/resend-verification-me — authenticated resend for current user
 */
export async function resendMyVerification(req, res) {
  const user = await User.findById(req.userId).select(
    '+verificationToken +verificationTokenExpires',
  );
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (user.emailVerified !== false) {
    return res.status(200).json({ message: 'Your email is already verified.' });
  }

  const { rawToken, tokenHash, expires } = createVerificationToken();
  user.verificationToken = tokenHash;
  user.verificationTokenExpires = expires;
  await user.save();

  try {
    await sendVerificationEmail({ to: user.email, rawToken });
  } catch (mailErr) {
    console.error('[account] resend verification failed:', mailErr.message);
    const err = new Error('Failed to send verification email. Please try again later.');
    err.statusCode = mailErr.statusCode || 502;
    err.isOperational = true;
    throw err;
  }

  return res.status(200).json({ message: 'Verification email sent.' });
}

/**
 * GET /api/auth/activity — recent login attempts for this user
 */
export async function getSecurityActivity(req, res) {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const attempts = await LoginAttempt.find({ userId: req.userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return res.status(200).json({
    activity: attempts.map((a) => ({
      id: String(a._id),
      email: a.email,
      success: a.success,
      reason: a.reason,
      ip: a.ip,
      userAgent: a.userAgent,
      createdAt: a.createdAt,
    })),
  });
}

/**
 * GET /api/auth/export — downloadable account data (JSON)
 */
export async function exportAccountData(req, res) {
  const user = await User.findById(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const [repos, sessions, activity] = await Promise.all([
    Repo.find({ userId: req.userId })
      .select('githubUrl owner repoName status createdAt updatedAt commitSha')
      .lean(),
    UserSession.find({ userId: req.userId, expiresAt: { $gt: new Date() } })
      .select('device browser os ip loginTime lastActive expiresAt rememberMe')
      .lean(),
    LoginAttempt.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(100).lean(),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    account: {
      id: String(user._id),
      email: user.email,
      emailVerified: user.emailVerified !== false,
      provider: user.provider,
      createdAt: user.createdAt,
    },
    repositories: repos.map((r) => ({
      id: String(r._id),
      githubUrl: r.githubUrl,
      owner: r.owner,
      repoName: r.repoName,
      status: r.status,
      commitSha: r.commitSha || null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    sessions: sessions.map((s) => ({
      device: s.device,
      browser: s.browser,
      os: s.os,
      ip: s.ip,
      loginTime: s.loginTime,
      lastActive: s.lastActive,
      expiresAt: s.expiresAt,
      rememberMe: Boolean(s.rememberMe),
    })),
    securityActivity: activity.map((a) => ({
      success: a.success,
      reason: a.reason,
      ip: a.ip,
      userAgent: a.userAgent,
      createdAt: a.createdAt,
    })),
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="gitlens-account-export-${Date.now()}.json"`,
  );
  return res.status(200).send(JSON.stringify(payload, null, 2));
}

/**
 * DELETE /api/auth/account — { password } or { confirmation: "DELETE" } if no password set
 */
export async function deleteAccount(req, res) {
  const { password, confirmation } = req.body || {};

  const user = await User.findById(req.userId).select('+passwordHash');
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (user.passwordHash) {
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required to delete your account' });
    }
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }
  } else if (String(confirmation || '').trim().toUpperCase() !== 'DELETE') {
    return res.status(400).json({
      error: 'Type DELETE to confirm account deletion',
    });
  }

  const repos = await Repo.find({ userId: user._id }).select('_id');
  const repoIds = repos.map((r) => r._id);

  if (repoIds.length) {
    await Promise.all([
      Question.deleteMany({ repoId: { $in: repoIds } }),
      FileCache.deleteMany({ repoId: { $in: repoIds } }),
      RepositoryAnalysis.deleteMany({ repoId: { $in: repoIds } }),
      RequestFlowAnalysis.deleteMany({ repositoryId: { $in: repoIds } }),
      Repo.deleteMany({ userId: user._id }),
    ]);
  }

  await Promise.all([
    UserSession.deleteMany({ userId: user._id }),
    LoginAttempt.deleteMany({ userId: user._id }),
    User.deleteOne({ _id: user._id }),
  ]);

  clearAuthCookies(res);
  return res.status(200).json({ message: 'Account deleted' });
}
