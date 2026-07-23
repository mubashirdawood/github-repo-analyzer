import { normalizePath, getFileName } from '../ignore.js';
import {
  classifyFileNodeType,
  displayNameFromPath,
  fileNodeId,
  syntheticNodeId
} from './classifyNode.js';
import { parseImports, isParsableSource } from './parseImports.js';
import { mapPackageToNode } from './packageMap.js';
import { inferRelation } from './inferRelation.js';
import {
  buildPathIndex,
  resolveImportPath,
  isSourceFile
} from './resolveImport.js';
import type {
  BuildRepositoryGraphOptions,
  GraphEdge,
  GraphNode,
  GraphNodeType,
  GraphRelation,
  RepositoryGraph
} from './types.js';

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

class GraphBuilder {
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];
  private edgeKeys = new Set<string>();

  addNode(node: GraphNode): GraphNode {
    const existing = this.nodes.get(node.id);
    if (existing) return existing;
    this.nodes.set(node.id, node);
    return node;
  }

  addEdge(source: string, target: string, relation: GraphRelation) {
    if (source === target) return;
    if (!this.nodes.has(source) || !this.nodes.has(target)) return;
    const key = `${source}→${target}:${relation}`;
    if (this.edgeKeys.has(key)) return;
    this.edgeKeys.add(key);
    this.edges.push({ source, target, relation });
  }

  ensureFileNode(path: string): GraphNode {
    const id = fileNodeId(path);
    return this.addNode({
      id,
      name: displayNameFromPath(path),
      type: classifyFileNodeType(path),
      path: normalizePath(path)
    });
  }

  ensureSynthetic(type: GraphNodeType, name: string): GraphNode {
    const id = syntheticNodeId(type, name);
    return this.addNode({ id, name, type });
  }

  allNodes(): GraphNode[] {
    return [...this.nodes.values()];
  }

  result(): RepositoryGraph {
    return {
      nodes: this.allNodes().sort((a, b) => a.id.localeCompare(b.id)),
      edges: this.edges.sort(
        (a, b) =>
          a.source.localeCompare(b.source) ||
          a.target.localeCompare(b.target) ||
          a.relation.localeCompare(b.relation)
      )
    };
  }
}

/**
 * Detect fetch/axios usage that implies "API Client" style calls to backend.
 */
