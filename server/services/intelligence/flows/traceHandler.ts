import { normalizePath } from '../ignore.js';
import { classifyFileNodeType } from '../graph/classifyNode.js';
import { parseImports } from '../graph/parseImports.js';
import { buildPathIndex, resolveImportPath } from '../graph/resolveImport.js';
import {
  humanizeFilePath,
  humanizeIdentifier,
  packageFlowLabel
} from './labels.js';
import type { RequestStep, RequestStepType } from './types.js';

export interface TraceContext {
  fileContents: Record<string, string>;
  pathIndex: ReturnType<typeof buildPathIndex>;
  databaseLabel?: string | null;
  authLabel?: string | null;
  maxDepth: number;
}

export interface TraceResult {
  steps: RequestStep[];
  confidence: 'high' | 'medium' | 'low';
}

function resolveContent(
  fileContents: Record<string, string>,
  path: string
): string | undefined {
  if (fileContents[path] != null) return fileContents[path];
  const norm = normalizePath(path);
  if (fileContents[norm] != null) return fileContents[norm];
  const lower = norm.toLowerCase();
  for (const [key, value] of Object.entries(fileContents)) {
    if (normalizePath(key).toLowerCase() === lower) return value;
  }
  return undefined;
}

/**
 * Extract called identifiers from a function / method body.
 */
export function extractCallsFromBody(body: string): string[] {
  const calls: string[] = [];
  const re = /\b([A-Za-z_$][\w$]*)\s*(?:\.\s*([A-Za-z_$][\w$]*))?\s*\(/g;

  for (const m of body.matchAll(re)) {
    const obj = m[1];
    const method = m[2];
    if (
      [
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
        'res',
        'req',
        'next'
      ].includes(obj)
    ) {
      continue;
    }
    if (method) {
      calls.push(`${obj}.${method}`);
    } else {
      calls.push(obj);
    }
  }

  return [...new Set(calls)];
}

/**
 * Locate a function/method body by name inside source text.
 * Supports: function login(, login = (, exports.login = async (, class methods.
 */
export function findFunctionBody(source: string, handlerName: string): string | null {
  const short = handlerName.includes('.') ? handlerName.split('.').pop()! : handlerName;
  const nameRe = new RegExp(`\\b${escapeRe(short)}\\b`, 'g');
  let match: RegExpExecArray | null;

  while ((match = nameRe.exec(source)) !== null) {
    const before = source.slice(Math.max(0, match.index - 40), match.index);
    // Skip property access foo.short — but allow exports.short / module.exports.short
    if (/\.\s*$/.test(before) && !/(?:exports|module\.exports)\s*\.\s*$/.test(before)) {
      continue;
    }

    let i = match.index + short.length;
    while (i < source.length && /\s/.test(source[i]!)) i += 1;

    // exports.login = async (… or login = (
    if (source[i] === '=') {
      i += 1;
      while (i < source.length && /\s/.test(source[i]!)) i += 1;
      if (source.slice(i, i + 5) === 'async') {
        i += 5;
        while (i < source.length && /\s/.test(source[i]!)) i += 1;
      }
      if (source.slice(i, i + 8) === 'function') {
        i += 8;
        while (i < source.length && /\s/.test(source[i]!)) i += 1;
        while (i < source.length && /[A-Za-z0-9_$]/.test(source[i]!)) i += 1;
        while (i < source.length && /\s/.test(source[i]!)) i += 1;
      }
    }

    if (source[i] !== '(') continue;

    let depth = 0;
    for (; i < source.length; i += 1) {
      const ch = source[i]!;
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          i += 1;
          break;
        }
      }
    }

    while (i < source.length && /\s/.test(source[i]!)) i += 1;
    if (source[i] === ':') {
      i += 1;
      while (i < source.length && source[i] !== '{' && source[i] !== '=' && source[i] !== '\n') {
        i += 1;
      }
      while (i < source.length && /\s/.test(source[i]!)) i += 1;
    }

    if (source.slice(i, i + 2) === '=>') {
      i += 2;
      while (i < source.length && /\s/.test(source[i]!)) i += 1;
    }

    if (source[i] !== '{') continue;
    return sliceBalanced(source, i);
  }

  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sliceBalanced(source: string, openBraceIndex: number): string {
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openBraceIndex + 1, i);
    }
  }
  return source.slice(openBraceIndex + 1, openBraceIndex + 800);
}

