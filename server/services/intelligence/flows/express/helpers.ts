/**
 * Shared path / handler helpers for Express route parsing.
 */

import type { ExpressHttpMethod } from './types.js';

export const EXPRESS_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

export function toExpressMethod(raw: string): ExpressHttpMethod | null {
  const upper = raw.toUpperCase();
  if (
    upper === 'GET' ||
    upper === 'POST' ||
    upper === 'PUT' ||
    upper === 'PATCH' ||
    upper === 'DELETE'
  ) {
    return upper;
  }
  return null;
}

export function cleanEndpoint(p: string): string {
  let path = p.trim();
  if (!path) return '/';
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/+/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

export function joinEndpoint(prefix: string | undefined, path: string): string {
  if (!prefix) return cleanEndpoint(path);
  const a = prefix.replace(/\/+$/, '');
  const b = path.startsWith('/') ? path : `/${path}`;
  return cleanEndpoint(`${a}${b}`);
}

/**
 * Split a handler expression list into middleware[] + controller.
 * Last named handler is the controller; earlier ones are middleware.
 */
export function splitHandlers(handlers: string[]): {
  middleware: string[];
  controller: string | null;
} {
  const named = handlers
    .map((h) => normalizeHandlerExpr(h))
    .filter((h): h is string => Boolean(h));

  if (named.length === 0) {
    return { middleware: [], controller: null };
  }
  if (named.length === 1) {
    return { middleware: [], controller: named[0]! };
  }
  return {
    middleware: named.slice(0, -1),
    controller: named[named.length - 1]!
  };
}

/**
 * Normalize a handler token: strip .bind(), reject inlines.
 */
export function normalizeHandlerExpr(raw: string): string | null {
  let h = raw.trim();
  if (!h) return null;

  // Skip inline functions / arrows
  if (
    h.startsWith('(') ||
    h.startsWith('async') ||
    h.startsWith('function') ||
    h.includes('=>')
  ) {
    return null;
  }

  h = h.replace(/\.bind\s*\([^)]*\)\s*$/, '').trim();

  // authController.login or validate or usersController.create.bind → already stripped
  const m = h.match(/^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)/);
  return m?.[1] ?? null;
}

/**
 * Flatten handler args that may include array literals: [mw1, mw2], ctrl
 */
export function flattenHandlerTokens(tokens: string[]): string[] {
  const out: string[] = [];
  for (const token of tokens) {
    const t = token.trim();
    if (t.startsWith('[') && t.endsWith(']')) {
      const inner = t.slice(1, -1);
      out.push(...splitTopLevelCommas(inner));
      continue;
    }
    out.push(t);
  }
  return out;
}

export function splitTopLevelCommas(blob: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of blob) {
    if (ch === '(' || ch === '{' || ch === '[') depth += 1;
    if (ch === ')' || ch === '}' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      const token = current.trim();
      if (token) parts.push(token);
      current = '';
      continue;
    }
    current += ch;
  }
  const last = current.trim();
  if (last) parts.push(last);
  return parts;
}
