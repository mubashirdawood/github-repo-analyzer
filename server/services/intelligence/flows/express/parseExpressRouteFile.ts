/**
 * Express Route Parser
 * ====================
 * AST-first extraction of Express route declarations with regex fallback.
 * Supports nested routers via app.use('/prefix', subRouter).
 */

import { normalizePath } from '../../ignore.js';
import { classifyFileNodeType } from '../../graph/classifyNode.js';
import { buildPathIndex, resolveImportPath } from '../../graph/resolveImport.js';
import { buildImportNameMap } from '../expressLegacyMounts.js';
import {
  parseExpressMountsWithAst,
  parseExpressRoutesWithAst
} from './parseWithAst.js';
import {
  parseExpressMountsWithRegex,
  parseExpressRoutesWithRegex
} from './parseWithRegex.js';
import { joinEndpoint } from './helpers.js';
import type {
  ExpressRouteDeclaration,
  ExpressRouterMount,
  ParseExpressRouteFileOptions,
  ScanExpressRoutesOptions
} from './types.js';

function resolveContent(
  fileContents: Record<string, string> | undefined,
  path: string
): string | undefined {
  if (!fileContents) return undefined;
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
 * Parse a single Express route file.
 * Tries TypeScript AST first; falls back to regex if AST returns null.
 */
export function parseExpressRouteFile(
  filePath: string,
  source: string,
  options: ParseExpressRouteFileOptions = {}
): ExpressRouteDeclaration[] {
  const path = normalizePath(filePath);
  const preferAst = options.preferAst !== false;
  const mountPrefix = options.mountPrefix;

  if (preferAst) {
    const astRoutes = parseExpressRoutesWithAst(path, source, mountPrefix);
    if (astRoutes != null) return astRoutes;
  }

  return parseExpressRoutesWithRegex(path, source, mountPrefix);
}

/**
 * Discover nested router mounts in a file (AST → regex fallback).
 */
export function parseExpressMounts(
  filePath: string,
  source: string
): ExpressRouterMount[] {
  const path = normalizePath(filePath);
  const ast = parseExpressMountsWithAst(path, source);
  if (ast != null) return ast;
  return parseExpressMountsWithRegex(path, source);
}

/**
 * Scan repository files for Express routes, resolving nested router prefixes.
 *
 * Returns structured JSON-friendly declarations:
 *   { method, endpoint, middleware, controller }
 */
export function scanExpressRoutes(
  options: ScanExpressRoutesOptions
): ExpressRouteDeclaration[] {
  const files = (options.files || []).map(normalizePath).filter(Boolean);
  const fileContents = options.fileContents ?? {};
  const maxRoutes = options.maxRoutes ?? 200;
  const pathIndex = buildPathIndex(files);

  // —— Pass 1: discover mounts (nested routers) ——
  // Maps route-module file → accumulated URL prefix
  const filePrefixes = new Map<string, string>();

  for (const file of files) {
    const content = resolveContent(fileContents, file);
    if (!content || !/\.use\s*\(/.test(content)) continue;

    const resolve = (spec: string) => resolveImportPath(file, spec, pathIndex);
    const importMap = buildImportNameMap(content, resolve);
    const mounts = parseExpressMounts(file, content);

    for (const mount of mounts) {
      // Resolve routerName → file via import map, or treat routerName as path
      let targetFile = importMap.get(mount.routerName);
      if (!targetFile && mount.routerName.includes('/')) {
        targetFile = resolve(mount.routerName) ?? undefined;
      }
      if (!targetFile) continue;

      const parentPrefix = filePrefixes.get(normalizePath(file)) ?? '';
      const combined = joinEndpoint(parentPrefix || undefined, mount.prefix);
      const existing = filePrefixes.get(targetFile);
      // Prefer longer / first-discovered specific prefix
      if (!existing || combined.length > existing.length) {
        filePrefixes.set(targetFile, combined);
      }
    }
  }

  // Propagate nested mounts one more hop (router.use inside a mounted router)
  for (let hop = 0; hop < 3; hop += 1) {
    let changed = false;
    for (const file of files) {
      const content = resolveContent(fileContents, file);
      if (!content || !/\.use\s*\(/.test(content)) continue;

      const parentPrefix = filePrefixes.get(file);
      if (parentPrefix == null && hop > 0) continue;

      const resolve = (spec: string) => resolveImportPath(file, spec, pathIndex);
      const importMap = buildImportNameMap(content, resolve);
      const mounts = parseExpressMounts(file, content);

      for (const mount of mounts) {
        let targetFile = importMap.get(mount.routerName);
        if (!targetFile && mount.routerName.includes('/')) {
          targetFile = resolve(mount.routerName) ?? undefined;
        }
        if (!targetFile) continue;

        const base = parentPrefix ?? '';
        const combined = joinEndpoint(base || undefined, mount.prefix);
        const existing = filePrefixes.get(targetFile);
        if (!existing || combined.length > existing.length) {
          filePrefixes.set(targetFile, combined);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // —— Pass 2: parse route files ——
  const results: ExpressRouteDeclaration[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const content = resolveContent(fileContents, file);
    if (!content) continue;

    const type = classifyFileNodeType(file);
    const looksLikeExpress =
      type === 'Route' ||
      type === 'Backend' ||
      /\b(?:router|app|server)\.(get|post|put|patch|delete|route)\s*\(/i.test(content) ||
      filePrefixes.has(file);

    if (!looksLikeExpress) continue;

    const mountPrefix = filePrefixes.get(file);
    const decls = parseExpressRouteFile(file, content, { mountPrefix });

    for (const decl of decls) {
      const key = `${decl.method} ${decl.endpoint} :: ${decl.controller ?? ''} :: ${decl.sourceFile}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(decl);
      if (results.length >= maxRoutes) {
        return sortRoutes(results);
      }
    }
  }

  return sortRoutes(results);
}

function sortRoutes(routes: ExpressRouteDeclaration[]): ExpressRouteDeclaration[] {
  return routes.sort((a, b) => {
    const byPath = a.endpoint.localeCompare(b.endpoint);
    if (byPath !== 0) return byPath;
    return a.method.localeCompare(b.method);
  });
}

/**
 * Convert ExpressRouteDeclaration → legacy DetectedRoute handlers list
 * (middleware + controller) for the Request Flow Analyzer.
 */
export function toDetectedHandlers(decl: ExpressRouteDeclaration): string[] {
  const handlers = [...decl.middleware];
  if (decl.controller) handlers.push(decl.controller);
  return handlers.length ? handlers : ['handler'];
}