function detectApiClientHints(source: string): boolean {
  return (
    /\bfetch\s*\(/i.test(source) ||
    /\baxios\./i.test(source) ||
    /from\s+['"]axios['"]/.test(source) ||
    /api\.js|api\.ts|apiClient/i.test(source)
  );
}

/**
 * Build a relationship graph from file contents via import parsing,
 * plus synthetic Database / Backend / Frontend nodes when detected.
 */
export function buildRepositoryGraph(options: BuildRepositoryGraphOptions): RepositoryGraph {
  const files = (options.files || []).map(normalizePath).filter(Boolean);
  const fileContents = options.fileContents ?? {};
  const maxFiles = options.maxFilesToParse ?? 120;
  const g = new GraphBuilder();
  const index = buildPathIndex(files);

  // Seed entry files so the graph always has roots
  for (const entry of options.entryFiles ?? []) {
    const path = normalizePath(entry);
    if (files.includes(path) || index.byPath.has(path) || index.byPath.has(path.toLowerCase())) {
      g.ensureFileNode(path);
    }
  }

  // Prefer parsing entries + structural files first
  const parsePriority = (path: string): number => {
    const type = classifyFileNodeType(path);
    const priority: Record<GraphNodeType, number> = {
      Backend: 100,
      Frontend: 100,
      Route: 90,
      Controller: 85,
      Service: 80,
      Repository: 75,
      Model: 70,
      Page: 65,
      Component: 60,
      Middleware: 55,
      Authentication: 55,
      Configuration: 40,
      Utility: 30,
      Database: 20,
      'External API': 20
    };
    return priority[type] ?? 10;
  };

  const parsable = files
    .filter((f) => isParsableSource(f) && isSourceFile(f))
    .sort((a, b) => parsePriority(b) - parsePriority(a) || a.localeCompare(b))
    .slice(0, maxFiles);

  const dbLabel = options.database?.split(',')[0]?.trim() || null;
  const backendLabel = options.backend?.split(',')[0]?.trim() || null;
  const frontendLabel = options.frontend?.split(',')[0]?.trim() || null;

  let dbNode: GraphNode | null = dbLabel
    ? g.ensureSynthetic('Database', dbLabel)
    : null;
  let backendRuntime: GraphNode | null = backendLabel
    ? g.ensureSynthetic('Backend', backendLabel)
    : null;
  let frontendRuntime: GraphNode | null = frontendLabel
    ? g.ensureSynthetic('Frontend', frontendLabel)
    : null;

  const apiClientFiles: string[] = [];

  for (const filePath of parsable) {
    const content = resolveContent(fileContents, filePath);
    if (content == null || content.length === 0) {
      // Still register important structural files without content
      const type = classifyFileNodeType(filePath);
      if (
        ['Backend', 'Frontend', 'Route', 'Controller', 'Service', 'Model', 'Page', 'Component'].includes(
          type
        )
      ) {
        g.ensureFileNode(filePath);
      }
      continue;
    }

    const sourceNode = g.ensureFileNode(filePath);
    const imports = parseImports(filePath, content);

    if (
      detectApiClientHints(content) ||
      /api\.(js|ts|jsx|tsx)$/i.test(getFileName(filePath)) ||
      /\/api\//i.test(filePath) && classifyFileNodeType(filePath) === 'Utility'
    ) {
      // Mark client-side API modules for later edges to backend
      if (sourceNode.type === 'Frontend' || sourceNode.type === 'Component' || sourceNode.type === 'Page' || sourceNode.type === 'Utility') {
        apiClientFiles.push(filePath);
      }
    }

    for (const imp of imports) {
      if (imp.isPackage) {
        const mapped = mapPackageToNode(imp.specifier);
        if (!mapped) continue;

        const syn = g.ensureSynthetic(
          mapped.type,
          mapped.displayName ?? mapped.name
        );

        // Prefer consolidated DB / runtime nodes when labels match
        let target = syn;
        if (mapped.type === 'Database' && dbNode) {
          target = dbNode;
        } else if (mapped.type === 'Database' && !dbNode) {
          dbNode = syn;
        } else if (
          mapped.type === 'Backend' &&
          backendRuntime &&
          (mapped.displayName === backendLabel || mapped.name === 'express')
        ) {
          target = backendRuntime;
        } else if (mapped.type === 'Frontend' && frontendRuntime) {
          target = frontendRuntime;
        }

        g.addEdge(
          sourceNode.id,
          target.id,
          inferRelation(sourceNode.type, target.type)
        );
        continue;
      }

      const resolved = resolveImportPath(filePath, imp.specifier, index);
      if (!resolved) continue;

      const targetNode = g.ensureFileNode(resolved);
      g.addEdge(
        sourceNode.id,
        targetNode.id,
        inferRelation(sourceNode.type, targetNode.type)
      );
    }
  }

  // Wire Model / Repository → Database when DB known
  if (dbNode) {
    for (const node of g.allNodes()) {
      if (node.type === 'Model' || node.type === 'Repository') {
        g.addEdge(node.id, dbNode.id, node.type === 'Model' ? 'persists' : 'queries');
      }
    }
  }

  // Wire Frontend API clients → Backend runtime
  if (backendRuntime) {
    const apiNodes = g
      .allNodes()
      .filter(
        (n) =>
          n.type === 'External API' &&
          n.path &&
          (apiClientFiles.includes(n.path) || /api\.(js|ts)$/i.test(n.path))
      );

    if (apiNodes.length > 0) {
      for (const apiNode of apiNodes) {
        g.addEdge(apiNode.id, backendRuntime.id, 'calls');
      }
      if (dbNode) {
        g.addEdge(backendRuntime.id, dbNode.id, 'queries');
      }
    } else if (apiClientFiles.length > 0) {
      const apiClientNode = g.ensureSynthetic('External API', 'API Client');
      for (const path of apiClientFiles) {
        const src = g.ensureFileNode(path);
        g.addEdge(src.id, apiClientNode.id, 'calls');
      }
      g.addEdge(apiClientNode.id, backendRuntime.id, 'calls');
      if (dbNode) {
        g.addEdge(backendRuntime.id, dbNode.id, 'queries');
      }
    } else if (dbNode) {
      for (const node of g.allNodes()) {
        if (node.type === 'Backend' && node.path) {
          g.addEdge(node.id, backendRuntime.id, 'depends_on');
        }
      }
    }
  }

  // Connect frontend entry → frontend runtime
  if (frontendRuntime) {
    for (const node of g.allNodes()) {
      if (node.type === 'Frontend' && node.path) {
        g.addEdge(node.id, frontendRuntime.id, 'depends_on');
      }
    }
  }

  // Heuristic layered chains when imports were sparse but structure exists
  addLayeredFallbacks(g, files);

  return g.result();
}

/**
 * When we have Route → Controller → Service → Model by naming/folder
 * but missing import edges (no file contents), add likely edges by name affinity.
 */
function addLayeredFallbacks(g: GraphBuilder, files: string[]) {
  const byType = new Map<GraphNodeType, GraphNode[]>();

  for (const path of files) {
    const type = classifyFileNodeType(path);
    if (
      !['Route', 'Controller', 'Service', 'Model', 'Middleware', 'Page', 'Component', 'Backend', 'Frontend'].includes(
        type
      )
    ) {
      continue;
    }
    // Only add file nodes that already exist OR are clearly structural
    const node = g.ensureFileNode(path);
    const list = byType.get(type) ?? [];
    list.push(node);
    byType.set(type, list);
  }

  const stem = (name: string) =>
    name
      .toLowerCase()
      .replace(/(routes?|controller|service|model|repository|middleware|page|component)$/i, '')
      .replace(/[^a-z0-9]/g, '');

  const linkMatching = (
    fromType: GraphNodeType,
    toType: GraphNodeType,
    relation: GraphRelation
  ) => {
    const fromNodes = byType.get(fromType) ?? [];
    const toNodes = byType.get(toType) ?? [];
    for (const from of fromNodes) {
      const fromStem = stem(from.name);
      if (!fromStem) continue;
      for (const to of toNodes) {
        const toStem = stem(to.name);
        if (!toStem) continue;
        if (fromStem === toStem || fromStem.includes(toStem) || toStem.includes(fromStem)) {
          g.addEdge(from.id, to.id, relation);
        }
      }
    }
  };

  linkMatching('Backend', 'Route', 'mounts');
  linkMatching('Route', 'Controller', 'calls');
  linkMatching('Route', 'Middleware', 'uses');
  linkMatching('Controller', 'Service', 'calls');
  linkMatching('Service', 'Model', 'uses');
  linkMatching('Frontend', 'Page', 'renders');
  linkMatching('Frontend', 'Component', 'renders');
  linkMatching('Page', 'Component', 'renders');
}
