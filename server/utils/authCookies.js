const ACCESS_COOKIE = 'gitlens_access';
const REFRESH_COOKIE = 'gitlens_refresh';

const MS_24H = 24 * 60 * 60 * 1000;
const MS_30D = 30 * 24 * 60 * 60 * 1000;

export const TOKEN_EXPIRY_DEFAULT = '24h';
export const TOKEN_EXPIRY_REMEMBER = '30d';
export const SESSION_TTL_DEFAULT_MS = MS_24H;
export const SESSION_TTL_REMEMBER_MS = MS_30D;

export { ACCESS_COOKIE, REFRESH_COOKIE };

function isSecureCookie() {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

function baseCookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}

/**
 * Set httpOnly auth cookies (additive to Authorization header / JSON token).
 */
export function setAuthCookies(res, { accessToken, refreshToken, rememberMe }) {
  const maxAge = rememberMe ? MS_30D : MS_24H;
  const opts = baseCookieOptions(maxAge);

  if (accessToken) {
    res.cookie(ACCESS_COOKIE, accessToken, opts);
  }
  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, opts);
  }
}

export function clearAuthCookies(res) {
  const clearOpts = {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: 'lax',
    path: '/',
  };
  res.clearCookie(ACCESS_COOKIE, clearOpts);
  res.clearCookie(REFRESH_COOKIE, clearOpts);
}

export function resolveTokenExpiry(rememberMe) {
  return rememberMe ? TOKEN_EXPIRY_REMEMBER : TOKEN_EXPIRY_DEFAULT;
}

export function resolveSessionTtlMs(rememberMe) {
  return rememberMe ? SESSION_TTL_REMEMBER_MS : SESSION_TTL_DEFAULT_MS;
}
