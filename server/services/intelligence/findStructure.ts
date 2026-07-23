import type { RepositoryStructure } from './types.js';
import { getFileName, normalizePath } from './ignore.js';

type StructureKey = keyof RepositoryStructure;

/**
 * Directory / filename tokens that map a path into a structural bucket.
 * Order matters when a path could match multiple keys — first match wins
 * for exclusive assignment; we actually allow multi-bucket membership
 * when both a directory segment and a role apply (e.g. components + hooks).
 */
const ROLE_RULES: Array<{
  key: StructureKey;
  dirNames: string[];
  filePatterns?: RegExp[];
}> = [
  {
    key: 'controllers',
    dirNames: ['controllers', 'controller'],
    filePatterns: [/controller\.(js|ts|jsx|tsx|py|java|cs|php)$/i]
  },
  {
    key: 'routes',
    dirNames: ['routes', 'route', 'routers', 'router'],
    filePatterns: [/routes?\.(js|ts|jsx|tsx|py)$/i, /\.router\.(js|ts)$/i]
  },
  {
    key: 'services',
    dirNames: ['services', 'service'],
    filePatterns: [/service\.(js|ts|jsx|tsx|py|java|cs|php)$/i]
  },
  {
    key: 'models',
    dirNames: ['models', 'model', 'entities', 'entity', 'schemas', 'schema'],
    filePatterns: [/model\.(js|ts|jsx|tsx|py|java|cs|php)$/i, /\.entity\.(js|ts)$/i]
  },
  {
    key: 'middleware',
    dirNames: ['middleware', 'middlewares'],
    filePatterns: [/middleware\.(js|ts|jsx|tsx|py)$/i]
  },
  {
    key: 'hooks',
    dirNames: ['hooks'],
    filePatterns: [/^use[A-Z].+\.(js|ts|jsx|tsx)$/]
  },
  {
    key: 'contexts',
    dirNames: ['contexts', 'context', 'providers'],
    filePatterns: [/context\.(js|ts|jsx|tsx)$/i, /provider\.(js|ts|jsx|tsx)$/i]
  },
  {
    key: 'api',
    dirNames: ['api', 'apis'],
    filePatterns: []
  },
  {
    key: 'utils',
    dirNames: ['utils', 'util', 'helpers', 'helper', 'lib', 'libs'],
    filePatterns: [/util(s)?\.(js|ts|jsx|tsx|py)$/i, /helper(s)?\.(js|ts|jsx|tsx|py)$/i]
  },
  {
    key: 'config',
    dirNames: ['config', 'configs', 'configuration'],
    filePatterns: [/config\.(js|ts|mjs|cjs|json|yml|yaml|py|php)$/i]
  },
  {
    key: 'components',
    dirNames: ['components', 'component', 'ui'],
    filePatterns: []
  },
  {
    key: 'pages',
    dirNames: ['pages', 'page', 'views', 'view', 'screens', 'screen'],
    filePatterns: []
  }
];

function emptyStructure(): RepositoryStructure {
  return {
    controllers: [],
    routes: [],
    services: [],
    models: [],
    middleware: [],
    hooks: [],
    contexts: [],
    api: [],
    utils: [],
    config: [],
    components: [],
    pages: []
  };
}

/**
 * Classify filtered source files into architectural role buckets.
 */
export function findStructure(files: string[]): RepositoryStructure {
  const buckets = emptyStructure();
  const seen: Record<StructureKey, Set<string>> = {
    controllers: new Set(),
    routes: new Set(),
    services: new Set(),
    models: new Set(),
    middleware: new Set(),
    hooks: new Set(),
    contexts: new Set(),
    api: new Set(),
    utils: new Set(),
    config: new Set(),
    components: new Set(),
    pages: new Set()
  };

  for (const raw of files) {
    const path = normalizePath(raw);
    const lower = path.toLowerCase();
    const segments = lower.split('/');
    const fileName = getFileName(path);

    for (const rule of ROLE_RULES) {
      const inDir = rule.dirNames.some((d) => segments.includes(d.toLowerCase()));
      const fileMatch = rule.filePatterns?.some((re) => re.test(fileName)) ?? false;

      // Special-case: Next.js / app-router "app/api" and "pages/api"
      const apiRoute =
        rule.key === 'api' &&
        (segments.includes('api') || /\/(app|pages)\/api\//i.test(path));

      // Hooks: also match useX files under components
      const hookFile =
        rule.key === 'hooks' && /^use[A-Z]/.test(fileName) && fileMatch;

      if (inDir || fileMatch || apiRoute || hookFile) {
        if (!seen[rule.key].has(path)) {
          seen[rule.key].add(path);
          buckets[rule.key].push(path);
        }
      }
    }
  }

  // Stable sort each bucket
  for (const key of Object.keys(buckets) as StructureKey[]) {
    buckets[key].sort((a, b) => a.localeCompare(b));
  }

  return buckets;
}
