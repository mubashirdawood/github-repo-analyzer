/**
 * Map local bindings to known library labels via imports / requires / constructors.
 */

import {
  isCallExpression,
  isIdentifier,
  isMemberExpression,
  memberName,
  parseSource,
  walk,
  type AstNode
} from './astUtils.js';

const PACKAGE_TO_LABEL: Record<string, string> = {
  jsonwebtoken: 'JWT',
  jwt: 'JWT',
  jose: 'JWT',
  bcrypt: 'bcrypt',
  bcryptjs: 'bcrypt',
  redis: 'Redis',
  ioredis: 'Redis',
  cloudinary: 'Cloudinary',
  openai: 'OpenAI',
  axios: 'axios',
  stripe: 'Stripe',
  mongoose: 'mongoose',
  nodemailer: 'nodemailer',
  '@sendgrid/mail': 'sendgrid',
  sendgrid: 'sendgrid',
  resend: 'Resend',
  mailgun: 'Mailgun',
  'mailgun.js': 'Mailgun',
  bull: 'Bull',
  bullmq: 'Bull',
  amqplib: 'amqp',
  multer: 'multer',
  'aws-sdk': 's3',
  '@aws-sdk/client-s3': 's3',
  paypal: 'PayPal',
  razorpay: 'Razorpay'
};

function packageLabel(specifier: string): string | null {
  const root = specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0] ?? specifier;
  return PACKAGE_TO_LABEL[root.toLowerCase()] ?? PACKAGE_TO_LABEL[root] ?? null;
}

function stringLiteral(node: AstNode | null | undefined): string | null {
  if (!node) return null;
  if (node.type === 'StringLiteral' && typeof node.value === 'string') return node.value;
  return null;
}

/**
 * Build localName → library label (JWT, Redis, …) from imports and assignments.
 */
export function buildBindingAliases(filePath: string, source: string): Map<string, string> {
  const map = new Map<string, string>();
  const ast = parseSource(filePath, source);
  if (!ast) {
    // Regex fallback for common patterns
    for (const m of source.matchAll(
      /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    )) {
      const label = packageLabel(m[2]!);
      if (label) map.set(m[1]!, label);
    }
    for (const m of source.matchAll(
      /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g
    )) {
      const label = packageLabel(m[2]!);
      if (label) map.set(m[1]!, label);
    }
    return map;
  }

  walk(ast, (node) => {
    // const jwt = require('jsonwebtoken')
    if (
      node.type === 'VariableDeclarator' &&
      isIdentifier(node.id ?? null) &&
      node.id?.name &&
      node.init
    ) {
      const init = node.init;

      // require('pkg')
      if (
        isCallExpression(init) &&
        isIdentifier(init.callee ?? null) &&
        init.callee?.name === 'require' &&
        Array.isArray(init.arguments) &&
        init.arguments[0]
      ) {
        const spec = stringLiteral(init.arguments[0]);
        if (spec) {
          const label = packageLabel(spec);
          if (label) map.set(node.id.name, label);
        }
      }

      // require('cloudinary').v2
      if (
        isMemberExpression(init) &&
        init.object &&
        isCallExpression(init.object) &&
        isIdentifier(init.object.callee ?? null) &&
        init.object.callee?.name === 'require' &&
        Array.isArray(init.object.arguments)
      ) {
        const spec = stringLiteral(init.object.arguments[0] ?? null);
        if (spec) {
          const label = packageLabel(spec);
          if (label) map.set(node.id.name, label);
        }
      }

      // redis.createClient() / createClient() / nodemailer.createTransport()
      if (isCallExpression(init) && init.callee) {
        if (isMemberExpression(init.callee)) {
          const obj = init.callee.object;
          const method = memberName(init.callee);
          if (isIdentifier(obj ?? null) && obj?.name) {
            const parentLabel = map.get(obj.name);
            const methodName = method ?? '';
            if (parentLabel === 'Redis' || /createClient/i.test(methodName)) {
              map.set(node.id.name, 'Redis');
            } else if (parentLabel === 'nodemailer' || /createTransport/i.test(methodName)) {
              map.set(node.id.name, 'nodemailer');
            } else if (parentLabel) {
              map.set(node.id.name, parentLabel);
            }
          }
        }
        if (isIdentifier(init.callee) && /createClient/i.test(init.callee.name ?? '')) {
          map.set(node.id.name, 'Redis');
        }
      }

      // new OpenAI() / new Stripe() / new Queue()
      if (init.type === 'NewExpression' && init.callee && isIdentifier(init.callee)) {
        const ctor = init.callee.name ?? '';
        const label =
          packageLabel(ctor) ||
          (/^OpenAI$/i.test(ctor) ? 'OpenAI' : null) ||
          (/^Stripe$/i.test(ctor) ? 'Stripe' : null) ||
          (/^(Queue|Bull)$/i.test(ctor) ? 'Bull' : null);
        if (label) map.set(node.id.name, label);
      }
    }

    // import jwt from 'jsonwebtoken'
    if (node.type === 'ImportDeclaration') {
      const sourceNode = node.source as AstNode | undefined;
      const spec = stringLiteral(sourceNode ?? null);
      if (!spec) return;
      const label = packageLabel(spec);
      if (!label) return;
      const specifiers = node.specifiers as AstNode[] | undefined;
      if (!Array.isArray(specifiers)) return;
      for (const s of specifiers) {
        const local = s.local as AstNode | undefined;
        if (
          (s.type === 'ImportDefaultSpecifier' ||
            s.type === 'ImportNamespaceSpecifier' ||
            s.type === 'ImportSpecifier') &&
          local &&
          isIdentifier(local) &&
          local.name
        ) {
          map.set(local.name, label);
        }
      }
    }
  });

  return map;
}

/**
 * Rewrite a raw call using binding aliases: client.set → Redis.set
 */
export function applyBindingAliases(call: string, aliases: Map<string, string>): string {
  const parts = call.split('.');
  const root = parts[0]!;
  const label = aliases.get(root);
  if (!label) return call;
  if (parts.length === 1) return label;
  return `${label}.${parts.slice(1).join('.')}`;
}
