/**
 * Request Execution Graph Builder
 * ===============================
 * Combines Route Parser, Middleware Analyzer, Controller Analyzer,
 * and Service Analyzer into one directed execution graph per route.
 *
 * No LLM.
 */

import { scanExpressRoutes } from '../express/index.js';
import type { ExpressRouteDeclaration } from '../express/types.js';
import { analyzeMiddleware } from '../middleware/index.js';
import { analyzeController } from '../controller/index.js';
import { analyzeService } from '../service/index.js';
import { buildImportNameMap } from '../expressLegacyMounts.js';
import { normalizePath } from '../../ignore.js';
import { buildPathIndex, resolveImportPath } from '../../graph/resolveImport.js';
import {
  callToNodeMeta,
  formatCallLabel,
  isServiceCall,
  slugId
} from './nodeMeta.js';
import type {
  BuildExecutionGraphsOptions,
  ExecutionGraph,
  ExecutionGraphEdge,
  ExecutionGraphNode,
  RankedExecutionGraph
} from './types.js';
import { DEFAULT_TOP_FLOWS, rankRoutes } from '../ranking/index.js';

function resolveContent(
  fileContents: Record<string, string>,
  path: string
): string | undefined {
  if (fileContents[path] != null) return fileContents[path];
  const norm = normalizePath(path);
  if (fileContents[norm] != null) return fileContents[norm];
  const lower = norm.toLowerCase();
  for (const [key, value] of Object.entries(fileContents)) {
    if (normalizePath(key).toLowerCase() === lower) return value;
  }
  return undefined;
}

function importMapForFile(
  file: string | undefined,
  files: string[],
  fileContents: Record<string, string>
): Map<string, string> | undefined {
  if (!file) return undefined;
  const source = resolveContent(fileContents, file);
  if (!source) return undefined;
  const pathIndex = buildPathIndex(files);
  const resolve = (spec: string) => resolveImportPath(file, spec, pathIndex);
  return buildImportNameMap(source, resolve);
}

class GraphBuilder {
  nodes: ExecutionGraphNode[] = [];
  edges: ExecutionGraphEdge[] = [];
  private seenNodes = new Set<string>();
  private seenEdges = new Set<string>();

  addNode(node: ExecutionGraphNode): string {
    if (!this.seenNodes.has(node.id)) {
      this.seenNodes.add(node.id);
      this.nodes.push(node);
    }
    return node.id;
  }

  addEdge(source: string, target: string, relation: string): void {
    const key = `${source}>${target}:${relation}`;
    if (this.seenEdges.has(key)) return;
    this.seenEdges.add(key);
    this.edges.push({ source, target, relation });
  }

  /** Link previous → next with relation; returns next id. */
  chain(prevId: string | null, next: ExecutionGraphNode, relation: string): string {
    const id = this.addNode(next);
    if (prevId) this.addEdge(prevId, id, relation);
    return id;
  }
}

/**
 * Build a directed execution graph for one Express route declaration.
 */
