import crypto from 'crypto';
import UserSession from '../models/UserSession.js';
import { parseUserAgent, getRequestIp } from '../utils/userAgent.js';
import { SESSION_TTL_DEFAULT_MS } from '../utils/authCookies.js';

const LAST_ACTIVE_TOUCH_MS = 5 * 60 * 1000; // throttle lastActive writes

function hashRefreshToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

/**
 * Create a device session after successful login.
 * @param {object} [options]
 * @param {number} [options.ttlMs] - session lifetime (default 24h)
 * @param {boolean} [options.rememberMe]
 * @returns {{ session: object, refreshToken: string }}
 */
export async function createUserSession(userId, req, options = {}) {
  const ttlMs = options.ttlMs || SESSION_TTL_DEFAULT_MS;
  const userAgent = req.headers['user-agent'] || null;
  const { device, browser, os } = parseUserAgent(userAgent);
  const ip = getRequestIp(req);
  const rawRefreshToken = crypto.randomBytes(48).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  const session = await UserSession.create({
    userId,
    device,
    browser,
    os,
    ip,
    loginTime: now,
    lastActive: now,
    refreshToken: hashRefreshToken(rawRefreshToken),
    expiresAt,
    userAgent,
    rememberMe: Boolean(options.rememberMe),
  });

  return { session, refreshToken: rawRefreshToken };
}

/** Delete expired sessions for a user (TTL is backup; this is immediate). */
export async function purgeExpiredSessions(userId) {
  await UserSession.deleteMany({
    userId,
    expiresAt: { $lte: new Date() },
  });
}

/**
 * List active (non-expired) sessions for a user.
 * @param {string} currentSessionId - JWT sid, if any
 */
export async function listUserSessions(userId, currentSessionId = null) {
  await purgeExpiredSessions(userId);

  const sessions = await UserSession.find({
    userId,
    expiresAt: { $gt: new Date() },
  })
    .sort({ lastActive: -1 })
    .select('-refreshToken -__v')
    .lean();

  return sessions.map((s) => ({
    id: String(s._id),
    device: s.device,
    browser: s.browser,
    os: s.os,
    ip: s.ip,
    loginTime: s.loginTime,
    lastActive: s.lastActive,
    expiresAt: s.expiresAt,
    isCurrent: currentSessionId ? String(s._id) === String(currentSessionId) : false,
  }));
}

export async function revokeSession(userId, sessionId) {
  const result = await UserSession.deleteOne({ _id: sessionId, userId });
  return result.deletedCount > 0;
}

export async function revokeAllSessions(userId, { exceptSessionId = null } = {}) {
  const filter = { userId };
  if (exceptSessionId) {
    filter._id = { $ne: exceptSessionId };
  }
  const result = await UserSession.deleteMany(filter);
  return result.deletedCount;
}

export async function revokeSessionById(sessionId) {
  await UserSession.deleteOne({ _id: sessionId });
}

/**
 * Validate session from JWT sid. Returns session or null if invalid/expired/missing.
 * Touches lastActive (throttled).
 */
export async function validateAndTouchSession(sessionId, userId) {
  if (!sessionId) return { ok: true, legacy: true, session: null };

  const session = await UserSession.findOne({ _id: sessionId, userId });
  if (!session) {
    return { ok: false, reason: 'revoked' };
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await UserSession.deleteOne({ _id: session._id });
    return { ok: false, reason: 'expired' };
  }

  const elapsed = Date.now() - new Date(session.lastActive).getTime();
  if (elapsed >= LAST_ACTIVE_TOUCH_MS) {
    session.lastActive = new Date();
    await session.save();
  }

  return { ok: true, session };
}

/**
 * Exchange a raw refresh token for a new access JWT (with refresh rotation).
 * @returns {{ session, accessToken, refreshToken, rememberMe } | null}
 */
export async function rotateRefreshToken(rawRefreshToken, signAccessToken) {
  if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
    return null;
  }

  const tokenHash = hashRefreshToken(rawRefreshToken.trim());
  const session = await UserSession.findOne({ refreshToken: tokenHash }).select('+refreshToken');
  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await UserSession.deleteOne({ _id: session._id });
    return null;
  }

  const rememberMe = Boolean(session.rememberMe);
  const newRawRefresh = crypto.randomBytes(48).toString('hex');
  session.refreshToken = hashRefreshToken(newRawRefresh);
  session.lastActive = new Date();
  await session.save();

  const accessToken = signAccessToken(session.userId, {
    sessionId: session._id,
    rememberMe,
  });

  return {
    session,
    accessToken,
    refreshToken: newRawRefresh,
    rememberMe,
  };
}
