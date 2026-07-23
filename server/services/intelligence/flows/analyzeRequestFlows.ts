import { normalizePath } from '../ignore.js';
import { classifyFileNodeType } from '../graph/classifyNode.js';
import { buildPathIndex, resolveImportPath } from '../graph/resolveImport.js';
import {
  buildImportNameMap,
  discoverExpressMounts,
  parseExpressRoutes
} from './parseExpressRoutes.js';
import { isNextApiFile, parseNextApiRoutes } from './parseNextApiRoutes.js';
import { isNestControllerFile, parseNestRoutes } from './parseNestRoutes.js';
import { frameworkLabel, humanizeIdentifier } from './labels.js';
import { linkSteps, traceHandlerFlow, type TraceContext } from './traceHandler.js';
import type {
  AnalyzeRequestFlowsOptions,
  DetectedRoute,
  FlowFramework,
  RequestFlow,
  RequestMethod,
  RequestStep
} from './types.js';

const SUPPORTED_METHODS = new Set<string>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

function resolveContent(
  fileContents: Record<string, string> | undefined,
  path: string
): string | undefined {
  if (!fileContents) return undefined;
  if (fileContents[path] != null) return fileContents[path];
  const norm = normalizePath(path);
  if (fileContents[norm] != null) return fileContents[norm];
  const lower = norm.toLowerCase();
  for (const [key, value] of Object.entries(fileContents)) {
    if (normalizePath(key).toLowerCase() === lower) return value;
  }
  return undefined;
}

function detectPrimaryFramework(
  backend: string | null | undefined,
  routes: DetectedRoute[]
): FlowFramework {
  if (routes.some((r) => r.framework === 'NestJS')) return 'NestJS';
  if (routes.some((r) => r.framework === 'Next.js')) return 'Next.js';
  if (routes.some((r) => r.framework === 'Express')) return 'Express';
  const b = (backend || '').toLowerCase();
  if (b.includes('nest')) return 'NestJS';
  if (b.includes('next')) return 'Next.js';
  if (b.includes('express')) return 'Express';
  return 'Unknown';
}

/**
 * Stable slug id: flow-post-auth-login
 */
