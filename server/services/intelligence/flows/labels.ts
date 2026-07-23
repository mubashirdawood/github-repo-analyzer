import { getFileName, normalizePath } from '../ignore.js';
import { classifyFileNodeType } from '../graph/classifyNode.js';

/**
 * Convert a path or identifier into a readable flow step.
 * authController → "Auth Controller"
 * userService.login → "User Service"
 */
export function humanizeIdentifier(raw: string): string {
  let name = raw.trim();
  // Strip .login / .findOne trailing method for the module label
  if (name.includes('.')) {
    name = name.split('.')[0] ?? name;
  }
  name = name.replace(/^.*\//, '');
  name = name.replace(/\.(js|ts|jsx|tsx|mjs|cjs)$/i, '');

  // userService → User Service; authRoutes → Auth Route
  const spaced = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(routes?|controllers?|services?|models?|middlewares?)\b/gi, (m) => {
      const map: Record<string, string> = {
        route: 'Route',
        routes: 'Route',
        controller: 'Controller',
        controllers: 'Controller',
        service: 'Service',
        services: 'Service',
        model: 'Model',
        models: 'Model',
        middleware: 'Middleware',
        middlewares: 'Middleware'
      };
      return map[m.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();

  return spaced
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function humanizeFilePath(filePath: string): string {
  const path = normalizePath(filePath);
  const lower = path.toLowerCase();

  // Next.js app/api/health/route.ts → "Health API"
  const appApi = lower.match(/(?:^|\/)app\/api\/(.+)\/route\.(js|ts|jsx|tsx)$/);
  if (appApi) {
    const segments = appApi[1].split('/').filter((s) => !s.startsWith('(') && !s.startsWith('_'));
    const name = segments.map((s) => humanizeIdentifier(s.replace(/^\[|\]$/g, ''))).join(' ');
    return `${name || 'API'} API`;
  }

  // pages/api/auth/login.ts → "Auth Login API"
  const pagesApi = lower.match(/(?:^|\/)pages\/api\/(.+)\.(js|ts|jsx|tsx)$/);
  if (pagesApi) {
    const segments = pagesApi[1].replace(/\/index$/i, '').split('/');
    const name = segments.map((s) => humanizeIdentifier(s.replace(/^\[|\]$/g, ''))).join(' ');
    return `${name || 'API'} API`;
  }

  const type = classifyFileNodeType(path);
  const base = humanizeIdentifier(getFileName(path));

  const roleSuffix: Partial<Record<string, string>> = {
    Route: 'Route',
    Controller: 'Controller',
    Service: 'Service',
    Model: 'Model',
    Middleware: 'Middleware',
    Repository: 'Repository',
    Authentication: 'Auth'
  };

  const suffix = roleSuffix[type];
  if (suffix && !new RegExp(suffix, 'i').test(base)) {
    return `${base} ${suffix}`.replace(/\s+/g, ' ').trim();
  }
  return base;
}

/** Known package → flow label. */
export function packageFlowLabel(pkg: string): string | null {
  const root = pkg.startsWith('@')
    ? pkg.split('/').slice(0, 2).join('/')
    : pkg.split('/')[0] ?? pkg;

  const map: Record<string, string> = {
    express: 'Express',
    fastify: 'Fastify',
    '@nestjs/core': 'NestJS',
    '@nestjs/common': 'NestJS',
    next: 'Next.js',
    mongoose: 'MongoDB',
    mongodb: 'MongoDB',
    pg: 'PostgreSQL',
    mysql: 'MySQL',
    mysql2: 'MySQL',
    redis: 'Redis',
    ioredis: 'Redis',
    jsonwebtoken: 'JWT',
    jose: 'JWT',
    bcrypt: 'bcrypt',
    bcryptjs: 'bcrypt',
    passport: 'Passport',
    'next-auth': 'NextAuth',
    axios: 'HTTP Client',
    stripe: 'Stripe',
    openai: 'OpenAI'
  };

  return map[root.toLowerCase()] ?? null;
}

export function frameworkLabel(framework: string): string {
  switch (framework) {
    case 'Express':
      return 'Express';
    case 'Next.js':
      return 'Next.js';
    case 'NestJS':
      return 'NestJS';
    default:
      return 'HTTP Server';
  }
}

/**
 * Deduplicate consecutive identical flow steps while preserving order.
 */
export function uniqueFlowSteps(steps: string[]): string[] {
  const out: string[] = [];
  for (const step of steps) {
    if (!step) continue;
    if (out[out.length - 1] === step) continue;
    if (out.includes(step) && step !== 'Response') continue;
    out.push(step);
  }
  return out;
}
