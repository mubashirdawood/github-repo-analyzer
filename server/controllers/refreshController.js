import { rotateRefreshToken } from '../services/sessionService.js';
import { signToken } from '../controllers/authController.js';
import {
  setAuthCookies,
  clearAuthCookies,
  REFRESH_COOKIE,
  resolveTokenExpiry,
} from '../utils/authCookies.js';

/**
 * POST /api/auth/refresh
 * Accepts refresh token from httpOnly cookie or JSON body.
 * Rotates refresh token and returns a new access JWT.
 */
export async function refreshAccessToken(req, res) {
  const raw =
    req.cookies?.[REFRESH_COOKIE] ||
    (typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : null);

  if (!raw) {
    return res.status(401).json({ error: 'Refresh token required' });
  }

  const result = await rotateRefreshToken(raw, (userId, { sessionId, rememberMe }) =>
    signToken(userId, {
      sessionId,
      expiresIn: resolveTokenExpiry(rememberMe),
    }),
  );

  if (!result) {
    clearAuthCookies(res);
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  setAuthCookies(res, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    rememberMe: result.rememberMe,
  });

  return res.status(200).json({
    token: result.accessToken,
    refreshToken: result.refreshToken,
    sessionId: String(result.session._id),
    rememberMe: result.rememberMe,
    expiresIn: resolveTokenExpiry(result.rememberMe),
  });
}
