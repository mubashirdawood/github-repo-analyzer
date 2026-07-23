/**
 * Express route bridge — adapts the structured Express Route Parser
 * into DetectedRoute for the Request Flow Analyzer.
 *
 * Prefer AST parsing; regex is used only when AST fails.
 */

import { normalizePath } from '../ignore.js';
import {
  parseExpressMounts,
  parseExpressRouteFile,
  toDetectedHandlers
} from './express/index.js';
import type { DetectedRoute } from './types.js';

export {
  buildImportNameMap,
  discoverExpressMounts
} from './expressLegacyMounts.js';

/**
 * Detect Express-style route registrations in a source file.
 * Uses AST-first Express Route Parser → DetectedRoute.
 */
export function parseExpressRoutes(
  filePath: string,
  source: string,
  mountPrefixes: Map<string, string> = new Map()
): DetectedRoute[] {
  const path = normalizePath(filePath);
  const fileMount = mountPrefixes.get(path);
  const decls = parseExpressRouteFile(path, source, { mountPrefix: fileMount });

  return decls.map((decl) => ({
    method: decl.method,
    path: decl.endpoint,
    handlers: toDetectedHandlers(decl),
    sourceFile: normalizePath(decl.sourceFile ?? path),
    framework: 'Express' as const,
    mountPrefix: fileMount
  }));
}

/**
 * Re-export structured parser entry points for direct use.
 */
export { parseExpressRouteFile, parseExpressMounts, scanExpressRoutes } from './express/index.js';
