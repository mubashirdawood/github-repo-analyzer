import { getFileName, normalizePath } from '../ignore.js';
import type { RepositoryAnalysis, RepositoryStructure } from '../types.js';
import type {
  ArchitectureContext,
  BackendArchitectureContext,
  BuildArchitectureContextOptions,
  FrontendArchitectureContext
} from './types.js';

const ROLE_SUFFIX_RE =
  /^(routes?|controllers?|services?|models?|middlewares?|pages?|components?|providers?)$/i;

/**
 * Turn a file path into a short architecture label.
 * server/routes/authRoutes.js → "Auth"
 * client/src/pages/Dashboard.jsx → "Dashboard"
 * server/middleware/errorHandler.js → "ErrorHandler"
 */
export function toArchitectureLabel(filePath: string): string {
  const name = getFileName(normalizePath(filePath)).replace(/\.[^.]+$/, '');

  // Strip trailing architectural role from camelCase / PascalCase names
  const stripped = name.replace(
    /(Routes?|Controllers?|Services?|Models?|Middlewares?|Pages?|Components?)$/,
    ''
  );

  const base = (stripped && stripped !== name ? stripped : name).trim() || name;

  // Keep compact PascalCase (ErrorHandler, Auth) — no spaces
  if (/^[A-Za-z][\w]*$/.test(base)) {
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  // snake/kebab → Title tokens joined without spaces for compactness
  return base
    .split(/[_.\s-]+/)
    .filter((w) => w && !ROLE_SUFFIX_RE.test(w))
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function uniqueLabels(paths: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const path of paths) {
    const label = toArchitectureLabel(path);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= max) break;
  }

  return out;
}

function importantBasenames(entryFiles: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const path of entryFiles) {
    const base = getFileName(normalizePath(path));
    if (!base || seen.has(base.toLowerCase())) continue;
    seen.add(base.toLowerCase());
    out.push(base);
    if (out.length >= max) break;
  }

  return out;
}

function hasFrontendSignal(analysis: RepositoryAnalysis): boolean {
  const t = analysis.technologies;
  return Boolean(
    t.frontend ||
      analysis.structure.pages.length ||
      analysis.structure.components.length ||
      analysis.projectType === 'React' ||
      analysis.projectType === 'Next.js' ||
      analysis.projectType === 'Vue' ||
      analysis.projectType === 'Angular' ||
      analysis.projectType === 'MERN'
  );
}

function hasBackendSignal(analysis: RepositoryAnalysis): boolean {
  const t = analysis.technologies;
  return Boolean(
    t.backend ||
      analysis.structure.routes.length ||
      analysis.structure.controllers.length ||
      analysis.structure.middleware.length ||
      analysis.structure.services.length ||
      ['Express', 'NestJS', 'Django', 'Flask', 'Spring Boot', 'Laravel', 'ASP.NET', 'MERN'].includes(
        analysis.projectType
      )
  );
}

function collectExternalServices(
  analysis: RepositoryAnalysis,
  extras: string[] | undefined,
  max: number
): string[] {
  const candidates: Array<string | null | undefined> = [
    analysis.technologies.realtime,
    ...(extras ?? [])
  ];

  // Split comma-joined tech fields
  const flat: string[] = [];
  for (const c of candidates) {
    if (!c) continue;
    for (const part of c.split(',')) {
      const trimmed = part.trim();
      if (trimmed) flat.push(trimmed);
    }
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of flat) {
    // Skip generic runtime labels that aren't "external services"
    if (/^(express|react|next\.?js|nestjs|vue|angular|node)$/i.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= max) break;
  }

  return out;
}

function buildFrontend(
  analysis: RepositoryAnalysis,
  maxLabels: number
): FrontendArchitectureContext | null {
  if (!hasFrontendSignal(analysis)) return null;

  const pages = uniqueLabels(analysis.structure.pages, maxLabels);
  const ctx: FrontendArchitectureContext = {
    framework: analysis.technologies.frontend,
    pages,
    components: analysis.structure.components.length
  };

  if (analysis.technologies.stateManagement) {
    ctx.stateManagement = analysis.technologies.stateManagement;
  }
  if (analysis.technologies.uiLibrary) {
    ctx.uiLibrary = analysis.technologies.uiLibrary;
  }

  return ctx;
}

function buildBackend(
  analysis: RepositoryAnalysis,
  maxLabels: number
): BackendArchitectureContext | null {
  if (!hasBackendSignal(analysis)) return null;

  const routeSources =
    analysis.structure.routes.length > 0
      ? analysis.structure.routes
      : analysis.structure.api;

  const ctx: BackendArchitectureContext = {
    framework: analysis.technologies.backend,
    routes: uniqueLabels(routeSources, maxLabels),
    middleware: uniqueLabels(analysis.structure.middleware, maxLabels)
  };

  const services = uniqueLabels(analysis.structure.services, maxLabels);
  if (services.length > 0) ctx.services = services;

  return ctx;
}

/**
 * Convert {@link RepositoryAnalysis} into a compact ArchitectureContext
 * suitable for LLM prompts. Metadata only — no source code.
 *
 * @example
 * ```ts
 * const context = buildArchitectureContext(analysis);
 * // { projectType: "MERN", frontend: { framework: "React", pages: [...], components: 48 }, ... }
 * ```
 */
export function buildArchitectureContext(
  analysis: RepositoryAnalysis,
  options: BuildArchitectureContextOptions = {}
): ArchitectureContext {
  const maxLabels = options.maxLabels ?? 12;
  const maxImportantFiles = options.maxImportantFiles ?? 8;

  const context: ArchitectureContext = {
    projectType: analysis.projectType,
    frontend: buildFrontend(analysis, maxLabels),
    backend: buildBackend(analysis, maxLabels),
    database: analysis.technologies.database,
    authentication: analysis.technologies.authentication,
    externalServices: collectExternalServices(analysis, options.externalServices, maxLabels),
    importantFiles: importantBasenames(analysis.entryFiles, maxImportantFiles)
  };

  if (analysis.technologies.testing) context.testing = analysis.technologies.testing;
  if (analysis.technologies.realtime) context.realtime = analysis.technologies.realtime;
  if (analysis.technologies.cache) context.cache = analysis.technologies.cache;
  if (analysis.technologies.deployment) context.deployment = analysis.technologies.deployment;

  return context;
}

/**
 * Serialize ArchitectureContext for prompts: drop null/empty fields
 * so the LLM sees only useful metadata.
 */
export function architectureContextToPromptJson(context: ArchitectureContext): string {
  return JSON.stringify(pruneEmpty(context));
}

function pruneEmpty(value: unknown): unknown {
  if (Array.isArray(value)) {
    const arr = value.map(pruneEmpty).filter((v) => v !== undefined && v !== null && v !== '');
    return arr.length ? arr : undefined;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const pruned = pruneEmpty(v);
      if (pruned === undefined || pruned === null || pruned === '') continue;
      if (Array.isArray(pruned) && pruned.length === 0) continue;
      out[k] = pruned;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}

/** @internal exposed for tests */
export function _uniqueLabelsFromStructure(
  structure: RepositoryStructure,
  key: keyof RepositoryStructure,
  max: number
): string[] {
  return uniqueLabels(structure[key], max);
}
