/**
 * Lightweight User-Agent → device / browser / OS labels (no extra dependency).
 */
export function parseUserAgent(ua) {
  const raw = String(ua || '').trim();
  if (!raw) {
    return { device: 'Unknown device', browser: 'Unknown', os: 'Unknown' };
  }

  let os = 'Unknown';
  if (/windows nt 10/i.test(raw)) os = 'Windows 10/11';
  else if (/windows nt 6\.3/i.test(raw)) os = 'Windows 8.1';
  else if (/windows nt 6\.1/i.test(raw)) os = 'Windows 7';
  else if (/mac os x/i.test(raw)) os = 'macOS';
  else if (/android/i.test(raw)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(raw)) os = 'iOS';
  else if (/linux/i.test(raw)) os = 'Linux';
  else if (/cros/i.test(raw)) os = 'Chrome OS';

  let browser = 'Unknown';
  if (/edg\//i.test(raw)) browser = 'Edge';
  else if (/opr\//i.test(raw) || /opera/i.test(raw)) browser = 'Opera';
  else if (/chrome\//i.test(raw) && !/edg\//i.test(raw)) browser = 'Chrome';
  else if (/safari\//i.test(raw) && !/chrome\//i.test(raw)) browser = 'Safari';
  else if (/firefox\//i.test(raw)) browser = 'Firefox';

  let device = 'Desktop';
  if (/mobile|iphone|android.+mobile/i.test(raw)) device = 'Mobile';
  else if (/ipad|tablet|android(?!.+mobile)/i.test(raw)) device = 'Tablet';

  return { device, browser, os };
}

export function getRequestIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}