export function buildFlowId(method: string, endpoint: string): string {
  const path = endpoint
    .replace(/^\//, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'root';
  return `flow-${method.toLowerCase()}-${path}`.slice(0, 80);
}

/**
 * Human title from endpoint: /auth/login → "Login", /api/users → "Users"
 */
export function buildFlowTitle(method: string, endpoint: string): string {
  const parts = endpoint.split('/').filter((p) => p && !p.startsWith(':') && !p.includes('*'));
  const last = parts[parts.length - 1] || 'Root';
  const name = humanizeIdentifier(last.replace(/\[|\]/g, ''));
  if (/^(api|v\d+)$/i.test(name) && parts.length >= 2) {
    return humanizeIdentifier(parts[parts.length - 2]!);
  }
  // Prefer action-oriented titles for mutating methods
  if (method === 'POST' && !/create|add|register|login|sign/i.test(name)) {
    return `Create ${name}`;
  }
  if (method === 'PUT' || method === 'PATCH') {
    return /update|edit/i.test(name) ? name : `Update ${name}`;
  }
  if (method === 'DELETE') {
    return /delete|remove/i.test(name) ? name : `Delete ${name}`;
  }
  return name;
}

export function buildFlowDescription(
  method: string,
  endpoint: string,
  framework: FlowFramework,
  steps: RequestStep[]
): string {
  const chain = steps
    .filter((s) => s.type !== 'response')
    .map((s) => s.name)
    .slice(0, 6);
  const tail = steps.some((s) => s.type === 'response') ? ' → Response' : '';
  const fw = frameworkLabel(framework);
  if (chain.length === 0) {
    return `${fw} ${method} ${endpoint}`;
  }
  return `${fw} ${method} ${endpoint}: ${chain.join(' → ')}${tail}`;
}

function normalizeMethod(method: string): RequestMethod | null {
  const upper = method.toUpperCase();
  if (SUPPORTED_METHODS.has(upper)) return upper as RequestMethod;
  // Next.js files with no explicit method export — treat as GET
  if (upper === 'ALL') return 'GET';
  return null;
}

/**
 * Request Flow Analyzer.
 *
 * Recursively scans the repository for Express / Next.js API / NestJS routes,
 * then follows handler → controller → service → model / auth / DB / external
 * chains via import + call parsing. No LLM.
 */
export function analyzeRequestFlows(options: AnalyzeRequestFlowsOptions): RequestFlow[] {
  const files = (options.files || []).map(normalizePath).filter(Boolean);
  const fileContents = options.fileContents ?? {};
  const maxRoutes = options.maxRoutes ?? 40;
  const maxDepth = options.maxDepth ?? 4;
  const pathIndex = buildPathIndex(files);

  const ctx: TraceContext = {
    fileContents,
    pathIndex,
    databaseLabel: options.database,
    authLabel: options.authentication,
    maxDepth
  };

  // —— Pass 1: discover Express mount prefixes ——
  const mountPrefixes = new Map<string, string>();
  for (const file of files) {
    const content = resolveContent(fileContents, file);
    if (!content) continue;
    if (!/\.use\s*\(/.test(content)) continue;

    const resolve = (spec: string) => resolveImportPath(file, spec, pathIndex);
    const importMap = buildImportNameMap(content, resolve);
    const found = discoverExpressMounts(file, content, importMap);
    for (const [routeFile, prefix] of found) {
      if (!mountPrefixes.has(routeFile)) mountPrefixes.set(routeFile, prefix);
    }
  }

  // —— Pass 2: collect routes ——
  const detected: DetectedRoute[] = [];

  for (const file of files) {
    const content = resolveContent(fileContents, file);
    const type = classifyFileNodeType(file);

    if (content && isNestControllerFile(content)) {
      detected.push(...parseNestRoutes(file, content));
      continue;
    }

    if (isNextApiFile(file)) {
      detected.push(...parseNextApiRoutes(file, content));
      continue;
    }

    if (
      content &&
      (type === 'Route' ||
        type === 'Backend' ||
        /\b(?:router|app|server)\.(get|post|put|patch|delete|all|route)\s*\(/i.test(content))
    ) {
      detected.push(...parseExpressRoutes(file, content, mountPrefixes));
    }
  }

  // Deduplicate + keep supported methods only
  const seen = new Set<string>();
  const uniqueRoutes: DetectedRoute[] = [];
  for (const r of detected) {
    const method = normalizeMethod(r.method);
    if (!method) continue;
    const key = `${method} ${r.path} :: ${r.sourceFile}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRoutes.push({ ...r, method });
  }

  const primary = detectPrimaryFramework(options.backend, uniqueRoutes);
  const results: RequestFlow[] = [];

  for (const route of uniqueRoutes.slice(0, maxRoutes)) {
    const method = normalizeMethod(route.method)!;
    const content = resolveContent(fileContents, route.sourceFile);
    const resolve = (spec: string) =>
      resolveImportPath(route.sourceFile, spec, pathIndex);
    const importMap = content ? buildImportNameMap(content, resolve) : new Map();

    const traced = content
      ? traceHandlerFlow(route.sourceFile, route.handlers, importMap, ctx)
      : { steps: [] as RequestStep[], confidence: 'low' as const };

    const framework = route.framework === 'Unknown' ? primary : route.framework;
    let steps = linkSteps(traced.steps);

    // Ensure DB appears when models were hit but package not imported in leaf
    if (shouldAppendDb(steps, options.database)) {
      steps = appendBeforeResponse(steps, {
        type: 'database',
        name: dbLabel(options.database),
        file: route.sourceFile
      });
    }

    // Graceful fallback — almost empty chain
    if (steps.filter((s) => s.type !== 'response').length <= 1) {
      steps = linkSteps([
        {
          type: 'route',
          name: fallbackRouteLabel(route),
          file: route.sourceFile
        },
        {
          type: 'response',
          name: 'Response',
          file: route.sourceFile
        }
      ]);
    }

    const title = buildFlowTitle(method, route.path);
    results.push({
      id: buildFlowId(method, route.path),
      title,
      endpoint: route.path,
      method,
      description: buildFlowDescription(method, route.path, framework, steps),
      steps
    });
  }

  // —— Global fallback when nothing detected ——
  if (results.length === 0) {
    const fw = primary;
    const steps = linkSteps([
      {
        type: 'router',
        name: frameworkLabel(fw),
        file: ''
      },
      {
        type: 'route',
        name: 'Routes',
        file: ''
      },
      ...(options.database
        ? [
            {
              type: 'database' as const,
              name: dbLabel(options.database),
              file: ''
            }
          ]
        : []),
      {
        type: 'response',
        name: 'Response',
        file: ''
      }
    ]);

    return [
      {
        id: 'flow-unknown',
        title: 'Unknown Route',
        endpoint: '*',
        method: 'GET',
        description: buildFlowDescription('GET', '*', fw, steps),
        steps
      }
    ];
  }

  return results.sort((a, b) => {
    const byEndpoint = a.endpoint.localeCompare(b.endpoint);
    if (byEndpoint !== 0) return byEndpoint;
    return a.method.localeCompare(b.method);
  });
}

function dbLabel(database: string | null | undefined): string {
  return database?.split(',')[0]?.trim() || 'Database';
}

function shouldAppendDb(
  steps: RequestStep[],
  database: string | null | undefined
): boolean {
  if (!database) return false;
  if (steps.some((s) => s.type === 'database')) return false;
  return steps.some((s) => s.type === 'model' || s.type === 'repository');
}

function appendBeforeResponse(steps: RequestStep[], step: RequestStep): RequestStep[] {
  const withoutResponse = steps.filter((s) => s.type !== 'response');
  const response = steps.find((s) => s.type === 'response') ?? {
    type: 'response' as const,
    name: 'Response',
    file: step.file
  };
  return linkSteps([...withoutResponse, step, response]);
}

function fallbackRouteLabel(route: DetectedRoute): string {
  const parts = route.path.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || 'Root';
  const name = last.replace(/^:/, '').replace(/\*/g, '');
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} Route`;
}
