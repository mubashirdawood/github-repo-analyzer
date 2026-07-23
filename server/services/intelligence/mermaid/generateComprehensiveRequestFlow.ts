/**
 * Comprehensive repository request-lifecycle Mermaid flowchart.
 * One diagram for the whole app (~20–40 nodes). Deterministic — no LLM.
 */

import type { RepositoryAnalysis } from '../types.js';
import type { ArchitectureContext } from '../architectureContext/types.js';
import { buildArchitectureContext } from '../architectureContext/buildArchitectureContext.js';

export interface GenerateComprehensiveRequestFlowOptions {
  maxNodes?: number;
  context?: ArchitectureContext;
  /** Known route count (from Express scan). */
  routeCount?: number;
}

const RESERVED = new Set([
  'end',
  'subgraph',
  'graph',
  'flowchart',
  'style',
  'classDef',
  'click',
  'direction'
]);

function safeId(prefix: string, label: string): string {
  let base = String(label)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'N$1')
    .slice(0, 28) || 'Node';
  if (!/^[A-Za-z]/.test(base)) base = `N_${base}`;
  let id = `${prefix}_${base}`;
  if (RESERVED.has(id.toLowerCase()) || RESERVED.has(base.toLowerCase())) {
    id = `${prefix}_X_${base}`;
  }
  return id;
}

