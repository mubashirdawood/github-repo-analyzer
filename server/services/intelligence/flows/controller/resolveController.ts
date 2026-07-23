/**
 * Locate a controller function implementation in the repository.
 */

import { normalizePath } from '../../ignore.js';
import { buildPathIndex, resolveImportPath } from '../../graph/resolveImport.js';
import { buildImportNameMap } from '../expressLegacyMounts.js';
import { findFunctionBody } from '../traceHandler.js';
import {
  isCallExpression,
  isIdentifier,
  isMemberExpression,
  memberName,
  parseSource,
  walk,
  type AstNode
} from './astUtils.js';
import type { ResolvedController } from './types.js';

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

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitReference(reference: string): { object: string | null; method: string } {
  const parts = reference.split('.').filter(Boolean);
  if (parts.length >= 2) {
    return { object: parts[0]!, method: parts[parts.length - 1]! };
  }
  return { object: null, method: parts[0] || reference };
}

/**
 * Find the AST node that defines `methodName` and return its body range.
 */
function findFunctionRangeAst(
  source: string,
  filePath: string,
  methodName: string
): { body: string; bodyStart: number; bodyEnd: number } | null {
  const ast = parseSource(filePath, source);
  if (!ast) return null;

  let found: { body: string; bodyStart: number; bodyEnd: number } | null = null;

  const takeFunctionLike = (fn: AstNode | null | undefined) => {
    if (!fn || found) return;
    if (
      fn.type !== 'FunctionExpression' &&
      fn.type !== 'ArrowFunctionExpression' &&
      fn.type !== 'FunctionDeclaration' &&
      fn.type !== 'ClassMethod' &&
      fn.type !== 'ObjectMethod' &&
      fn.type !== 'ClassPrivateMethod'
    ) {
      return;
    }
    // Prefer block body
    const bodyNode = fn.body;
    if (bodyNode && !Array.isArray(bodyNode) && typeof bodyNode.start === 'number' && typeof bodyNode.end === 'number') {
      if (bodyNode.type === 'BlockStatement') {
        found = {
          body: source.slice(bodyNode.start + 1, bodyNode.end - 1),
          bodyStart: bodyNode.start,
          bodyEnd: bodyNode.end
        };
      } else {
        // Concise arrow: expr body
        found = {
          body: source.slice(bodyNode.start, bodyNode.end),
          bodyStart: bodyNode.start,
          bodyEnd: bodyNode.end
        };
      }
    } else if (typeof fn.start === 'number' && typeof fn.end === 'number') {
      found = {
        body: source.slice(fn.start, fn.end),
        bodyStart: fn.start,
        bodyEnd: fn.end
      };
    }
  };

  const nameMatches = (node: AstNode | null | undefined): boolean =>
    Boolean(node && isIdentifier(node) && node.name === methodName);

  walk(ast, (node) => {
    if (found) return false;

    // function login() {}
    if (node.type === 'FunctionDeclaration' && nameMatches(node.id)) {
      takeFunctionLike(node);
      return;
    }

    // const login = async () => {}
    if (node.type === 'VariableDeclarator' && nameMatches(node.id) && node.init) {
      takeFunctionLike(node.init);
      return;
    }

    // exports.login = async () => {}  /  module.exports.login =
    if (node.type === 'AssignmentExpression' && node.left && node.right) {
      const left = node.left;
      if (isMemberExpression(left) && memberName(left) === methodName) {
        const obj = left.object;
        const objName =
          isIdentifier(obj ?? null) && obj?.name
            ? obj.name
            : isMemberExpression(obj ?? null) && memberName(obj!) === 'exports'
              ? 'module.exports'
              : null;
        if (
          objName === 'exports' ||
          objName === 'module.exports' ||
          (isMemberExpression(obj ?? null) &&
            isIdentifier(obj?.object ?? null) &&
            obj?.object?.name === 'module' &&
            memberName(obj!) === 'exports')
        ) {
          takeFunctionLike(node.right);
          return;
        }
        // authController.login = … (less common)
        takeFunctionLike(node.right);
        return;
      }
    }

    // class AuthController { login() {} }
    if (
      (node.type === 'ClassMethod' || node.type === 'ClassPrivateMethod' || node.type === 'ObjectMethod') &&
      node.key &&
      ((isIdentifier(node.key) && node.key.name === methodName) ||
        (node.key.type === 'StringLiteral' && node.key.value === methodName))
    ) {
      takeFunctionLike(node);
      return;
    }

    // export const login = …
    if (node.type === 'ExportNamedDeclaration' && node.declaration) {
      // handled via nested VariableDeclaration walk
    }
  });

  return found;
}

/**
 * Score candidate files for a given object name (authController / userService).
 */
