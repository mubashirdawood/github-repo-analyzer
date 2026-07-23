/**
 * Mermaid architecture diagram generator.
 * Draws software architecture (not folders), grouped with subgraphs.
 * Output is Mermaid only. Max 40 nodes.
 */

import type { RepositoryAnalysis } from '../types.js';
import type { ArchitectureContext } from '../architectureContext/types.js';
import {
  buildArchitectureContext,
  toArchitectureLabel
} from '../architectureContext/buildArchitectureContext.js';

export interface GenerateArchitectureMermaidOptions {
  /** Hard cap on diagram nodes (default 40). */
  maxNodes?: number;
  /** Pre-built context; if omitted, built from analysis. */
  context?: ArchitectureContext;
  /** Max individual page nodes under Pages. */
  maxPages?: number;
  /** Max individual route nodes under API Layer. */
  maxRoutes?: number;
  /** Max external API nodes. */
  maxExternal?: number;
}

function mid(prefix: string, label: string): string {
  const slug = String(label)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
  return `${prefix}_${slug || 'n'}`;
}

function clean(label: string): string {
  return (
    String(label)
      .replace(/"/g, "'")
      .replace(/[()[\]{}|/\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Node'
  );
}

type Shape = 'rect' | 'db' | 'round';

function nodeLine(id: string, label: string, _shape: Shape = 'rect'): string {
  const text = clean(label);
  // Uniform quoted rectangles — most reliable in Mermaid 11.16
  return `  ${id}["${text}"]`;
}

class Diagram {
  private readonly maxNodes: number;
  private nodeCount = 0;
  private readonly ids = new Set<string>();
  private readonly nodeLines: string[] = [];
  private readonly edgeKeys = new Set<string>();
  private readonly edgeLines: string[] = [];
  private readonly blocks: string[] = [];

  constructor(maxNodes: number) {
    this.maxNodes = maxNodes;
  }

  get remaining(): number {
    return Math.max(0, this.maxNodes - this.nodeCount);
  }

  ensure(id: string, label: string, shape: Shape = 'rect'): string | null {
    if (this.ids.has(id)) return id;
    if (this.nodeCount >= this.maxNodes) return null;
    this.ids.add(id);
    this.nodeCount += 1;
    this.nodeLines.push(nodeLine(id, label, shape));
    return id;
  }

  link(from: string | null | undefined, to: string | null | undefined): void {
    if (!from || !to || from === to) return;
    if (!this.ids.has(from) || !this.ids.has(to)) return;
    const key = `${from}-->${to}`;
    if (this.edgeKeys.has(key)) return;
    this.edgeKeys.add(key);
    this.edgeLines.push(`  ${from} --> ${to}`);
  }

  /**
   * Emit a subgraph. Nodes referenced inside must already be ensure()'d;
   * this only writes the grouping wrapper + node id list.
   */
  group(subgraphId: string, title: string, memberIds: string[]): void {
    const members = memberIds.filter((id) => this.ids.has(id));
    if (members.length === 0) return;
    const sid = mid('sg', subgraphId);
    this.blocks.push(`  subgraph ${sid}["${clean(title)}"]`);
    for (const id of members) this.blocks.push(`    ${id}`);
    this.blocks.push('  end');
  }

  render(): string {
    const lines = ['flowchart TD', ...this.nodeLines, ...this.blocks, ...this.edgeLines];
    return lines.join('\n');
  }
}

/**
 * Generate a Mermaid flowchart of software architecture from RepositoryAnalysis.
 * Does NOT draw folders. Output is Mermaid syntax only.
 */
export function generateArchitectureMermaid(
  analysis: RepositoryAnalysis,
  options: GenerateArchitectureMermaidOptions = {}
): string {
  const maxNodes = options.maxNodes ?? 40;
  const maxPages = options.maxPages ?? 5;
  const maxRoutes = options.maxRoutes ?? 5;
  const maxExternal = options.maxExternal ?? 4;

  const ctx =
    options.context ??
    buildArchitectureContext(analysis, {
      maxLabels: Math.max(maxPages, maxRoutes, 8)
    });

  const d = new Diagram(maxNodes);

  // —— Core actors ——
  const browser = d.ensure('Browser', 'Browser', 'round');

  const feName = ctx.frontend?.framework ?? null;
  const beName = ctx.backend?.framework ?? null;
  const dbName = ctx.database?.split(',')[0]?.trim() ?? null;
  const authName = ctx.authentication ?? null;

  const fe = feName ? d.ensure(mid('fe', feName), feName) : null;
  const pages = fe ? d.ensure('Pages', 'Pages') : null;
  const components =
    fe && (ctx.frontend?.components ?? 0) > 0
      ? d.ensure('Components', 'Components')
      : fe
        ? d.ensure('Components', 'Components')
        : null;

  const pageIds: string[] = [];
  for (const page of (ctx.frontend?.pages ?? []).slice(0, maxPages)) {
    if (d.remaining < 4) break;
    const id = d.ensure(mid('pg', page), page);
    if (id) pageIds.push(id);
  }

  const be = beName ? d.ensure(mid('be', beName), beName) : null;
  const api = be ? d.ensure('APILayer', 'API Layer') : null;

  const routeIds: string[] = [];
  for (const route of (ctx.backend?.routes ?? []).slice(0, maxRoutes)) {
    if (d.remaining < 4) break;
    const id = d.ensure(mid('rt', route), route);
    if (id) routeIds.push(id);
  }

  const controllers =
    be &&
    (analysis.structure.controllers.length > 0 ||
      analysis.structure.routes.length > 0 ||
      Boolean(beName))
      ? d.ensure('Controllers', 'Controllers')
      : null;

  const services =
    be && (analysis.structure.services.length > 0 || Boolean(beName))
      ? d.ensure('Services', 'Services')
      : null;

  // Optional named services if budget allows
  const serviceIds: string[] = [];
  for (const svc of (ctx.backend?.services ?? []).slice(0, 3)) {
    if (d.remaining < 3) break;
    const id = d.ensure(mid('svc', svc), svc);
    if (id) serviceIds.push(id);
  }

  const auth = authName ? d.ensure(mid('auth', authName), authName) : null;

  const db = dbName ? d.ensure(mid('db', dbName), dbName, 'db') : null;

  const extIds: string[] = [];
  for (const ext of (ctx.externalServices ?? []).slice(0, maxExternal)) {
    if (d.remaining < 2) break;
    const id = d.ensure(mid('ext', ext), ext);
    if (id) extIds.push(id);
  }

  const configIds: string[] = [];
  const configLabels = analysis.structure.config.map(toArchitectureLabel).slice(0, 3);
  if (configLabels.length > 0 || analysis.structure.config.length > 0) {
    if (configLabels.length === 0) {
      const id = d.ensure('Config', 'Config');
      if (id) configIds.push(id);
    } else {
      for (const c of configLabels) {
        if (d.remaining < 1) break;
        const id = d.ensure(mid('cfg', c), c);
        if (id) configIds.push(id);
      }
    }
  }

  // —— Subgraphs (architecture groups, not folders) ——
  d.group('Frontend', 'Frontend', [fe, pages, components, ...pageIds].filter(Boolean) as string[]);
  d.group('Backend', 'Backend', [be, api, ...routeIds, controllers, services, ...serviceIds].filter(Boolean) as string[]);
  if (auth) d.group('Authentication', 'Authentication', [auth]);
  if (extIds.length) d.group('ExternalAPIs', 'External APIs', extIds);
  if (configIds.length) d.group('Configuration', 'Configuration', configIds);

  // —— Relationships ——
  d.link(browser, fe);
  d.link(fe, pages);
  d.link(fe, components);
  for (const p of pageIds) d.link(pages, p);

  const frontOut = pageIds[0] ?? pages ?? fe;
  d.link(frontOut, api ?? be);
  d.link(be, api);

  if (routeIds.length) {
    for (const r of routeIds) d.link(api, r);
    for (const r of routeIds) d.link(r, controllers);
  } else {
    d.link(api, controllers);
  }

  d.link(controllers, services);
  for (const s of serviceIds) d.link(services, s);

  d.link(services ?? controllers ?? be, db);
  d.link(controllers ?? api, auth);
  d.link(auth, db);

  for (const ext of extIds) d.link(services ?? be, ext);

  for (const cfg of configIds) {
    d.link(be, cfg);
    d.link(fe, cfg);
  }

  // Minimal fallback
  if (!fe && !be) {
    const app = d.ensure('App', ctx.projectType || 'Application');
    d.link(browser, app);
    if (db) d.link(app, db);
  }

  return d.render();
}
