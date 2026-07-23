import { getExtension, getFileName, normalizePath } from '../ignore.js';
import type { GraphNodeType } from './types.js';

/**
 * Classify a repository file into a graph node type.
 * Structural folders (routes, controllers, …) always win over name heuristics.
 */
export function classifyFileNodeType(filePath: string): GraphNodeType {
  const path = normalizePath(filePath);
  const lower = path.toLowerCase();
  const segments = lower.split('/');
  const name = getFileName(path);
  const base = name.replace(/\.[^.]+$/, '');
  const ext = getExtension(path);

  const inDir = (...dirs: string[]) =>
    dirs.some((d) => segments.includes(d.toLowerCase()));

  const underClient = segments.some((s) =>
    ['client', 'frontend', 'web', 'ui'].includes(s)
  );
  const underServer = segments.some((s) =>
    ['server', 'backend'].includes(s)
  );

  // —— Structural roles (highest priority) ——
  if (
    inDir('routes', 'route', 'routers', 'router') ||
    /\.router\./i.test(name) ||
    /routes?\.(js|ts|jsx|tsx|py|mjs|cjs)$/i.test(name)
  ) {
    return 'Route';
  }

  if (inDir('controllers', 'controller') || /controller\.(js|ts|jsx|tsx|py|java|cs|php)$/i.test(name)) {
    return 'Controller';
  }

  if (
    inDir('repositories', 'repository', 'dao') ||
    /repository\.(js|ts|jsx|tsx|py)$/i.test(name) ||
    /\.repo\.(js|ts)$/i.test(name)
  ) {
    return 'Repository';
  }

  if (inDir('services', 'service') || /service\.(js|ts|jsx|tsx|py|java|cs|php)$/i.test(name)) {
    return 'Service';
  }

  if (
    inDir('models', 'model', 'entities', 'entity', 'schemas') ||
    /model\.(js|ts|jsx|tsx|py|java|cs|php)$/i.test(name) ||
    /\.entity\.(js|ts)$/i.test(name) ||
    /\.schema\.(js|ts)$/i.test(name)
  ) {
    return 'Model';
  }

  if (inDir('middleware', 'middlewares') || /middleware\.(js|ts|jsx|tsx|py)$/i.test(name)) {
    // Auth middleware is still a Middleware node (auth package edges cover Authentication)
    return 'Middleware';
  }

  if (inDir('pages', 'page', 'views', 'view', 'screens', 'screen')) {
    return 'Page';
  }

  if (inDir('components', 'component', 'ui')) {
    return 'Component';
  }

  if (
    inDir('config', 'configs', 'configuration') ||
    /config\.(js|ts|mjs|cjs|json|yml|yaml|py|php)$/i.test(name) ||
    name === 'settings.py' ||
    name === 'application.properties' ||
    name === 'application.yml'
  ) {
    return 'Configuration';
  }

  if (
    inDir('utils', 'util', 'helpers', 'helper', 'lib', 'libs', 'hooks') ||
    /util(s)?\./i.test(name) ||
    /helper(s)?\./i.test(name) ||
    /^use[A-Z]/.test(base)
  ) {
    return 'Utility';
  }

  // Client API modules → External API (feeds App → Dashboard → API Client chains)
  if (
    underClient &&
    (/^api\.(js|ts|jsx|tsx)$/i.test(name) ||
      /apiclient/i.test(base) ||
      /^client\.(js|ts)$/i.test(name))
  ) {
    return 'External API';
  }

  // Standalone auth helpers (not already classified as route/controller/…)
  if (/^(auth|passport|jwt|session)/i.test(base) && !underClient) {
    return 'Authentication';
  }

  // Entry / bootstrap files
  if (/^(server|app|index|main)\.(js|ts|mjs|cjs)$/i.test(name) || /^program\.cs$/i.test(name) || /^manage\.py$/i.test(name)) {
    if (underServer || /^server\./i.test(name) || name === 'manage.py') {
      return 'Backend';
    }
    if (underClient || /\.(jsx|tsx)$/i.test(ext)) {
      return 'Frontend';
    }
    return underClient ? 'Frontend' : 'Backend';
  }

  if (/^app\.(jsx|tsx)$/i.test(name) || /^main\.(jsx|tsx)$/i.test(name)) {
    return 'Frontend';
  }

  if (/\.(jsx|tsx|vue)$/i.test(ext)) {
    return 'Component';
  }

  if (inDir('api', 'apis') && underServer) {
    return 'Route';
  }

  if (underServer) return 'Backend';
  if (underClient) return 'Frontend';

  return 'Utility';
}

/**
 * Human-readable display name for a file node.
 */
export function displayNameFromPath(filePath: string): string {
  const name = getFileName(normalizePath(filePath));
  const withoutExt = name.replace(/\.(jsx|tsx|js|ts|mjs|cjs|py|cs|php|vue)$/i, '');
  return withoutExt || name;
}

/**
 * Stable id for file-backed nodes.
 */
export function fileNodeId(filePath: string): string {
  return `file:${normalizePath(filePath)}`;
}

export function syntheticNodeId(kind: string, name: string): string {
  return `syn:${kind}:${name.toLowerCase().replace(/\s+/g, '-')}`;
}
