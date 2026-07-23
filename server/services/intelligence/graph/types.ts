/**
 * Repository Graph Builder — types.
 * Relationship graph for architecture / Mermaid generation.
 */

export type GraphNodeType =
  | 'Frontend'
  | 'Backend'
  | 'Route'
  | 'Controller'
  | 'Middleware'
  | 'Service'
  | 'Repository'
  | 'Component'
  | 'Page'
  | 'Database'
  | 'Model'
  | 'Utility'
  | 'Authentication'
  | 'External API'
  | 'Configuration';

export type GraphRelation =
  | 'imports'
  | 'mounts'
  | 'calls'
  | 'uses'
  | 'renders'
  | 'queries'
  | 'persists'
  | 'authenticates'
  | 'configures'
  | 'depends_on'
  | 'exposes';

export interface GraphNode {
  id: string;
  name: string;
  type: GraphNodeType;
  /** Present when the node is backed by a real file. */
  path?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: GraphRelation;
}

export interface RepositoryGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface BuildRepositoryGraphOptions {
  /** Filtered or raw file paths / tree entries. */
  files: string[];
  /** File contents keyed by path — required for import parsing. */
  fileContents?: Record<string, string>;
  /** Optional entry files from the intelligence engine. */
  entryFiles?: string[];
  /** Detected database label (e.g. MongoDB) for synthetic DB nodes. */
  database?: string | null;
  /** Detected backend label (e.g. Express). */
  backend?: string | null;
  /** Detected frontend label (e.g. React). */
  frontend?: string | null;
  /** Cap how many source files we parse (latency). */
  maxFilesToParse?: number;
}
