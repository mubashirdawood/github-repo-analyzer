/**
 * Request Execution Graph — types.
 *
 * Combines Route Parser + Middleware + Controller + Service analyzers
 * into a directed graph of request processing.
 */

export type ExecutionNodeType =
  | 'route'
  | 'middleware'
  | 'controller'
  | 'service'
  | 'model'
  | 'database'
  | 'authentication'
  | 'external_api'
  | 'file_upload'
  | 'email'
  | 'payment'
  | 'queue'
  | 'cache'
  | 'response'
  | 'call';

export type ExecutionRelation =
  | 'next'
  | 'calls'
  | 'uses'
  | 'queries'
  | 'authenticates'
  | 'responds';

export interface ExecutionGraphNode {
  id: string;
  type: ExecutionNodeType | string;
  label: string;
  file: string;
}

export interface ExecutionGraphEdge {
  source: string;
  target: string;
  relation: ExecutionRelation | string;
}

/**
 * Directed execution graph for one HTTP route.
 */
export interface ExecutionGraph {
  /** e.g. POST /login */
  id: string;
  method: string;
  endpoint: string;
  nodes: ExecutionGraphNode[];
  edges: ExecutionGraphEdge[];
}

/** Execution graph with importance ranking metadata. */
export interface RankedExecutionGraph extends ExecutionGraph {
  /** 1 = most important. */
  rank: number;
  category: import('../ranking/types.js').FlowImportanceCategory;
  score: number;
}

export interface BuildExecutionGraphsOptions {
  files: string[];
  fileContents?: Record<string, string>;
  /**
   * Max important graphs to return after ranking.
   * Default: 10.
   */
  maxRoutes?: number;
  /** When false, skip importance ranking (build graphs for all scanned routes up to maxRoutes). */
  rank?: boolean;
  /** Precomputed Express routes (skips re-scan). */
  routes?: import('../express/types.js').ExpressRouteDeclaration[];
}