/**
 * Map graph / package roles onto RequestStepType.
 */
export function toStepType(
  fileType: string,
  hint?: 'database' | 'authentication' | 'external_api' | 'response'
): RequestStepType {
  if (hint) return hint;
  switch (fileType) {
    case 'Route':
      return 'route';
    case 'Controller':
      return 'controller';
    case 'Service':
      return 'service';
    case 'Model':
      return 'model';
    case 'Middleware':
      return 'middleware';
    case 'Repository':
      return 'repository';
    case 'Authentication':
      return 'authentication';
    case 'External API':
      return 'external_api';
    case 'Database':
      return 'database';
    case 'Backend':
      return 'router';
    default:
      return 'handler';
  }
}

function packageStepType(label: string): RequestStepType {
  if (/^(JWT|bcrypt|Passport|NextAuth|Clerk)$/i.test(label)) return 'authentication';
  if (/^(MongoDB|PostgreSQL|MySQL|Redis|Prisma|SQLite|Database)$/i.test(label)) {
    return 'database';
  }
  if (/^(Stripe|OpenAI|HTTP Client|Cloudinary|Socket)$/i.test(label)) {
    return 'external_api';
  }
  return 'handler';
}

/**
 * Resolve a handler identifier to a file path.
 */
export function resolveHandlerFile(
  handler: string,
  routeFile: string,
  importMap: Map<string, string>,
  ctx: TraceContext
): string | null {
  const root = handler.includes('.') ? handler.split('.')[0]! : handler;
  const routeNorm = normalizePath(routeFile);

  if (importMap.has(root)) {
    return importMap.get(root)!;
  }

  const self = resolveContent(ctx.fileContents, routeFile);
  if (self && findFunctionBody(self, handler)) {
    return routeNorm;
  }

  if (self && new RegExp(`class\\s+${escapeRe(root)}\\b`).test(self)) {
    return routeNorm;
  }

  const lower = root.toLowerCase();
  const routeDir = routeNorm.includes('/')
    ? routeNorm.slice(0, routeNorm.lastIndexOf('/'))
    : '';

  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const [, canonical] of ctx.pathIndex.byPath) {
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const base = canonical.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
    const baseLower = base.toLowerCase();
    const compact = baseLower.replace(/\./g, '');
    const rootCompact = lower.replace(/\./g, '');

    if (
      baseLower === lower ||
      compact === rootCompact ||
      baseLower === `${lower}.controller` ||
      baseLower === `${lower}.service` ||
      compact === `${rootCompact}controller` ||
      compact === `${rootCompact}service`
    ) {
      candidates.push(canonical);
    }
  }

  if (candidates.length === 0) return null;

  const routeTop = routeNorm.split('/')[0] ?? '';
  candidates.sort((a, b) => {
    const score = (p: string) => {
      let s = 0;
      if (routeDir && p.startsWith(routeDir + '/')) s += 10;
      if (routeTop && p.startsWith(routeTop + '/')) s += 5;
      if (p === routeNorm) s += 20;
      return -s;
    };
    return score(a) - score(b) || a.localeCompare(b);
  });

  const best = candidates[0]!;
  const bestTop = best.split('/')[0] ?? '';
  if (routeTop && bestTop && routeTop !== bestTop && self) {
    return routeNorm;
  }

  return best;
}

interface PendingStep {
  type: RequestStepType;
  name: string;
  file: string;
  /** Soft terminal steps (JWT, bcrypt) appended after the main chain. */
  terminal?: boolean;
}

/**
 * Walk from a route handler into services / models / packages and collect steps.
 */
