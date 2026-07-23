import { sendContactEmail } from '../services/mailService.js';

/**
 * POST /api/contact — public contact form submission.
 */
export async function submitContact(req, res) {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim();
  const message = String(req.body?.message || '').trim();

  if (!name || !email || !message) {
    const err = new Error('Name, email, and message are required.');
    err.statusCode = 400;
    err.isOperational = true;
    throw err;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err = new Error('Please provide a valid email address.');
    err.statusCode = 400;
    err.isOperational = true;
    throw err;
  }

  if (message.length > 5000) {
    const err = new Error('Message is too long (max 5000 characters).');
    err.statusCode = 400;
    err.isOperational = true;
    throw err;
  }

  await sendContactEmail({ name, email, message });

  return res.status(200).json({ ok: true, message: 'Message sent successfully.' });
}
