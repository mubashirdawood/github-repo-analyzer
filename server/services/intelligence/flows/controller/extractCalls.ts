/**
 * Extract call expressions from a controller function body.
 * AST-first, regex fallback.
 */

import {
  calleeToString,
  isCallExpression,
  isIdentifier,
  isMemberExpression,
  memberName,
  parseSource,
  walk,
  type AstNode
} from './astUtils.js';
import { applyBindingAliases, buildBindingAliases } from './bindings.js';
import { uniqueCalls } from './normalizeCalls.js';

const SKIP_ROOTS = new Set([
  'console',
  'Math',
  'JSON',
  'Object',
  'Array',
  'Promise',
  'Error',
  'Number',
  'String',
  'Boolean',
  'Date',
  'Map',
  'Set',
  'require',
  'parseInt',
  'parseFloat'
]);

function finalizeCalls(rawCalls: string[], aliases: Map<string, string>): string[] {
  const mapped = rawCalls.map((c) => applyBindingAliases(c, aliases));
  return uniqueCalls(mapped);
}

/**
 * Extract calls from a full source file within [bodyStart, bodyEnd), via AST.
 */
export function extractCallsWithAst(
  source: string,
  filePath: string,
  bodyStart?: number,
  bodyEnd?: number,
  aliases?: Map<string, string>
): string[] | null {
  const ast = parseSource(filePath, source);
  if (!ast) return null;

  const bindingAliases = aliases ?? buildBindingAliases(filePath, source);
  const calls: string[] = [];
  const rangeStart = bodyStart ?? 0;
  const rangeEnd = bodyEnd ?? source.length;

  walk(ast, (node) => {
    if (!isCallExpression(node) || !node.callee) return;
    if (typeof node.start === 'number' && (node.start < rangeStart || node.start >= rangeEnd)) {
      return;
    }

    const callee = node.callee;

    if (isMemberExpression(callee) && memberName(callee) === 'bind') {
      return;
    }

    const raw = calleeToString(callee, source);
    if (!raw) return;

    const root = raw.split('.')[0]!;
    if (SKIP_ROOTS.has(root)) return;
    if (/^(res|req|next|response|request)$/i.test(root)) return;

    calls.push(raw);
  });

  walk(ast, (node) => {
    if (node.type !== 'NewExpression' || !node.callee) return;
    if (typeof node.start === 'number' && (node.start < rangeStart || node.start >= rangeEnd)) {
      return;
    }
    if (isIdentifier(node.callee) && node.callee.name) {
      calls.push(node.callee.name);
    } else {
      const raw = calleeToString(node.callee, source);
      if (raw) calls.push(raw);
    }
  });

  return finalizeCalls(calls, bindingAliases);
}

/**
 * Regex fallback over a function body string.
 */
export function extractCallsWithRegex(
  body: string,
  aliases: Map<string, string> = new Map()
): string[] {
  const calls: string[] = [];
  const re =
    /\b(?:new\s+)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*){0,4})\s*\(/g;

  for (const m of body.matchAll(re)) {
    const raw = m[1];
    if (!raw) continue;
    const root = raw.split('.')[0]!;
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
        'console',
        'Math',
        'JSON',
        'Object',
        'Array',
        'Promise',
        'Error',
        'res',
        'req',
        'next',
        'parseInt',
        'parseFloat',
        'require'
      ].includes(root)
    ) {
      continue;
    }
    calls.push(raw);
  }

  return finalizeCalls(calls, aliases);
}

/**
 * Extract + normalize calls for a resolved controller.
 */
export function extractControllerCalls(
  source: string,
  filePath: string,
  body: string | null,
  bodyStart?: number,
  bodyEnd?: number
): { calls: string[]; parser: 'ast' | 'regex' } {
  const aliases = buildBindingAliases(filePath, source);

  if (bodyStart != null && bodyEnd != null) {
    const astCalls = extractCallsWithAst(source, filePath, bodyStart, bodyEnd, aliases);
    if (astCalls != null) {
      return { calls: astCalls, parser: 'ast' };
    }
  }

  if (body) {
    return { calls: extractCallsWithRegex(body, aliases), parser: 'regex' };
  }

  const astAll = extractCallsWithAst(source, filePath, undefined, undefined, aliases);
  if (astAll != null) {
    return { calls: astAll, parser: 'ast' };
  }

  return { calls: [], parser: 'regex' };
}
