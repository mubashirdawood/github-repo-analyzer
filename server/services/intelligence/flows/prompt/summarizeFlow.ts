/**
 * Summarize a RequestFlow / ExecutionGraph for LLM prompts.
 * Never includes raw code or file paths.
 */

import type { RequestFlow } from '../types.js';
import type { ExecutionGraph, RankedExecutionGraph } from '../executionGraph/types.js';
import type { RequestFlowPromptInput, RequestFlowSummary } from './types.js';

function isExecutionGraph(input: RequestFlowPromptInput): input is ExecutionGraph {
  return (
    typeof input === 'object' &&
    input != null &&
    Array.isArray((input as ExecutionGraph).nodes) &&
    Array.isArray((input as ExecutionGraph).edges)
  );
}

function isRequestFlow(input: RequestFlowPromptInput): input is RequestFlow {
  return (
    typeof input === 'object' &&
    input != null &&
    Array.isArray((input as RequestFlow).steps) &&
    typeof (input as RequestFlow).endpoint === 'string'
  );
}

function cleanLabel(raw: string): string {
  return String(raw || '')
    .replace(/\(\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function displayStepLabel(type: string, name: string): string {
  const label = cleanLabel(name);
  const t = (type || '').toLowerCase();

  if (t === 'route') return label.includes('/') ? 'Route' : label || 'Route';
  if (t === 'middleware') {
    if (/middleware/i.test(label)) return label;
    if (/valid/i.test(label)) return 'Validation Middleware';
    return `${label} Middleware`.replace(/\s+/g, ' ').trim();
  }
  if (t === 'controller') {
    return /controller/i.test(label) ? label.replace(/\(\)$/, '') : `${label} Controller`.replace(/\s+Controller Controller/i, ' Controller');
  }
  if (t === 'service') {
    return /service/i.test(label) ? label.replace(/\(\)$/, '') : `${label} Service`;
  }
  if (t === 'model' || t === 'database') {
    if (/mongo|postgres|mysql|redis|prisma|database/i.test(label)) return label;
    if (/model/i.test(label)) return label.replace(/\(\)$/, '');
    return label;
  }
  if (t === 'authentication') return label.replace(/\(\)$/, '') || 'JWT';
  if (t === 'external_api' || t === 'externalapi') return label.replace(/\(\)$/, '');
  if (t === 'response') return 'Response';
  return label.replace(/\(\)$/, '');
}

function normalizeChainLabel(label: string): string {
  let s = cleanLabel(label);
  // AuthController.login → Auth Controller
  if (/\./.test(s) && !/\s/.test(s)) {
    const root = s.split('.')[0]!;
    s = root
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/Controller$/i, ' Controller')
      .replace(/Service$/i, ' Service')
      .replace(/Middleware$/i, ' Middleware')
      .replace(/Model$/i, '')
      .trim();
  }
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function uniquePreserve(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function emptyRoles(): RequestFlowSummary['roles'] {
  return {
    middleware: [],
    controllers: [],
    services: [],
    models: [],
    databases: [],
    authentication: [],
    externalApis: []
  };
}

function pushRole(
  roles: RequestFlowSummary['roles'],
  type: string,
  label: string
): void {
  const t = type.toLowerCase();
  const cleaned = normalizeChainLabel(label);
  if (!cleaned || cleaned === 'Response' || cleaned === 'Route') return;

  if (t === 'middleware') roles.middleware.push(cleaned);
  else if (t === 'controller') roles.controllers.push(cleaned);
  else if (t === 'service') roles.services.push(cleaned);
  else if (t === 'model') roles.models.push(cleaned);
  else if (t === 'database') {
    if (/mongo|postgres|mysql|sqlite|prisma|database/i.test(cleaned)) {
      roles.databases.push(cleaned);
    } else {
      roles.models.push(cleaned);
    }
  } else if (t === 'authentication') roles.authentication.push(cleaned);
  else if (t === 'external_api' || t === 'externalapi' || t === 'payment' || t === 'email') {
    roles.externalApis.push(cleaned);
  }
}

/**
 * Walk execution graph edges from the route node to build an ordered chain.
 */
function chainFromGraph(graph: ExecutionGraph): Array<{ type: string; label: string }> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const outEdges = new Map<string, string[]>();
  for (const e of graph.edges) {
    const list = outEdges.get(e.source) ?? [];
    list.push(e.target);
    outEdges.set(e.source, list);
  }

  const routeNode =
    graph.nodes.find((n) => n.type === 'route') ??
    graph.nodes.find((n) => n.id.startsWith('route-')) ??
    graph.nodes[0];

  if (!routeNode) return [];

  const chain: Array<{ type: string; label: string }> = [];
  const visited = new Set<string>();
  let current: string | undefined = routeNode.id;

  // Prefer linear path via next/calls/queries/authenticates/responds
  while (current && !visited.has(current)) {
    visited.add(current);
    const node = byId.get(current);
    if (node) {
      chain.push({
        type: node.type,
        label: displayStepLabel(node.type, node.label)
      });
    }
    const targets = outEdges.get(current) ?? [];
    // Prefer main-path relations: look up edge relation
    const mainTarget = pickMainNext(graph, current, targets, visited);
    current = mainTarget;
  }

  return chain;
}

function pickMainNext(
  graph: ExecutionGraph,
  source: string,
  targets: string[],
  visited: Set<string>
): string | undefined {
  if (targets.length === 0) return undefined;

  const priority = ['next', 'calls', 'queries', 'authenticates', 'responds', 'uses'];
  const edges = graph.edges.filter((e) => e.source === source && !visited.has(e.target));

  for (const rel of priority) {
    const hit = edges.find((e) => e.relation === rel);
    if (hit) return hit.target;
  }

  return targets.find((t) => !visited.has(t));
}

/**
 * Build a code-free summary of a request flow for prompting.
 */
export function summarizeRequestFlow(
  input: RequestFlowPromptInput,
  flowTitle?: string
): RequestFlowSummary {
  const roles = emptyRoles();
  let method = 'GET';
  let endpoint = '/';
  let title = flowTitle || 'Request Flow';
  let chain: string[] = [];

  if (isExecutionGraph(input)) {
    method = input.method;
    endpoint = input.endpoint;
    if (!flowTitle && 'category' in input && typeof (input as RankedExecutionGraph).category === 'string') {
      title = `${(input as RankedExecutionGraph).category} Flow`;
    } else if (!flowTitle) {
      title = `${method} ${endpoint} Flow`;
    }

    const steps = chainFromGraph(input);
    for (const step of steps) {
      pushRole(roles, step.type, step.label);
    }
    chain = uniquePreserve(
      steps.map((s) => {
        if (s.type === 'route') return 'Route';
        return normalizeChainLabel(displayStepLabel(s.type, s.label));
      })
    );
  } else if (isRequestFlow(input)) {
    method = input.method;
    endpoint = input.endpoint;
    title = flowTitle || input.title || `${method} ${endpoint} Flow`;
    if (title && !/flow/i.test(title) && /auth|login|register|payment/i.test(title)) {
      title = `${title} Flow`;
    }

    for (const step of input.steps) {
      pushRole(roles, step.type, step.name);
      const label =
        step.type === 'route'
          ? 'Route'
          : normalizeChainLabel(displayStepLabel(step.type, step.name));
      chain.push(label);
    }
    chain = uniquePreserve(chain);
  }

  // Ensure Response terminates the summary chain
  if (chain.length && chain[chain.length - 1]!.toLowerCase() !== 'response') {
    chain.push('Response');
  }
  if (chain.length === 0) {
    chain = ['Route', 'Response'];
  }

  // Dedupe role lists
  roles.middleware = uniquePreserve(roles.middleware);
  roles.controllers = uniquePreserve(roles.controllers);
  roles.services = uniquePreserve(roles.services);
  roles.models = uniquePreserve(roles.models);
  roles.databases = uniquePreserve(roles.databases);
  roles.authentication = uniquePreserve(roles.authentication);
  roles.externalApis = uniquePreserve(roles.externalApis);

  return { title, method, endpoint, chain, roles };
}

/**
 * Render the human-readable flow outline used inside the prompt.
 */
export function formatFlowOutline(summary: RequestFlowSummary): string {
  const lines: string[] = [
    summary.title,
    '',
    `${summary.method} ${summary.endpoint}`,
    ''
  ];

  for (let i = 0; i < summary.chain.length; i += 1) {
    lines.push(summary.chain[i]!);
    if (i < summary.chain.length - 1) {
      lines.push('↓');
    }
  }

  return lines.join('\n');
}