function cleanLabel(label: string): string {
  return (
    String(label)
      .replace(/"/g, "'")
      .replace(/[()[\]{}|/\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Node'
  );
}

function nodeLine(id: string, label: string, _shape: 'rect' | 'round' | 'db' = 'rect'): string {
  const text = cleanLabel(label);
  return `  ${id}["${text}"]`;
}

class FlowBuilder {
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

  ensure(id: string, label: string, shape: 'rect' | 'round' | 'db' = 'rect'): string | null {
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

  group(subgraphId: string, title: string, memberIds: Array<string | null | undefined>): void {
    const members = memberIds.filter((id): id is string => Boolean(id) && this.ids.has(id as string));
    if (members.length === 0) return;
    const sid = safeId('sg', subgraphId);
    this.blocks.push(`  subgraph ${sid}["${cleanLabel(title)}"]`);
    for (const id of members) this.blocks.push(`    ${id}`);
    this.blocks.push('  end');
  }

  render(): string {
    return ['flowchart TD', ...this.nodeLines, ...this.blocks, ...this.edgeLines].join('\n');
  }
}

/**
 * Build one comprehensive request-lifecycle flowchart for the repository.
 */
export function generateComprehensiveRequestFlow(
  analysis: RepositoryAnalysis,
  options: GenerateComprehensiveRequestFlowOptions = {}
): string {
  const maxNodes = options.maxNodes ?? 40;
  const ctx =
    options.context ??
    buildArchitectureContext(analysis, { maxLabels: 8 });

  const d = new FlowBuilder(maxNodes);

  const feName = ctx.frontend?.framework || analysis.technologies.frontend;
  const beName = ctx.backend?.framework || analysis.technologies.backend;
  const dbName = (ctx.database || analysis.technologies.database || '').split(',')[0]?.trim() || null;
  const authName = ctx.authentication || analysis.technologies.authentication;
  const stateMgmt =
    ctx.frontend?.stateManagement || analysis.technologies.stateManagement;
  const hasPages = (ctx.frontend?.pages?.length || analysis.structure.pages.length) > 0;
  const hasComponents =
    (ctx.frontend?.components || 0) > 0 || analysis.structure.components.length > 0;
  const hasRoutes =
    (ctx.backend?.routes?.length || analysis.structure.routes.length || options.routeCount || 0) > 0;
  const hasControllers = analysis.structure.controllers.length > 0;
  const hasServices =
    analysis.structure.services.length > 0 || (ctx.backend?.services?.length || 0) > 0;
  const hasModels = analysis.structure.models.length > 0;
  const hasMiddleware =
    (ctx.backend?.middleware?.length || analysis.structure.middleware.length) > 0;
  const hasApiClient = analysis.structure.api.length > 0 || Boolean(feName);
  const hasUtils = analysis.structure.utils.length > 0;
  const hasConfig = analysis.structure.config.length > 0;
  const externals = [...(ctx.externalServices || [])];
  if (analysis.technologies.realtime && !externals.includes(analysis.technologies.realtime)) {
    externals.push(analysis.technologies.realtime);
  }
  if (analysis.technologies.cache && !externals.includes(analysis.technologies.cache)) {
    externals.push(analysis.technologies.cache);
  }

  // —— Spine nodes ——
  const user = d.ensure('User', 'User', 'round');
  const fe = feName
    ? d.ensure(safeId('fe', feName), `${feName} Application`)
    : d.ensure('FrontendApp', 'Frontend Application');
  const router = hasPages
    ? d.ensure('AppRouter', feName?.toLowerCase().includes('next') ? 'App Router' : 'React Router')
    : null;
  const pages = hasPages ? d.ensure('Pages', 'Pages') : null;
  const components = hasComponents ? d.ensure('Components', 'Components') : null;
  const state = stateMgmt ? d.ensure(safeId('state', stateMgmt), stateMgmt) : null;
  const apiClient = hasApiClient
    ? d.ensure('ApiClient', 'API Client')
    : null;

  const be = beName
    ? d.ensure(safeId('be', beName), `${beName} Server`)
    : d.ensure('BackendServer', 'Backend Server');
  const middleware = hasMiddleware
    ? d.ensure('AuthMiddleware', authName ? `${authName} Middleware` : 'Authentication Middleware')
    : authName
      ? d.ensure('AuthMiddleware', `${authName} Middleware`)
      : null;
  const routes = hasRoutes || Boolean(beName) ? d.ensure('Routes', 'Routes') : null;
  const controllers =
    hasControllers || Boolean(beName) ? d.ensure('Controllers', 'Controllers') : null;
  const services = hasServices || Boolean(beName) ? d.ensure('Services', 'Services') : null;
  const models = hasModels || Boolean(dbName) ? d.ensure('Models', 'Models') : null;
  const db = dbName
    ? d.ensure(safeId('db', dbName), dbName, 'db')
    : hasModels
      ? d.ensure('Database', 'Database', 'db')
      : null;

  const response = d.ensure('HttpResponse', 'Response');
  const uiUpdate = d.ensure('UiUpdate', 'UI Update');

  const authNode = authName && !middleware
    ? d.ensure(safeId('auth', authName), authName)
    : authName
      ? d.ensure(safeId('auth', authName), authName)
      : null;

  const utils = hasUtils && d.remaining > 2 ? d.ensure('Utilities', 'Utilities') : null;
  const config = hasConfig && d.remaining > 2 ? d.ensure('Configuration', 'Configuration') : null;

  const extIds: string[] = [];
  for (const ext of externals.slice(0, 6)) {
    if (d.remaining < 2) break;
    const id = d.ensure(safeId('ext', ext), ext);
    if (id) extIds.push(id);
  }

  // —— Subgraphs ——
  d.group('Frontend', 'Frontend', [fe, router, pages, components, state, apiClient]);
  d.group('Backend', 'Backend', [be, middleware, routes, controllers, services]);
  d.group('Data', 'Data Layer', [models, db]);
  if (extIds.length) d.group('External', 'External Services', extIds);
  d.group('CrossCutting', 'Cross-Cutting', [authNode, utils, config].filter(Boolean));

  // —— Lifecycle edges ——
  d.link(user, fe);
  d.link(fe, router);
  d.link(router, pages);
  d.link(pages, components);
  d.link(fe, state);
  d.link(pages || components || fe, apiClient);
  d.link(apiClient || fe, be);
  d.link(be, middleware);
  d.link(middleware || be, routes);
  d.link(routes, controllers);
  d.link(controllers, services);
  d.link(services || controllers, models);
  d.link(models || services, db);
  d.link(authNode, middleware || controllers);
  for (const ext of extIds) {
    d.link(services || controllers || be, ext);
  }
  d.link(utils, services);
  d.link(config, be);
  d.link(config, fe);

  // Response path back to UI
  const lastBackend = db || models || services || controllers || routes || be;
  d.link(lastBackend, response);
  d.link(response, apiClient || fe);
  d.link(apiClient || fe, uiUpdate);
  d.link(uiUpdate, user);

  return d.render();
}

/**
 * Guaranteed-valid minimal lifecycle diagram (fallback).
 */
export function buildFallbackRequestLifecycleMermaid(
  labels: {
    frontend?: string | null;
    backend?: string | null;
    database?: string | null;
  } = {}
): string {
  const fe = cleanLabel(labels.frontend || 'Frontend');
  const be = cleanLabel(labels.backend || 'Backend');
  const db = cleanLabel(labels.database || 'Database');
  return [
    'flowchart TD',
    `  User["User"]`,
    `  Frontend["${fe}"]`,
    `  ApiClient["API Client"]`,
    `  Backend["${be}"]`,
    `  Middleware["Middleware"]`,
    `  Routes["Routes"]`,
    `  Controllers["Controllers"]`,
    `  Services["Services"]`,
    `  Models["Models"]`,
    `  Database["${db}"]`,
    `  HttpResponse["Response"]`,
    `  UiUpdate["UI Update"]`,
    `  subgraph sg_Frontend["Frontend"]`,
    `    Frontend`,
    `    ApiClient`,
    `  end`,
    `  subgraph sg_Backend["Backend"]`,
    `    Backend`,
    `    Middleware`,
    `    Routes`,
    `    Controllers`,
    `    Services`,
    `  end`,
    `  subgraph sg_Data["Data Layer"]`,
    `    Models`,
    `    Database`,
    `  end`,
    `  User --> Frontend`,
    `  Frontend --> ApiClient`,
    `  ApiClient --> Backend`,
    `  Backend --> Middleware`,
    `  Middleware --> Routes`,
    `  Routes --> Controllers`,
    `  Controllers --> Services`,
    `  Services --> Models`,
    `  Models --> Database`,
    `  Database --> HttpResponse`,
    `  HttpResponse --> ApiClient`,
    `  ApiClient --> UiUpdate`,
    `  UiUpdate --> User`
  ].join('\n');
}
