/**
 * Service Analyzer
 * ================
 * Structured metadata for service function side effects / integrations.
 * AST-first, no LLM, no summaries.
 */

export type {
  AnalyzeServiceOptions,
  ServiceAnalysis,
  ServiceCallCategory
} from './types.js';

export { analyzeService, analyzeServices } from './analyzeService.js';
export { categorizeCall, classifyServiceCalls, modelFromCall } from './classifyCalls.js';
