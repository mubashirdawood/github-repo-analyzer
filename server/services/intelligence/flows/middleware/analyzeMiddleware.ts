/**
 * Middleware Analyzer
 * ===================
 * Locate a middleware function and extract calls from its body.
 * AST-first. No LLM.
 */

import { resolveController } from '../controller/resolveController.js';
import { extractControllerCalls } from '../controller/extractCalls.js';
import { humanizeIdentifier } from '../labels.js';
import type { AnalyzeMiddlewareOptions, MiddlewareAnalysis } from './types.js';

function middlewareLabel(reference: string, resolvedName: string): string {
  const base = humanizeIdentifier(reference.includes('.') ? reference : resolvedName);
  if (/middleware/i.test(base)) return base;
  // validate → Validation Middleware; protect → Protect Middleware
  if (/valid/i.test(base)) return 'Validation Middleware';
  if (/auth|protect|guard|verify|jwt/i.test(base)) return `${base} Middleware`.replace(/\s+/g, ' ');
  return `${base} Middleware`;
}

/**
 * Analyze a single middleware function.
 */
export function analyzeMiddleware(options: AnalyzeMiddlewareOptions): MiddlewareAnalysis {
  const reference = (options.middleware || '').trim();
  const shortName = reference.includes('.')
    ? reference.split('.').pop()!
    : reference || 'unknown';

  if (!reference) {
    return { middleware: 'unknown', label: 'Middleware', calls: [] };
  }

  const resolved = resolveController({
    controller: reference,
    files: options.files,
    fileContents: options.fileContents,
    hintFile: options.hintFile,
    importMap: options.importMap,
    prefer: 'middleware'
  });

  if (!resolved) {
    return {
      middleware: shortName,
      label: middlewareLabel(reference, shortName),
      calls: []
    };
  }

  const { calls, parser } = extractControllerCalls(
    resolved.source,
    resolved.file,
    resolved.body,
    resolved.bodyStart,
    resolved.bodyEnd
  );

  return {
    middleware: resolved.name,
    label: middlewareLabel(reference, resolved.name),
    calls,
    sourceFile: resolved.file,
    parser
  };
}

/**
 * Analyze many middleware references (deduped).
 */
export function analyzeMiddlewares(
  middlewares: string[],
  options: Omit<AnalyzeMiddlewareOptions, 'middleware'>
): MiddlewareAnalysis[] {
  const seen = new Set<string>();
  const results: MiddlewareAnalysis[] = [];

  for (const ref of middlewares) {
    const key = ref.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    results.push(analyzeMiddleware({ ...options, middleware: key }));
  }

  return results;
}
