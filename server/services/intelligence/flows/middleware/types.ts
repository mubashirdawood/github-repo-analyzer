/**
 * Middleware Analyzer — types.
 */

export interface MiddlewareAnalysis {
  /** Middleware identifier, e.g. "validate" or "protect". */
  middleware: string;
  /** Human label, e.g. "Validation Middleware". */
  label: string;
  /** Normalized calls inside the middleware body. */
  calls: string[];
  sourceFile?: string;
  parser?: 'ast' | 'regex';
}

export interface AnalyzeMiddlewareOptions {
  /**
   * Middleware reference from a route registration.
   * Examples: "validate", "protect", "authMiddleware.verify"
   */
  middleware: string;
  files: string[];
  fileContents?: Record<string, string>;
  hintFile?: string;
  importMap?: Map<string, string>;
}
