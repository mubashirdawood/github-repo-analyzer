/**
 * Repository statistics for the Request Flow dashboard.
 * Derived from RepositoryAnalysis + ArchitectureContext + route scan.
 */

import type { RepositoryAnalysis } from '../types.js';
import type { ArchitectureContext } from '../architectureContext/types.js';
import { buildArchitectureContext } from '../architectureContext/buildArchitectureContext.js';

export interface LanguageShare {
  name: string;
  percent: number;
}

export interface RepoStatistics {
  framework: string;
  frontendComponents: number;
  pages: number;
  apiRoutes: number;
  controllers: number;
  services: number;
  models: number;
  middleware: number;
  databaseCollections: number;
  externalApis: number;
  authentication: string;
  totalSourceFiles: number;
  languages: LanguageShare[];
  complexity: 'low' | 'medium' | 'high';
  complexityScore: number;
  architectureLayers: number;
  layers: string[];
  technologies: string[];
  entryPoints: string[];
  stateManagement: string | null;
  database: string | null;
  summary: string;
}

export interface BuildRepoStatisticsOptions {
  context?: ArchitectureContext;
  /** Route count from Express / API scan. */
  routeCount?: number;
  /** Important route labels e.g. "GET /api/users". */
  routeLabels?: string[];
}

const EXT_LANG: Record<string, string> = {
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.css': 'CSS',
  '.scss': 'CSS',
  '.sass': 'CSS',
  '.less': 'CSS',
  '.html': 'HTML',
  '.json': 'JSON',
  '.md': 'Markdown',
  '.py': 'Python',
  '.go': 'Go',
  '.java': 'Java',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.cs': 'C#',
  '.vue': 'Vue',
  '.svelte': 'Svelte'
};

function languageShares(files: string[]): LanguageShare[] {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const f of files) {
    const m = String(f).toLowerCase().match(/(\.[a-z0-9]+)$/);
    if (!m) continue;
    const lang = EXT_LANG[m[1]!];
    if (!lang || lang === 'Markdown') continue;
    counts[lang] = (counts[lang] || 0) + 1;
    total += 1;
  }
  if (total === 0) return [{ name: 'Unknown', percent: 100 }];
  return Object.entries(counts)
    .map(([name, n]) => ({ name, percent: Math.round((n / total) * 100) }))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 6);
}

function scoreComplexity(input: {
  files: number;
  routes: number;
  controllers: number;
  services: number;
  models: number;
  externals: number;
  layers: number;
}): { complexity: 'low' | 'medium' | 'high'; score: number } {
  let score = 20;
  score += Math.min(25, Math.floor(input.files / 8));
  score += Math.min(15, input.routes);
  score += Math.min(10, input.controllers * 2);
  score += Math.min(10, input.services * 2);
  score += Math.min(8, input.models * 2);
  score += Math.min(8, input.externals * 3);
  score += Math.min(10, input.layers * 2);
  score = Math.max(5, Math.min(98, score));
  const complexity = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
  return { complexity, score };
}

function buildLayers(analysis: RepositoryAnalysis, ctx: ArchitectureContext): string[] {
  const layers: string[] = [];
  if (ctx.frontend || analysis.technologies.frontend) layers.push('Frontend');
  if (analysis.structure.api.length || analysis.structure.pages.length) layers.push('API Client');
  if (ctx.backend || analysis.technologies.backend) layers.push('Backend');
  if (analysis.structure.middleware.length || ctx.backend?.middleware?.length) {
    layers.push('Middleware');
  }
  if (analysis.structure.routes.length || ctx.backend?.routes?.length) layers.push('Routes');
  if (analysis.structure.controllers.length) layers.push('Controllers');
  if (analysis.structure.services.length || ctx.backend?.services?.length) {
    layers.push('Services');
  }
  if (analysis.structure.models.length || ctx.database) layers.push('Data');
  if (ctx.authentication || analysis.technologies.authentication) {
    layers.push('Authentication');
  }
  if ((ctx.externalServices || []).length) layers.push('External APIs');
  if (layers.length === 0) layers.push('Application');
  return layers;
}

