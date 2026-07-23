/**
 * Middleware Analyzer
 * ===================
 * Locate middleware and extract its internal calls. AST-first, no LLM.
 */

export type { AnalyzeMiddlewareOptions, MiddlewareAnalysis } from './types.js';

export { analyzeMiddleware, analyzeMiddlewares } from './analyzeMiddleware.js';
