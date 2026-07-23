import type { GraphNodeType, GraphRelation } from './types.js';

type PairKey = `${GraphNodeType}>${GraphNodeType}`;

const PAIR_RELATIONS: Partial<Record<PairKey, GraphRelation>> = {
  'Backend>Route': 'mounts',
  'Backend>Database': 'queries',
  'Backend>Backend': 'depends_on',
  'Backend>Middleware': 'uses',
  'Backend>Authentication': 'authenticates',
  'Backend>Configuration': 'configures',
  'Route>Controller': 'calls',
  'Route>Middleware': 'uses',
  'Route>Authentication': 'authenticates',
  'Route>Service': 'calls',
  'Controller>Service': 'calls',
  'Controller>Model': 'uses',
  'Controller>Repository': 'calls',
  'Controller>Authentication': 'authenticates',
  'Service>Model': 'uses',
  'Service>Repository': 'calls',
  'Service>External API': 'calls',
  'Service>Database': 'queries',
  'Repository>Model': 'uses',
  'Repository>Database': 'queries',
  'Model>Database': 'persists',
  'Frontend>Page': 'renders',
  'Frontend>Component': 'renders',
  'Frontend>Backend': 'calls',
  'Frontend>Route': 'calls',
  'Frontend>External API': 'calls',
  'Page>Component': 'renders',
  'Page>External API': 'calls',
  'Page>Backend': 'calls',
  'Page>Utility': 'uses',
  'Component>Component': 'renders',
  'Component>External API': 'calls',
  'Component>Backend': 'calls',
  'Component>Utility': 'uses',
  'External API>Backend': 'calls',
  'External API>External API': 'calls',
  'External API>Route': 'calls',
  'Utility>External API': 'calls',
  'Utility>Backend': 'calls',
  'Middleware>Authentication': 'authenticates',
  'Authentication>Database': 'queries'
};

const TARGET_RELATIONS: Partial<Record<GraphNodeType, GraphRelation>> = {
  Authentication: 'authenticates',
  Configuration: 'configures',
  Utility: 'uses',
  Middleware: 'uses',
  Database: 'queries',
  'External API': 'calls'
};

/**
 * Infer a semantic relation from the source / target node types.
 * Falls back to `imports` when nothing specific applies.
 */
export function inferRelation(
  sourceType: GraphNodeType,
  targetType: GraphNodeType
): GraphRelation {
  const pair = PAIR_RELATIONS[`${sourceType}>${targetType}` as PairKey];
  if (pair) return pair;

  const byTarget = TARGET_RELATIONS[targetType];
  if (byTarget) return byTarget;

  return 'imports';
}