function findCandidateFiles(
  objectName: string | null,
  methodName: string,
  files: string[],
  fileContents: Record<string, string>,
  hintFile?: string,
  prefer: 'controller' | 'service' | 'middleware' = 'controller'
): string[] {
  const pathIndex = buildPathIndex(files);
  const candidates: string[] = [];
  const seen = new Set<string>();
  const roleRe =
    prefer === 'service' ? /service/i : prefer === 'middleware' ? /middleware/i : /controller/i;
  const roleSuffix =
    prefer === 'service' ? 'service' : prefer === 'middleware' ? 'middleware' : 'controller';

  const push = (p: string | null | undefined) => {
    if (!p) return;
    const n = normalizePath(p);
    if (seen.has(n)) return;
    seen.add(n);
    candidates.push(n);
  };

  for (const file of files) {
    const content = resolveContent(fileContents, file);
    if (!content) continue;
    if (new RegExp(`\\b${escapeRe(methodName)}\\b`).test(content) && findFunctionBody(content, methodName)) {
      if (roleRe.test(file) || (objectName && file.toLowerCase().includes(objectName.toLowerCase()))) {
        push(file);
      }
    }
  }

  if (objectName) {
    const lower = objectName.toLowerCase();
    const compact = lower.replace(/\./g, '');
    for (const [, canonical] of pathIndex.byPath) {
      const base = canonical.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
      const baseLower = base.toLowerCase();
      const baseCompact = baseLower.replace(/\./g, '');
      if (
        baseLower === lower ||
        baseCompact === compact ||
        baseLower === `${lower}.${roleSuffix}` ||
        baseCompact === `${compact}${roleSuffix}` ||
        baseCompact === compact.replace(new RegExp(`${roleSuffix}$`), '') + roleSuffix
      ) {
        push(canonical);
      }
    }
  }

  if (hintFile) push(hintFile);

  const hintDir = hintFile
    ? normalizePath(hintFile).includes('/')
      ? normalizePath(hintFile).slice(0, normalizePath(hintFile).lastIndexOf('/'))
      : ''
    : '';

  candidates.sort((a, b) => {
    const score = (p: string) => {
      let s = 0;
      if (hintDir && p.startsWith(hintDir + '/')) s += 20;
      if (roleRe.test(p)) s += 12;
      if (objectName && p.toLowerCase().includes(objectName.toLowerCase())) s += 15;
      const content = resolveContent(fileContents, p);
      if (content && findFunctionBody(content, methodName)) s += 25;
      return -s;
    };
    return score(a) - score(b) || a.localeCompare(b);
  });

  return candidates;
}

export interface ResolveControllerOptions {
  controller: string;
  files: string[];
  fileContents?: Record<string, string>;
  hintFile?: string;
  importMap?: Map<string, string>;
  /** Prefer controller, service, or middleware paths when scoring candidates. */
  prefer?: 'controller' | 'service' | 'middleware';
}

/**
 * Resolve `authController.login` → file + function body.
 */
export function resolveController(options: ResolveControllerOptions): ResolvedController | null {
  const reference = options.controller.trim();
  if (!reference) return null;

  const { object, method } = splitReference(reference);
  const files = (options.files || []).map(normalizePath);
  const fileContents = options.fileContents ?? {};
  const hintFile = options.hintFile ? normalizePath(options.hintFile) : undefined;

  // Build import map from hint file when not provided
  let importMap = options.importMap;
  if (!importMap && hintFile) {
    const hintSource = resolveContent(fileContents, hintFile);
    if (hintSource) {
      const pathIndex = buildPathIndex(files);
      const resolve = (spec: string) => resolveImportPath(hintFile, spec, pathIndex);
      importMap = buildImportNameMap(hintSource, resolve);
    }
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (p: string | null | undefined) => {
    if (!p) return;
    const n = normalizePath(p);
    if (seen.has(n)) return;
    seen.add(n);
    ordered.push(n);
  };

  // 1) Explicit import binding
  if (object && importMap?.has(object)) {
    add(importMap.get(object));
  }

  // 2) Heuristic file candidates
  for (const c of findCandidateFiles(
    object,
    method,
    files,
    fileContents,
    hintFile,
    options.prefer ?? 'controller'
  )) {
    add(c);
  }

  for (const file of ordered) {
    const source = resolveContent(fileContents, file);
    if (!source) continue;

    // AST body first
    const astRange = findFunctionRangeAst(source, file, method);
    if (astRange) {
      return {
        name: method,
        reference,
        file,
        source,
        body: astRange.body,
        bodyStart: astRange.bodyStart,
        bodyEnd: astRange.bodyEnd
      };
    }

    // Regex / brace-scanner fallback from traceHandler
    const body = findFunctionBody(source, method);
    if (body != null) {
      return {
        name: method,
        reference,
        file,
        source,
        body
      };
    }
  }

  return null;
}
