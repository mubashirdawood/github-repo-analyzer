import dns from 'dns';
import nodemailer from 'nodemailer';

/** Prefer IPv4 — many networks block IPv6 to Gmail (ENETUNREACH on smtp.gmail.com:465). */
function ipv4Lookup(hostname, _options, callback) {
  dns.lookup(hostname, { family: 4 }, callback);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getMailCredentials() {
  const user = (process.env.EMAIL_USER || process.env.MAIL_USER || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  // Gmail app passwords may be pasted with spaces or quotes — normalize
  const pass = (process.env.EMAIL_PASS || process.env.MAIL_PASS || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, '');
  return { user, pass };
}

function createTransporter() {
  const { user, pass } = getMailCredentials();

  if (!user || !pass) {
    const err = new Error('Mail is not configured. Set EMAIL_USER and EMAIL_PASS in server/.env');
    err.statusCode = 503;
    err.isOperational = true;
    throw err;
  }

  // Explicit Gmail SMTP (more reliable than service: 'gmail' on some networks)
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
    lookup: ipv4Lookup,
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
    tls: { servername: 'smtp.gmail.com' },
  });
}

function buildContactHtml({ name, email, message }) {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br />');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td style="background:#09090b;padding:20px 28px;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">
                GitLens<span style="color:#0284c7;">.ai</span>
              </p>
              <p style="margin:6px 0 0;font-size:13px;color:#a1a1aa;">New contact form message</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#09090b;line-height:1.4;">
                From: ${safeEmail}
              </p>
              <p style="margin:0 0 8px;font-size:13px;color:#71717a;">
                Name: <strong style="color:#18181b;">${safeName}</strong>
              </p>
              <div style="margin-top:20px;padding:16px 18px;background:#f4f4f5;border-radius:12px;border:1px solid #e4e4e7;">
                <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#0284c7;">
                  Message
                </p>
                <p style="margin:0;font-size:15px;line-height:1.65;color:#27272a;">
                  ${safeMessage}
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 22px;border-top:1px solid #f4f4f5;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">
                Sent from the GitLens.ai landing page contact form.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();
}

