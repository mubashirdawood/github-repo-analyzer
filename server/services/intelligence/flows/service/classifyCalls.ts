/**
 * Classify normalized service call expressions into structured categories.
 * Evidence-only — no prose summaries.
 */

import type { ServiceCallCategory } from './types.js';

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
  'lean',
  'upsert',
  'insert',
  'destroy'
]);

const CACHE_ROOTS = /^(Redis|memcached|Memcached|nodeCache|NodeCache|lru-cache|cache)$/i;
const CACHE_METHODS = /^(get|set|del|delete|expire|incr|decr|hget|hset|mget|mset|flush|flushall|keys|ttl)$/i;

const PAYMENT_ROOTS = /^(Stripe|PayPal|paypal|Braintree|Razorpay|razorpay|square)$/i;

const UPLOAD_ROOTS =
  /^(Cloudinary|multer|s3|S3|aws-sdk|UploadThing|uploadthing|formidable|busboy|sharp)$/i;
const UPLOAD_METHODS = /^(upload|uploader|putObject|upload_stream|single|array|fields)$/i;

const EMAIL_ROOTS =
  /^(nodemailer|transporter|sgMail|sendgrid|Resend|resend|mailgun|Mailgun|postmark|Postmark|ses|SES)$/i;
const EMAIL_METHODS = /^(send|sendMail|sendEmail|emails)$/i;

const QUEUE_ROOTS =
  /^(Bull|bull|Queue|beeQueue|BeeQueue|agenda|Agenda|sqs|SQS|amqp|amqplib|kafka|Kafka|bullmq|BullMQ)$/i;
const QUEUE_METHODS = /^(add|process|send|sendMessage|publish|produce|consume|obliterate)$/i;

const EXTERNAL_ROOTS =
  /^(axios|fetch|got|request|http|https|OpenAI|openai|Anthropic|anthropic|Gemini|graphql)$/i;
const EXTERNAL_METHODS = /^(get|post|put|patch|delete|request|create|chat|completions)$/i;

const DB_ROOTS = /^(Prisma|prisma|mongoose|Mongoose|knex|sequelize|Sequelize|typeorm|TypeORM|supabase)$/i;

export interface ClassifiedCalls {
  database: string[];
  models: string[];
  externalApis: string[];
  fileUploads: string[];
  email: string[];
  payments: string[];
  queues: string[];
  cache: string[];
}

function pushUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
}

/**
 * Assign a primary category for a single normalized call.
 */
export function categorizeCall(call: string): ServiceCallCategory {
  const parts = call.split('.').filter(Boolean);
  const root = parts[0] ?? call;
  const method = parts.length >= 2 ? parts[parts.length - 1]! : '';

  if (CACHE_ROOTS.test(root) || (root === 'Redis' && (!method || CACHE_METHODS.test(method)))) {
    return 'cache';
  }
  if (PAYMENT_ROOTS.test(root)) return 'payment';
  if (
    UPLOAD_ROOTS.test(root) ||
    (UPLOAD_METHODS.test(method) && /cloudinary|s3|upload|multer/i.test(call))
  ) {
    return 'fileUpload';
  }
  if (EMAIL_ROOTS.test(root) || (EMAIL_METHODS.test(method) && EMAIL_ROOTS.test(root))) {
    return 'email';
  }
  if (QUEUE_ROOTS.test(root) || (QUEUE_METHODS.test(method) && QUEUE_ROOTS.test(root))) {
    return 'queue';
  }
  if (
    EXTERNAL_ROOTS.test(root) ||
    (EXTERNAL_METHODS.test(method) && /^(axios|fetch|got|http|https|OpenAI)/i.test(root))
  ) {
    return 'externalApi';
  }
  if (DB_ROOTS.test(root)) return 'database';
  if (method && DB_METHODS.has(method) && /^[A-Z]/.test(root) && !/Service$/i.test(root)) {
    return 'database';
  }
  if (method && DB_METHODS.has(method) && /Model$/i.test(root)) {
    return 'database';
  }

  return 'other';
}

/**
 * Extract model name from a DB-style call: User.find → User, prisma.user.create → user
 */
export function modelFromCall(call: string): string | null {
  const parts = call.split('.').filter(Boolean);
  if (parts.length < 2) return null;

  const root = parts[0]!;
  const method = parts[parts.length - 1]!;

  if (!DB_METHODS.has(method) && !DB_ROOTS.test(root)) return null;

  if (/^(Prisma|prisma)$/i.test(root) && parts.length >= 3) {
    return parts[1]!;
  }
  if (/^[A-Z]/.test(root) && !/Service$|Controller$|Client$/i.test(root) && DB_METHODS.has(method)) {
    return root;
  }
  if (/Model$/i.test(root)) return root.replace(/Model$/i, '') || root;

  return null;
}

/**
 * Classify a list of normalized calls into structured metadata buckets.
 */
export function classifyServiceCalls(calls: string[]): ClassifiedCalls {
  const out: ClassifiedCalls = {
    database: [],
    models: [],
    externalApis: [],
    fileUploads: [],
    email: [],
    payments: [],
    queues: [],
    cache: []
  };

  for (const call of calls) {
    const category = categorizeCall(call);
    switch (category) {
      case 'database':
        pushUnique(out.database, call);
        {
          const model = modelFromCall(call);
          if (model) pushUnique(out.models, model);
        }
        break;
      case 'externalApi':
        pushUnique(out.externalApis, call);
        break;
      case 'fileUpload':
        pushUnique(out.fileUploads, call);
        break;
      case 'email':
        pushUnique(out.email, call);
        break;
      case 'payment':
        pushUnique(out.payments, call);
        break;
      case 'queue':
        pushUnique(out.queues, call);
        break;
      case 'cache':
        pushUnique(out.cache, call);
        break;
      default:
        break;
    }
  }

  return out;
}