export function buildExecutionGraphForRoute(
  route: ExpressRouteDeclaration,
  options: Omit<BuildExecutionGraphsOptions, 'routes' | 'maxRoutes'>
): ExecutionGraph {
  const files = (options.files || []).map(normalizePath);
  const fileContents = options.fileContents ?? {};
  const hintFile = route.sourceFile ? normalizePath(route.sourceFile) : undefined;
  const importMap = importMapForFile(hintFile, files, fileContents);
  const g = new GraphBuilder();

  const routeId = slugId(['route', route.method, route.endpoint]);
  let prev = g.chain(
    null,
    {
      id: routeId,
      type: 'route',
      label: `${route.method} ${route.endpoint}`,
      file: hintFile ?? ''
    },
    'next'
  );

  // —— Middleware chain ——
  for (const mwRef of route.middleware) {
    const mw = analyzeMiddleware({
      middleware: mwRef,
      files,
      fileContents,
      hintFile,
      importMap
    });
    const mwId = slugId(['mw', route.method, route.endpoint, mwRef]);
    prev = g.chain(
      prev,
      {
        id: mwId,
        type: 'middleware',
        label: mw.label,
        file: mw.sourceFile ?? ''
      },
      'next'
    );

    // Optional: surface notable middleware calls as side branches (skip noise)
    for (const call of mw.calls.slice(0, 6)) {
      const meta = callToNodeMeta(call);
      if (meta.type === 'call' && /^(json|send|status|next)\(/i.test(meta.label)) continue;
      const leafId = slugId(['mw-call', mwId, call]);
      g.chain(
        mwId,
        { id: leafId, type: meta.type, label: meta.label, file: mw.sourceFile ?? '' },
        meta.relation
      );
    }
  }

  // —— Controller ——
  let controllerId: string | null = null;
  if (route.controller) {
    const ctrl = analyzeController({
      controller: route.controller,
      files,
      fileContents,
      hintFile,
      importMap
    });
    controllerId = slugId(['ctrl', route.method, route.endpoint, route.controller]);
    prev = g.chain(
      prev,
      {
        id: controllerId,
        type: 'controller',
        label: formatCallLabel(route.controller),
        file: ctrl.sourceFile ?? ''
      },
      'next'
    );

    const ctrlImportMap = importMapForFile(ctrl.sourceFile, files, fileContents);

    // —— Controller calls → services or leaf ops ——
    let lastInChain = controllerId;
    const sequentialLeaves: string[] = [];

    for (const call of ctrl.calls) {
      if (isServiceCall(call)) {
        const svc = analyzeService({
          service: call,
          files,
          fileContents,
          hintFile: ctrl.sourceFile,
          importMap: ctrlImportMap
        });
        const svcId = slugId(['svc', route.method, route.endpoint, call]);
        lastInChain = g.chain(
          lastInChain,
          {
            id: svcId,
            type: 'service',
            label: formatCallLabel(call),
            file: svc.sourceFile ?? ''
          },
          'calls'
        );

        // Expand service internals in call order
        for (const svcCall of svc.calls) {
          const meta = callToNodeMeta(svcCall);
          const leafId = slugId(['svc-call', svcId, svcCall]);
          lastInChain = g.chain(
            lastInChain,
            {
              id: leafId,
              type: meta.type,
              label: meta.label,
              file: svc.sourceFile ?? ''
            },
            meta.relation
          );
          sequentialLeaves.push(leafId);
        }
      } else {
        const meta = callToNodeMeta(call);
        const leafId = slugId(['ctrl-call', controllerId, call]);
        lastInChain = g.chain(
          lastInChain,
          {
            id: leafId,
            type: meta.type,
            label: meta.label,
            file: ctrl.sourceFile ?? ''
          },
          meta.relation
        );
        sequentialLeaves.push(leafId);
      }
    }

    prev = lastInChain;
  }

  // —— Response ——
  const responseId = slugId(['response', route.method, route.endpoint]);
  g.chain(
    prev,
    {
      id: responseId,
      type: 'response',
      label: 'Response',
      file: hintFile ?? ''
    },
    'responds'
  );

  return {
    id: routeId,
    method: route.method,
    endpoint: route.endpoint,
    nodes: g.nodes,
    edges: g.edges
  };
}

/**
 * Scan routes, rank by importance, and build execution graphs
 * for the top N (default 10). Ignores debug / test / internal.
 */
export function buildExecutionGraphs(
  options: BuildExecutionGraphsOptions
): RankedExecutionGraph[] {
  const limit = options.maxRoutes ?? DEFAULT_TOP_FLOWS;
  const shouldRank = options.rank !== false;

  const scanned: ExpressRouteDeclaration[] =
    options.routes ??
    scanExpressRoutes({
      files: options.files,
      fileContents: options.fileContents,
      // Scan broadly; ranking selects the important subset
      maxRoutes: shouldRank ? Math.max(limit * 20, 200) : limit
    });

  const rankable = scanned.map((route) => ({
    method: route.method,
    endpoint: route.endpoint,
    sourceFile: route.sourceFile,
    blob: [
      ...(route.middleware || []),
      route.controller ?? '',
      route.routerName ?? ''
    ].join(' '),
    route
  }));

  const selected = shouldRank
    ? rankRoutes(rankable, limit)
    : rankable.slice(0, limit).map((item, i) => ({
        rank: i + 1,
        category: 'Other' as const,
        score: 0,
        item
      }));

  return selected.map((row) => {
    const graph = buildExecutionGraphForRoute(row.item.route, {
      files: options.files,
      fileContents: options.fileContents
    });
    return {
      ...graph,
      rank: row.rank,
      category: row.category,
      score: row.score
    };
  });
}

/**
 * Build a single graph for method + endpoint (when present in scanned routes).
 */
export function buildExecutionGraph(
  method: string,
  endpoint: string,
  options: BuildExecutionGraphsOptions
): ExecutionGraph | null {
  const routes =
    options.routes ??
    scanExpressRoutes({
      files: options.files,
      fileContents: options.fileContents,
      maxRoutes: options.maxRoutes ?? 100
    });

  const upper = method.toUpperCase();
  const hit = routes.find(
    (r) => r.method === upper && normalizePath(r.endpoint) === normalizePath(endpoint)
  );
  if (!hit) return null;
  return buildExecutionGraphForRoute(hit, options);
}
