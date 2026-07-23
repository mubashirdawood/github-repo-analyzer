/**
 * Import-map + mount discovery helpers shared by Request Flow Analyzer
 * and the Express Route Parser.
 */

import { normalizePath } from '../ignore.js';
import { cleanEndpoint } from './express/helpers.js';
import { parseExpressMounts } from './express/index.js';

/**
 * Find app.use('/auth', authRoutes) style mounts and map imported route files → prefix.
 */
export function discoverExpressMounts(
  filePath: string,
  source: string,
  importMap: Map<string, string>
): Map<string, string> {
  const mounts = new Map<string, string>();
  const parsed = parseExpressMounts(filePath, source);

  for (const mount of parsed) {
    const resolved = importMap.get(mount.routerName);
    if (resolved) {
      mounts.set(normalizePath(resolved), cleanEndpoint(mount.prefix));
      continue;
    }
    // require('./routes/x') style — routerName may already be a relative path
    if (mount.routerName.includes('/')) {
      // Leave unresolved here; scanExpressRoutes handles path resolve
    }
  }

  return mounts;
}

/**
 * Build localName → resolved path from import statements.
 */
export function buildImportNameMap(
  source: string,
  resolve: (specifier: string) => string | null
): Map<string, string> {
  const map = new Map<string, string>();

  for (const m of source.matchAll(
    /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g
  )) {
    const resolved = resolve(m[2]);
    if (resolved) map.set(m[1], resolved);
  }

  for (const m of source.matchAll(
    /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g
  )) {
    const resolved = resolve(m[2]);
    if (!resolved) continue;
    for (const part of m[1].split(',')) {
      const bits = part.trim().split(/\s+as\s+/i);
      const local = (bits[1] ?? bits[0])?.trim();
      const exported = bits[0]?.trim();
      if (local) map.set(local, resolved);
      if (exported && exported !== local) map.set(exported, resolved);
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