function buildTechnologies(analysis: RepositoryAnalysis, ctx: ArchitectureContext): string[] {
  const tech = analysis.technologies;
  const list = [
    analysis.projectType !== 'Unknown' ? analysis.projectType : null,
    tech.frontend,
    tech.backend,
    tech.database,
    tech.authentication,
    tech.stateManagement,
    tech.uiLibrary,
    tech.realtime,
    tech.cache,
    tech.testing,
    ...(ctx.externalServices || [])
  ].filter((t): t is string => Boolean(t && String(t).trim()));
  return [...new Set(list)];
}

function buildSummary(
  analysis: RepositoryAnalysis,
  ctx: ArchitectureContext,
  stats: Pick<
    RepoStatistics,
    'apiRoutes' | 'complexity' | 'architectureLayers' | 'authentication' | 'database'
  >
): string {
  const fe = ctx.frontend?.framework || analysis.technologies.frontend || 'the frontend';
  const be = ctx.backend?.framework || analysis.technologies.backend || 'the backend';
  const db = stats.database || 'a data store';
  const auth = stats.authentication !== 'None' ? ` Authentication uses ${stats.authentication}.` : '';
  return (
    `This ${analysis.projectType} repository processes HTTP requests through ${stats.architectureLayers} architecture layers. ` +
    `Clients interact via ${fe}, which calls ${be}. ` +
    `Business logic flows through routes, controllers, and services into ${db}.` +
    auth +
    ` Overall complexity is ${stats.complexity} with ${stats.apiRoutes} detected API route${stats.apiRoutes === 1 ? '' : 's'}.`
  );
}

/**
 * Build dashboard statistics for a repository analysis.
 */
export function buildRepoStatistics(
  analysis: RepositoryAnalysis,
  options: BuildRepoStatisticsOptions = {}
): RepoStatistics {
  const ctx =
    options.context ??
    buildArchitectureContext(analysis, { maxLabels: 12 });

  const apiRoutes =
    options.routeCount ??
    Math.max(
      analysis.structure.routes.length,
      ctx.backend?.routes?.length || 0,
      analysis.structure.api.length
    );

  const frontendComponents =
    ctx.frontend?.components || analysis.structure.components.length;
  const pages = Math.max(
    analysis.structure.pages.length,
    ctx.frontend?.pages?.length || 0
  );
  const controllers = analysis.structure.controllers.length;
  const services = Math.max(
    analysis.structure.services.length,
    ctx.backend?.services?.length || 0
  );
  const models = analysis.structure.models.length;
  const middleware = Math.max(
    analysis.structure.middleware.length,
    ctx.backend?.middleware?.length || 0
  );
  const databaseCollections = models;
  const externalApis = (ctx.externalServices || []).length;
  const authentication =
    ctx.authentication || analysis.technologies.authentication || 'None';
  const database = ctx.database || analysis.technologies.database || null;
  const layers = buildLayers(analysis, ctx);
  const { complexity, score } = scoreComplexity({
    files: analysis.filteredFileCount || analysis.files.length,
    routes: apiRoutes,
    controllers,
    services,
    models,
    externals: externalApis,
    layers: layers.length
  });

  const entryPoints = [
    ...analysis.entryFiles.slice(0, 4),
    ...(options.routeLabels || []).slice(0, 6)
  ].filter(Boolean);

  const base = {
    apiRoutes,
    complexity,
    architectureLayers: layers.length,
    authentication,
    database
  };

  return {
    framework: analysis.projectType,
    frontendComponents,
    pages,
    apiRoutes,
    controllers,
    services,
    models,
    middleware,
    databaseCollections,
    externalApis,
    authentication,
    totalSourceFiles: analysis.filteredFileCount || analysis.files.length,
    languages: languageShares(analysis.files),
    complexity,
    complexityScore: score,
    architectureLayers: layers.length,
    layers,
    technologies: buildTechnologies(analysis, ctx),
    entryPoints: [...new Set(entryPoints)].slice(0, 10),
    stateManagement:
      ctx.frontend?.stateManagement || analysis.technologies.stateManagement || null,
    database,
    summary: buildSummary(analysis, ctx, base)
  };
}
