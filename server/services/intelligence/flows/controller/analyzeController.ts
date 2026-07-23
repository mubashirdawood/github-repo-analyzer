/**
 * Controller Analyzer
 * ===================
 * Given a detected controller reference (e.g. authController.login),
 * locate its implementation and list meaningful calls inside the body.
 *
 * AST-first (@babel/parser). Regex fallback. No LLM.
 */

import type { AnalyzeControllerOptions, ControllerAnalysis } from './types.js';
import { resolveController } from './resolveController.js';
import { extractControllerCalls } from './extractCalls.js';

/**
 * Analyze a single controller function.
 *
 * Example input:  "authController.login"
 * Example output: { controller: "login", calls: ["UserService.login", "JWT.sign", "User.findOne"] }
 */
export function analyzeController(options: AnalyzeControllerOptions): ControllerAnalysis {
  const reference = (options.controller || '').trim();
  const shortName = reference.includes('.')
    ? reference.split('.').pop()!
    : reference || 'unknown';

  if (!reference) {
    return { controller: 'unknown', calls: [] };
  }

  const resolved = resolveController({
    controller: reference,
    files: options.files,
    fileContents: options.fileContents,
    hintFile: options.hintFile,
    importMap: options.importMap
  });

  if (!resolved) {
    return {
      controller: shortName,
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
    controller: resolved.name,
    calls,
    sourceFile: resolved.file,
    parser
  };
}

/**
 * Analyze many controller references (deduped by reference string).
 */
export function analyzeControllers(
  controllers: string[],
  options: Omit<AnalyzeControllerOptions, 'controller'>
): ControllerAnalysis[] {
  const seen = new Set<string>();
  const results: ControllerAnalysis[] = [];

  for (const ref of controllers) {
    const key = ref.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    results.push(analyzeController({ ...options, controller: key }));
  }

  return results;
}
