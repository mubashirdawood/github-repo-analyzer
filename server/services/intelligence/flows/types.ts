/**
 * Request Flow Analyzer — types.
 *
 * Structural (no LLM). Detects HTTP request processing chains for
 * Express, Next.js API Routes, and NestJS.
 */

/** Supported HTTP methods for flow extraction. */
export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type FlowFramework = 'Express' | 'Next.js' | 'NestJS' | 'Unknown';

/**
 * Role of a step in the request processing chain.
 * Matches the analyzer’s detection targets (routers, controllers, DB, auth, …).
 */
export type RequestStepType =
  | 'router'
  | 'route'
  | 'controller'
  | 'service'
  | 'model'
  | 'middleware'
  | 'database'
  | 'external_api'
  | 'authentication'
  | 'response'
  | 'repository'
  | 'handler';

/** One hop in a request’s processing chain. */
export interface RequestStep {
  type: RequestStepType | string;
  name: string;
  file: string;
  /** Name of the next step in the chain (when known). */
  next?: string;
}

/**
 * Structured request flow for a single endpoint.
 * Built purely from repository analysis — no LLM.
 */
export interface RequestFlow {
  id: string;
  title: string;
  endpoint: string;
  method: string;
  description: string;
  steps: RequestStep[];
}

export interface AnalyzeRequestFlowsOptions {
  files: string[];
  fileContents?: Record<string, string>;
  /** Optional tech hints from Repository Intelligence. */
  backend?: string | null;
  database?: string | null;
  authentication?: string | null;
  /** Cap routes returned. */
  maxRoutes?: number;
  /** Cap how deep we follow call chains. */
  maxDepth?: number;
}

/** Intermediate route declaration before chain tracing. */
export interface DetectedRoute {
  method: RequestMethod | 'OPTIONS' | 'HEAD' | 'ALL';
  path: string;
  /** Handler identifiers as they appear in source (login, authController.login). */
  handlers: string[];
  sourceFile: string;
  framework: FlowFramework;
  /** Mount prefix if known (e.g. /api from app.use('/api', router)). */
  mountPrefix?: string;
}
