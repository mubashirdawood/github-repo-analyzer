import jwt from 'jsonwebtoken';
import { validateAndTouchSession } from '../services/sessionService.js';
import { ACCESS_COOKIE } from '../utils/authCookies.js';

/**
 * Resolve JWT from Authorization: Bearer (preferred) or httpOnly access cookie.
 * Preserves existing header-based clients.
 */
function extractAccessToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const bearer = header.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookieToken = req.cookies?.[ACCESS_COOKIE];
  if (cookieToken && typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim();
  }
  return null;
}

/**
 * Verifies JWT and attaches userId / sessionId.
 * Legacy JWTs without sid remain valid (backward compatible).
 */
export async function requireAuth(req, res, next) {
  const token = extractAccessToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('JWT_SECRET is not set in environment');
    return res.status(500).json({ error: 'Server auth configuration error' });
  }

  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (!decoded?.userId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.userId = decoded.userId;
    req.sessionId = decoded.sid || null;

    if (req.sessionId) {
      const check = await validateAndTouchSession(req.sessionId, req.userId);
      if (!check.ok) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    }

    next();
  } catch (err) {
    if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    console.error('[auth] requireAuth error:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
