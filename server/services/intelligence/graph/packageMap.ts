import type { GraphNodeType } from './types.js';
import { packageRoot } from './resolveImport.js';

export interface PackageMapping {
  name: string;
  type: GraphNodeType;
  /** Optional override display name (e.g. MongoDB instead of mongoose). */
  displayName?: string;
}

/**
 * Known npm / PyPI packages → synthetic architecture nodes.
 */
const PACKAGE_MAP: Record<string, PackageMapping> = {
  // Databases / ODM
  mongoose: { name: 'mongoose', type: 'Database', displayName: 'MongoDB' },
  mongodb: { name: 'mongodb', type: 'Database', displayName: 'MongoDB' },
  mongo: { name: 'mongo', type: 'Database', displayName: 'MongoDB' },
  pg: { name: 'pg', type: 'Database', displayName: 'PostgreSQL' },
  postgres: { name: 'postgres', type: 'Database', displayName: 'PostgreSQL' },
  mysql: { name: 'mysql', type: 'Database', displayName: 'MySQL' },
  mysql2: { name: 'mysql2', type: 'Database', displayName: 'MySQL' },
  sqlite3: { name: 'sqlite3', type: 'Database', displayName: 'SQLite' },
  'better-sqlite3': { name: 'better-sqlite3', type: 'Database', displayName: 'SQLite' },
  redis: { name: 'redis', type: 'Database', displayName: 'Redis' },
  ioredis: { name: 'ioredis', type: 'Database', displayName: 'Redis' },
  prisma: { name: 'prisma', type: 'Database', displayName: 'Prisma' },
  '@prisma/client': { name: '@prisma/client', type: 'Database', displayName: 'Prisma' },
  typeorm: { name: 'typeorm', type: 'Database', displayName: 'TypeORM' },
  sequelize: { name: 'sequelize', type: 'Database', displayName: 'Sequelize' },
  'drizzle-orm': { name: 'drizzle-orm', type: 'Database', displayName: 'Drizzle' },
  firebase: { name: 'firebase', type: 'Database', displayName: 'Firebase' },
  'firebase-admin': { name: 'firebase-admin', type: 'Database', displayName: 'Firebase' },
  '@supabase/supabase-js': { name: '@supabase/supabase-js', type: 'Database', displayName: 'Supabase' },

  // Backend frameworks
  express: { name: 'express', type: 'Backend', displayName: 'Express' },
  fastify: { name: 'fastify', type: 'Backend', displayName: 'Fastify' },
  koa: { name: 'koa', type: 'Backend', displayName: 'Koa' },
  '@nestjs/core': { name: '@nestjs/core', type: 'Backend', displayName: 'NestJS' },
  '@nestjs/common': { name: '@nestjs/common', type: 'Backend', displayName: 'NestJS' },
  next: { name: 'next', type: 'Backend', displayName: 'Next.js' },

  // Frontend
  react: { name: 'react', type: 'Frontend', displayName: 'React' },
  'react-dom': { name: 'react-dom', type: 'Frontend', displayName: 'React' },
  vue: { name: 'vue', type: 'Frontend', displayName: 'Vue' },
  '@angular/core': { name: '@angular/core', type: 'Frontend', displayName: 'Angular' },

  // Auth
  jsonwebtoken: { name: 'jsonwebtoken', type: 'Authentication', displayName: 'JWT' },
  jose: { name: 'jose', type: 'Authentication', displayName: 'JWT' },
  passport: { name: 'passport', type: 'Authentication', displayName: 'Passport' },
  bcrypt: { name: 'bcrypt', type: 'Authentication', displayName: 'bcrypt' },
  bcryptjs: { name: 'bcryptjs', type: 'Authentication', displayName: 'bcrypt' },
  'next-auth': { name: 'next-auth', type: 'Authentication', displayName: 'NextAuth' },
  '@auth/core': { name: '@auth/core', type: 'Authentication', displayName: 'Auth.js' },
  '@clerk/nextjs': { name: '@clerk/nextjs', type: 'Authentication', displayName: 'Clerk' },

  // External / realtime APIs
  axios: { name: 'axios', type: 'External API', displayName: 'HTTP Client' },
  'socket.io': { name: 'socket.io', type: 'External API', displayName: 'Socket.IO' },
  'socket.io-client': { name: 'socket.io-client', type: 'External API', displayName: 'Socket.IO' },
  stripe: { name: 'stripe', type: 'External API', displayName: 'Stripe' },
  openai: { name: 'openai', type: 'External API', displayName: 'OpenAI' },
  '@google/generative-ai': {
    name: '@google/generative-ai',
    type: 'External API',
    displayName: 'Gemini'
  },
  nodemailer: { name: 'nodemailer', type: 'External API', displayName: 'Email' },
  twilio: { name: 'twilio', type: 'External API', displayName: 'Twilio' },

  // Python
  django: { name: 'django', type: 'Backend', displayName: 'Django' },
  flask: { name: 'flask', type: 'Backend', displayName: 'Flask' },
  fastapi: { name: 'fastapi', type: 'Backend', displayName: 'FastAPI' },
  sqlalchemy: { name: 'sqlalchemy', type: 'Database', displayName: 'SQLAlchemy' },
  pymongo: { name: 'pymongo', type: 'Database', displayName: 'MongoDB' },
  redis_py: { name: 'redis', type: 'Database', displayName: 'Redis' }
};

export function mapPackageToNode(specifier: string): PackageMapping | null {
  const root = packageRoot(specifier).toLowerCase();
  if (PACKAGE_MAP[root]) return PACKAGE_MAP[root];

  // scoped partial hits already handled via packageRoot
  // Skip pure tooling
  if (
    root.startsWith('eslint') ||
    root.startsWith('prettier') ||
    root.startsWith('@types/') ||
    root === 'typescript' ||
    root === 'vite' ||
    root === 'webpack' ||
    root === 'nodemon'
  ) {
    return null;
  }

  return null;
}
