/**
 * Controller Analyzer
 * ===================
 * Locate a controller function and extract its service / DB / auth / API calls.
 * AST-first, no LLM.
 */

export type {
  AnalyzeControllerOptions,
  ControllerAnalysis,
  ResolvedController
} from './types.js';

export { analyzeController, analyzeControllers } from './analyzeController.js';
export { resolveController } from './resolveController.js';
export { extractControllerCalls, extractCallsWithAst, extractCallsWithRegex } from './extractCalls.js';
export { normalizeCall, uniqueCalls } from './normalizeCalls.js';