export function traceHandlerFlow(
  routeFile: string,
  handlers: string[],
  importMap: Map<string, string>,
  ctx: TraceContext
): TraceResult {
  const pending: PendingStep[] = [];
  const seenNames = new Set<string>();
  const visited = new Set<string>();
  let hitConcrete = false;

  const pushStep = (step: PendingStep) => {
    if (!step.name || seenNames.has(step.name)) return;
    seenNames.add(step.name);
    pending.push(step);
  };

  const routeNorm = normalizePath(routeFile);
  const routeType = classifyFileNodeType(routeNorm);
  pushStep({
    type: toStepType(routeType === 'Backend' ? 'Route' : routeType),
    name: humanizeFilePath(routeNorm),
    file: routeNorm
  });

  const queue: Array<{ file: string; handler: string; depth: number }> = [];

  for (const h of handlers) {
    // Middleware-style free identifiers on the route (protect, authenticate, …)
    if (
      !h.includes('.') &&
      /^(protect|auth|authenticate|authorize|verify|requireAuth|isAuth|checkAuth|guard)/i.test(
        h
      )
    ) {
      const mwFile = resolveHandlerFile(h, routeFile, importMap, ctx) ?? routeNorm;
      const mwNorm = normalizePath(mwFile);
      pushStep({
        type: 'middleware',
        name: humanizeFilePath(mwNorm),
        file: mwNorm
      });
      hitConcrete = true;
      // Still walk the middleware body for nested auth/db calls
      if (mwNorm !== routeNorm) {
        queue.push({ file: mwNorm, handler: h, depth: 0 });
      }
      continue;
    }

    if (h === 'default' || h === 'handler' || /^GET|POST|PUT|PATCH|DELETE$/.test(h)) {
      queue.push({ file: routeFile, handler: h, depth: 0 });
      continue;
    }

    const file = resolveHandlerFile(h, routeFile, importMap, ctx);
    if (file) {
      queue.push({ file, handler: h, depth: 0 });
    } else if (!h.includes('.')) {
      pushStep({
        type: 'handler',
        name: humanizeIdentifier(h),
        file: routeNorm
      });
    }
  }

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.depth > ctx.maxDepth) continue;
    const key = `${item.file}::${item.handler}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const content = resolveContent(ctx.fileContents, item.file);
    const fileNorm = normalizePath(item.file);

    if (!content) {
      pushStep({
        type: toStepType(classifyFileNodeType(fileNorm)),
        name: humanizeFilePath(fileNorm),
        file: fileNorm
      });
      continue;
    }

    const type = classifyFileNodeType(fileNorm);
    const label = humanizeFilePath(fileNorm);
    if (fileNorm !== routeNorm || item.depth > 0) {
      pushStep({
        type: toStepType(type),
        name: label,
        file: fileNorm
      });
      hitConcrete = true;
    }

    const body =
      item.handler === 'default' || /^GET|POST|PUT|PATCH|DELETE$/.test(item.handler)
        ? content
        : findFunctionBody(content, item.handler) ?? content;

    const calls = extractCallsFromBody(body);
    const localImports = buildLocalImportMap(item.file, content, ctx);

    for (const call of calls) {
      const root = call.includes('.') ? call.split('.')[0]! : call;
      const method = call.includes('.') ? call.split('.')[1] : null;

      if (
        method &&
        ['sign', 'verify', 'decode'].includes(method) &&
        /jwt|jsonwebtoken|jose/i.test(root)
      ) {
        pushStep({
          type: 'authentication',
          name: ctx.authLabel?.split(',')[0]?.trim() || 'JWT',
          file: fileNorm,
          terminal: true
        });
        hitConcrete = true;
        continue;
      }

      if (
        method &&
        [
          'find',
          'findOne',
          'findById',
          'findMany',
          'create',
          'save',
          'update',
          'updateOne',
          'deleteOne',
          'delete',
          'aggregate',
          'query',
          'exec'
        ].includes(method)
      ) {
        const db = ctx.databaseLabel?.split(',')[0]?.trim() || 'MongoDB';
        pushStep({
          type: 'database',
          name: db,
          file: fileNorm,
          terminal: true
        });
        hitConcrete = true;
      }

      // axios / fetch / got → external API
      if (
        /^(axios|got|fetch|request)$/i.test(root) ||
        (method && /^(get|post|put|patch|delete)$/i.test(method) && /^(axios|api|client|http)$/i.test(root))
      ) {
        pushStep({
          type: 'external_api',
          name: 'External API',
          file: fileNorm,
          terminal: true
        });
        hitConcrete = true;
      }

      const targetFile = localImports.get(root);
      if (targetFile && item.depth < ctx.maxDepth) {
        const t = classifyFileNodeType(targetFile);
        if (
          [
            'Controller',
            'Service',
            'Repository',
            'Model',
            'Middleware',
            'Authentication',
            'Utility'
          ].includes(t)
        ) {
          queue.push({
            file: targetFile,
            handler: method ? `${root}.${method}` : root,
            depth: item.depth + 1
          });
        }
      }
    }

    for (const imp of parseImports(item.file, content)) {
      if (!imp.isPackage) continue;
      const pkgLabel = packageFlowLabel(imp.specifier);
      if (!pkgLabel) continue;
      if (pkgLabel === 'Express' || pkgLabel === 'NestJS' || pkgLabel === 'Next.js') continue;

      const stepType = packageStepType(pkgLabel);
      pushStep({
        type: stepType,
        name: pkgLabel,
        file: fileNorm,
        terminal: stepType === 'authentication' || stepType === 'database' || stepType === 'external_api'
      });
      hitConcrete = true;
    }

    if (['Controller', 'Route', 'Service'].includes(type)) {
      for (const [, targetFile] of localImports) {
        const t = classifyFileNodeType(targetFile);
        if (
          ['Service', 'Repository', 'Model', 'Authentication'].includes(t) &&
          item.depth < ctx.maxDepth
        ) {
          queue.push({ file: targetFile, handler: 'default', depth: item.depth + 1 });
        }
      }
    }
  }

  // Stable order: non-terminal chain, then terminals, then Response
  const chain = pending.filter((s) => !s.terminal);
  const terminals = pending.filter((s) => s.terminal);
  const ordered = [...chain, ...terminals];

  // Drop accidental "Default" labels
  const cleaned = ordered.filter((s) => s.name && s.name !== 'Default');

  const steps: RequestStep[] = cleaned.map((s, i) => ({
    type: s.type,
    name: s.name,
    file: s.file,
    next: cleaned[i + 1]?.name
  }));

  // Always end with Response
  if (steps.length === 0 || steps[steps.length - 1]!.type !== 'response') {
    const last = steps[steps.length - 1];
    if (last) last.next = 'Response';
    steps.push({
      type: 'response',
      name: 'Response',
      file: routeNorm
    });
  }

  return {
    steps,
    confidence: hitConcrete ? (steps.length >= 3 ? 'high' : 'medium') : 'low'
  };
}

/**
 * Link `next` fields so each step points at the following step’s name.
 */
export function linkSteps(steps: RequestStep[]): RequestStep[] {
  return steps.map((step, i) => ({
    ...step,
    next: i < steps.length - 1 ? steps[i + 1]!.name : undefined
  }));
}

function buildLocalImportMap(
  filePath: string,
  source: string,
  ctx: TraceContext
): Map<string, string> {
  const map = new Map<string, string>();
  const resolve = (spec: string) => resolveImportPath(filePath, spec, ctx.pathIndex);

  for (const m of source.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g)) {
    const resolved = resolve(m[2]);
    if (resolved) map.set(m[1], resolved);
  }
  for (const m of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const resolved = resolve(m[2]);
    if (!resolved) continue;
    for (const part of m[1].split(',')) {
      const bits = part.trim().split(/\s+as\s+/i);
      const local = (bits[1] ?? bits[0])?.trim();
      if (local) map.set(local, resolved);
    }
  }
  for (const m of source.matchAll(
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  )) {
    const resolved = resolve(m[2]);
    if (resolved) map.set(m[1], resolved);
  }

  // const { login, register } = require('../controllers/authController')
  for (const m of source.matchAll(
    /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  )) {
    const resolved = resolve(m[2]);
    if (!resolved) continue;
    for (const part of m[1].split(',')) {
      const bits = part.trim().split(/\s+as\s+/i);
      const local = (bits[1] ?? bits[0])?.trim();
      if (local) map.set(local, resolved);
    }
  }

  return map;
}
