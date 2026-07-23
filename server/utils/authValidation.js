/**
 * Shared auth helpers — email normalization & strong password rules.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Trim + lowercase. Rejects empty / malformed addresses.
 * @returns {{ email: string } | { error: string }}
 */
export function normalizeEmail(raw) {
  if (raw == null || typeof raw !== 'string') {
    return { error: 'email is required' };
  }
  const email = raw.trim().toLowerCase();
  if (!email) {
    return { error: 'email is required' };
  }
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return { error: 'Invalid email address' };
  }
  return { email };
}

/**
 * Strong password: ≥8 chars, upper, lower, digit.
 * Used for signup and password reset.
 */
export function validateStrongPassword(password) {
  if (typeof password !== 'string') {
    return 'Password is required';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (password.length > 128) {
    return 'Password must be at most 128 characters';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include a lowercase letter';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include an uppercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must include a number';
  }
  return null;
}
