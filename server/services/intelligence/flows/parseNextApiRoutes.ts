import { normalizePath } from '../ignore.js';
import type { DetectedRoute, RequestMethod } from './types.js';

type ParsedMethod = RequestMethod | 'OPTIONS' | 'HEAD' | 'ALL';

/**
 * Derive a URL path from a Next.js API file path.
 * pages/api/auth/login.ts → /api/auth/login
 * app/api/auth/login/route.ts → /api/auth/login
 */
export function nextPathFromFile(filePath: string): string | null {
  const path = normalizePath(filePath).replace(/\\/g, '/');
  const lower = path.toLowerCase();

  const appMatch = lower.match(/(?:^|\/)app\/(api\/.+)\/route\.(js|ts|jsx|tsx)$/);
  if (appMatch) {
    return normalizeNextPath(appMatch[1]);
  }

  const pagesMatch = lower.match(/(?:^|\/)pages\/(api\/.+)\.(js|ts|jsx|tsx)$/);
  if (pagesMatch) {
    let p = pagesMatch[1];
    p = p.replace(/\/index$/i, '');
    return normalizeNextPath(p);
  }

  return null;
}

function normalizeNextPath(raw: string): string {
  let p = raw
    .replace(/\\/g, '/')
    .replace(/\[\[\.\.\.([^\]]+)\]\]/g, ':$1*')
    .replace(/\[\.\.\.([^\]]+)\]/g, ':$1*')
    .replace(/\[([^\]]+)\]/g, ':$1');
  if (!p.startsWith('/')) p = `/${p}`;
  return p.replace(/\/+/g, '/');
}

function methodsFromExports(source: string): ParsedMethod[] {
  const found = new Set<ParsedMethod>();

  for (const m of source.matchAll(
    /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g
  )) {
    found.add(m[1] as ParsedMethod);
  }

  for (const m of source.matchAll(
    /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*=/g
  )) {
    found.add(m[1] as ParsedMethod);
  }

  for (const m of source.matchAll(
    /req\.method\s*===?\s*['"`](GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)['"`]/gi
  )) {
    found.add(m[1].toUpperCase() as ParsedMethod);
  }

  for (const m of source.matchAll(
    /method\s*===?\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/gi
  )) {
    found.add(m[1].toUpperCase() as ParsedMethod);
  }

  if (found.size === 0) {
    if (/export\s+default/.test(source) || /export\s+async\s+function\s+handler/.test(source)) {
      return ['ALL'];
    }
  }

  return [...found];
}

/**
 * Detect Next.js App Router + Pages API routes from file paths + exports.
 */
export function parseNextApiRoutes(
  filePath: string,
  source: string | undefined
): DetectedRoute[] {
  const urlPath = nextPathFromFile(filePath);
  if (!urlPath) return [];

  const methods: ParsedMethod[] =
    source && source.trim() ? methodsFromExports(source) : ['ALL'];

  const effective = methods.length > 0 ? methods : (['ALL'] as ParsedMethod[]);

  return effective.map((method) => ({
    method,
    path: urlPath,
    handlers: method === 'ALL' ? ['default'] : [method, 'default'],
    sourceFile: normalizePath(filePath),
    framework: 'Next.js' as const
  }));
}

export function isNextApiFile(filePath: string): boolean {
  return nextPathFromFile(filePath) != null;
}
