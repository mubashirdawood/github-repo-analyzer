/**
 * Request Flow Prompt Builder — types.
 */

import type { RequestFlow } from '../types.js';
import type { ExecutionGraph, RankedExecutionGraph } from '../executionGraph/types.js';

/** Any structured flow the prompt builder can summarize. */
export type RequestFlowPromptInput =
  | RequestFlow
  | ExecutionGraph
  | RankedExecutionGraph;

export interface RequestFlowPromptOptions {
  /** Optional product/category title override, e.g. "Authentication Flow". */
  flowTitle?: string;
  /** Include a compact system-style preamble in the same string. Default true. */
  includeInstructions?: boolean;
}

/** Compact summary passed to the LLM (no files, no source). */
export interface RequestFlowSummary {
  title: string;
  method: string;
  endpoint: string;
  /** Ordered chain labels: Route → Middleware → Controller → … → Response */
  chain: string[];
  /** Role tags present in the chain (for diagram guidance). */
  roles: {
    middleware: string[];
    controllers: string[];
    services: string[];
    models: string[];
    databases: string[];
    authentication: string[];
    externalApis: string[];
  };
}
