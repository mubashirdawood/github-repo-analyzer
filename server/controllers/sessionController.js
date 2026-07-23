import {
  listUserSessions,
  revokeSession,
  revokeAllSessions,
  purgeExpiredSessions,
} from '../services/sessionService.js';
import { clearAuthCookies } from '../utils/authCookies.js';

/**
 * GET /api/auth/sessions — list active devices for the current user.
 */
export async function listSessions(req, res) {
  await purgeExpiredSessions(req.userId);
  const sessions = await listUserSessions(req.userId, req.sessionId || null);
  return res.status(200).json({ sessions });
}

/**
 * DELETE /api/auth/sessions/:id — logout a selected device.
 */
export async function logoutSession(req, res) {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Session id is required' });
  }

  const removed = await revokeSession(req.userId, id);
  if (!removed) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const isCurrent = req.sessionId && String(req.sessionId) === String(id);
  if (isCurrent) {
    clearAuthCookies(res);
  }
  return res.status(200).json({
    message: 'Device logged out',
    currentRevoked: Boolean(isCurrent),
  });
}

/**
 * DELETE /api/auth/sessions — logout all devices (including current).
 */
export async function logoutAllSessions(req, res) {
  const deleted = await revokeAllSessions(req.userId);
  clearAuthCookies(res);
  return res.status(200).json({
    message: 'Logged out of all devices',
    deleted,
    currentRevoked: true,
  });
}

/**
 * POST /api/auth/logout — logout current device only (no-op for legacy JWTs without sid).
 */
export async function logoutCurrent(req, res) {
  if (req.sessionId) {
    await revokeSession(req.userId, req.sessionId);
  }
  clearAuthCookies(res);
  return res.status(200).json({ message: 'Logged out' });
}
