/**
 * Normalize raw call expressions into stable labels.
 * JWT / bcrypt / Redis / Cloudinary / OpenAI / DB / services.
 */

const SKIP_CALLEES = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'function',
  'return',
  'await',
  'typeof',
  'new',
  'console',
  'Math',
  'JSON',
  'Object',
  'Array',
  'Promise',
  'Error',
  'Map',
  'Set',
  'Date',
  'Number',
  'String',
  'Boolean',
  'parseInt',
  'parseFloat',
  'require',
  'res',
  'req',
  'next',
  'this'
]);

/** Known package / binding roots → display prefix. */
const ROOT_ALIASES: Array<{ test: RegExp; label: string }> = [
  { test: /^(jwt|jsonwebtoken|jose)$/i, label: 'JWT' },
  { test: /^(bcrypt|bcryptjs)$/i, label: 'bcrypt' },
  { test: /^(redis|ioredis|createClient)$/i, label: 'Redis' },
  { test: /^(cloudinary)$/i, label: 'Cloudinary' },
  { test: /^(openai|OpenAI)$/i, label: 'OpenAI' },
  { test: /^(axios)$/i, label: 'axios' },
  { test: /^(stripe)$/i, label: 'Stripe' },
  { test: /^(fetch)$/i, label: 'fetch' },
  { test: /^(prisma)$/i, label: 'Prisma' },
  { test: /^(mongoose)$/i, label: 'mongoose' },
  { test: /^(nodemailer)$/i, label: 'nodemailer' },
  { test: /^(transporter)$/i, label: 'nodemailer' },
  { test: /^(sgMail|sendgrid)$/i, label: 'sendgrid' },
  { test: /^(resend)$/i, label: 'Resend' },
  { test: /^(mailgun)$/i, label: 'Mailgun' },
  { test: /^(bull|bullmq|Queue)$/i, label: 'Bull' },
  { test: /^(amqp|amqplib)$/i, label: 'amqp' },
  { test: /^(multer)$/i, label: 'multer' },
  { test: /^(paypal)$/i, label: 'PayPal' },
  { test: /^(razorpay)$/i, label: 'Razorpay' }
];

const DB_METHODS = new Set([
  'find',
  'findOne',
  'findById',
  'findByIdAndUpdate',
  'findByIdAndDelete',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findMany',
  'create',
  'save',
  'update',
  'updateOne',
  'updateMany',
  'delete',
  'deleteOne',
  'deleteMany',
  'remove',
  'aggregate',
  'count',
  'countDocuments',
  'exists',
  'insertMany',
  'bulkWrite',
  'exec',
  'query',
  'select',
  'lean'
]);

/**
 * Turn a raw callee string into a normalized call label.
 * Returns null when the call should be ignored.
 */
export function normalizeCall(raw: string): string | null {
  let call = raw.trim().replace(/\s+/g, '');
  if (!call) return null;

  // Strip .bind / trailing junk
  call = call.replace(/\.bind$/, '');

  const parts = call.split('.').filter(Boolean);
  if (parts.length === 0) return null;

  const root = parts[0]!;
  if (SKIP_CALLEES.has(root)) return null;

  // this.userService.login → UserService.login (drop this)
  if (root === 'this' && parts.length >= 2) {
    return normalizeCall(parts.slice(1).join('.'));
  }

  // Known libraries
  for (const { test, label } of ROOT_ALIASES) {
    if (test.test(root)) {
      if (parts.length === 1) return label;
      // jwt.sign → JWT.sign ; cloudinary.uploader.upload → Cloudinary.upload
      if (label === 'Cloudinary') {
        const method = parts[parts.length - 1]!;
        return `Cloudinary.${method}`;
      }
      if (label === 'OpenAI') {
        // openai.chat.completions.create → OpenAI.create
        const method = parts[parts.length - 1]!;
        return `OpenAI.${method}`;
      }
      if (label === 'Redis') {
        const method = parts[parts.length - 1]!;
        return `Redis.${method}`;
      }
      if (label === 'JWT') {
        const method = parts[1] ?? 'sign';
        return `JWT.${method}`;
      }
      if (label === 'bcrypt') {
        const method = parts[1] ?? 'hash';
        return `bcrypt.${method}`;
      }
      return `${label}.${parts.slice(1).join('.')}`;
    }
  }

  // res.json / res.status / req.body — skip response helpers
  if (/^(res|req|response|request)$/i.test(root)) return null;
  if (/^(json|send|status|end|redirect|render|next|setHeader|getHeader|cookie|clearCookie)$/i.test(root)) {
    return null;
  }
  if (/^(json|send|status|end|redirect)$/i.test(parts[parts.length - 1] ?? '')) {
    // *.json() from res.status().json()
    if (parts.length === 1 || /^(res|status|response)$/i.test(root)) return null;
  }

  // Keep service / model style calls as-is (UserService.login, User.findOne)
  if (parts.length >= 2) {
    const method = parts[parts.length - 1]!;
    // Optional: capitalize service-looking roots for consistency
    if (/service$/i.test(root) || /controller$/i.test(root) || /repository$/i.test(root)) {
      return `${capitalizeIdent(root)}.${parts.slice(1).join('.')}`;
    }
    if (DB_METHODS.has(method)) {
      return `${root}.${method}`;
    }
    return `${root}.${parts.slice(1).join('.')}`;
  }

  // Bare call — keep if it looks meaningful (not a local helper named get)
  if (/^[A-Z]/.test(root) || /Service$|Model$|Client$/.test(root)) {
    return root;
  }

  return root;
}

function capitalizeIdent(name: string): string {
  if (!name) return name;
  // authService → AuthService (already camel); keep as-is if Pascal
  if (/^[A-Z]/.test(name)) return name;
  // userService → UserService
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Deduplicate while preserving order.
 */
export function uniqueCalls(calls: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of calls) {
    const n = normalizeCall(c);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}