function buildVerificationHtml({ verifyUrl }) {
  const safeUrl = escapeHtml(verifyUrl);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td style="background:#09090b;padding:20px 28px;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">
                GitLens<span style="color:#0284c7;">.ai</span>
              </p>
              <p style="margin:6px 0 0;font-size:13px;color:#a1a1aa;">Verify your email address</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#09090b;line-height:1.4;">
                Confirm your account
              </p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#3f3f46;">
                Thanks for signing up. Click the button below to verify your email. This link expires in 24 hours.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
                <tr>
                  <td style="border-radius:12px;background:#0284c7;">
                    <a href="${safeUrl}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Verify email
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:12px;line-height:1.55;color:#71717a;word-break:break-all;">
                Or paste this link into your browser:<br />
                <a href="${safeUrl}" style="color:#0284c7;">${safeUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 22px;border-top:1px solid #f4f4f5;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">
                If you did not create a GitLens.ai account, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();
}

/**
 * Send email verification link to a newly registered user.
 * Link points at the API so the server can verify and redirect to the SPA.
 * @param {{ to: string, rawToken: string }} opts
 */
export async function sendVerificationEmail({ to, rawToken }) {
  const { user, pass } = getMailCredentials();
  const transporter = createTransporter();
  const apiBase = (process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`).replace(
    /\/$/,
    '',
  );
  const apiVerifyUrl = `${apiBase}/api/auth/verify-email/${encodeURIComponent(rawToken)}`;

  console.log(`[mail] verification email via ${user} (pass length ${pass.length}) → ${to}`);

  const html = buildVerificationHtml({ verifyUrl: apiVerifyUrl });
  const text = `Verify your GitLens.ai email:\n\n${apiVerifyUrl}\n\nThis link expires in 24 hours.`;

  try {
    await transporter.sendMail({
      from: `"GitLens.ai" <${user}>`,
      to,
      subject: 'Verify your GitLens.ai email',
      text,
      html,
    });
  } catch (smtpErr) {
    console.error('[mail] verification send failed:', smtpErr.code, smtpErr.responseCode, smtpErr.message);
    const err = new Error(
      smtpErr.code === 'EAUTH'
        ? 'Gmail rejected EMAIL_PASS. Your normal Gmail password will not work — create a new App Password at https://myaccount.google.com/apppasswords (2-Step Verification must be ON), paste the 16-character code into EMAIL_PASS, then restart the server.'
        : 'Failed to send verification email. Please try again later.',
    );
    err.statusCode = 502;
    err.isOperational = true;
    throw err;
  }
}

function buildPasswordResetHtml({ resetUrl }) {
  const safeUrl = escapeHtml(resetUrl);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td style="background:#09090b;padding:20px 28px;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">
                GitLens<span style="color:#0284c7;">.ai</span>
              </p>
              <p style="margin:6px 0 0;font-size:13px;color:#a1a1aa;">Reset your password</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#09090b;line-height:1.4;">
                Password reset request
              </p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#3f3f46;">
                We received a request to reset your GitLens.ai password. Click the button below to choose a new password. This link expires in 15 minutes.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
                <tr>
                  <td style="border-radius:12px;background:#0284c7;">
                    <a href="${safeUrl}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Reset password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:12px;line-height:1.55;color:#71717a;word-break:break-all;">
                Or paste this link into your browser:<br />
                <a href="${safeUrl}" style="color:#0284c7;">${safeUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 22px;border-top:1px solid #f4f4f5;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">
                If you did not request a password reset, you can ignore this email. Your password will stay the same.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();
}

/**
 * Send password-reset link to the SPA reset page (token in path).
 * @param {{ to: string, rawToken: string }} opts
 */
export async function sendPasswordResetEmail({ to, rawToken }) {
  const { user, pass } = getMailCredentials();
  const transporter = createTransporter();
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  const resetUrl = `${clientUrl}/reset-password/${encodeURIComponent(rawToken)}`;

  console.log(`[mail] password reset email via ${user} (pass length ${pass.length}) → ${to}`);

  const html = buildPasswordResetHtml({ resetUrl });
  const text = `Reset your GitLens.ai password:\n\n${resetUrl}\n\nThis link expires in 15 minutes. If you did not request this, ignore this email.`;

  try {
    await transporter.sendMail({
      from: `"GitLens.ai" <${user}>`,
      to,
      subject: 'Reset your GitLens.ai password',
      text,
      html,
    });
  } catch (smtpErr) {
    console.error('[mail] password reset send failed:', smtpErr.code, smtpErr.responseCode, smtpErr.message);
    const err = new Error(
      smtpErr.code === 'EAUTH'
        ? 'Gmail rejected EMAIL_PASS. Your normal Gmail password will not work — create a new App Password at https://myaccount.google.com/apppasswords (2-Step Verification must be ON), paste the 16-character code into EMAIL_PASS, then restart the server.'
        : 'Failed to send password reset email. Please try again later.',
    );
    err.statusCode = 502;
    err.isOperational = true;
    throw err;
  }
}

/**
 * Send a styled HTML contact email to EMAIL_USER inbox.
 */
export async function sendContactEmail({ name, email, message }) {
  const { user, pass } = getMailCredentials();
  const transporter = createTransporter();
  const to = (process.env.MAIL_TO || user).trim();

  console.log(`[mail] sending via ${user} (pass length ${pass.length}) → ${to}`);

  const html = buildContactHtml({ name, email, message });
  const text = `From: ${email}\nName: ${name}\n\n${message}`;

  try {
    await transporter.sendMail({
      from: `"GitLens Contact" <${user}>`,
      to,
      replyTo: email,
      subject: `Contact from ${name}`,
      text,
      html,
    });
  } catch (smtpErr) {
    console.error('[mail] send failed:', smtpErr.code, smtpErr.responseCode, smtpErr.message);
    const err = new Error(
      smtpErr.code === 'EAUTH'
        ? 'Gmail rejected EMAIL_PASS. Your normal Gmail password will not work — create a new App Password at https://myaccount.google.com/apppasswords (2-Step Verification must be ON), paste the 16-character code into EMAIL_PASS, then restart the server.'
        : 'Failed to send email. Please try again later.',
    );
    err.statusCode = 502;
    err.isOperational = true;
    throw err;
  }
}
