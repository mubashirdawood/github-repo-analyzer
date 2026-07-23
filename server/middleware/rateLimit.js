import rateLimit from 'express-rate-limit';

const isProd = process.env.NODE_ENV === 'production';

/** No-op middleware when rate limits are disabled (local/dev). */
function passthrough(_req, _res, next) {
  next();
}

/**
 * Stricter limits on auth endpoints (brute-force / spam protection).
 * Disabled outside production so local testing is not blocked.
 */
export const authRateLimiter = isProd
  ? rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests. Please try again later.' },
    })
  : passthrough;

/** Login-specific limit (in addition to account lockout). */
export const loginRateLimiter = isProd
  ? rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 40,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many login attempts. Please try again later.' },
    })
  : passthrough;

/** Signup / resend / forgot — curb abuse. */
export const sensitiveAuthRateLimiter = isProd
  ? rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests. Please try again later.' },
    })
  : passthrough;
