/**
 * Mermaid sequence diagram generator for important API flows.
 * Returns Mermaid sequenceDiagram syntax only (per API).
 */

import type { RepositoryAnalysis } from '../types.js';
import type { RequestFlow } from '../flows/types.js';
import { analyzeRequestFlows } from '../flows/analyzeRequestFlows.js';
import { buildArchitectureContext } from '../architectureContext/buildArchitectureContext.js';
import { selectImportantFlows, IMPORTANT_API_PATTERNS } from './importantApis.js';

export interface ApiSequenceDiagram {
  /** Human title: Login, Registration, Create Post, … */
  name: string;
  /** Matched route when known, e.g. POST /auth/login */
  route: string;
  /** Mermaid sequenceDiagram body only (no markdown fence). */
  mermaid: string;
}

export interface GenerateSequenceDiagramsOptions {
  /** Precomputed request flows; if omitted, analyzed from files + contents. */
  flows?: RequestFlow[];
  files?: string[];
  fileContents?: Record<string, string>;
  /** Frontend participant label (default from analysis). */
  frontend?: string | null;
  /** Backend / route participant hint. */
  backend?: string | null;
  database?: string | null;
  authentication?: string | null;
  maxDiagrams?: number;
}

interface Participant {
  id: string;
  label: string;
}

function sanitizeId(label: string, used: Set<string>): string {
  let base = String(label)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'P$1')
    .slice(0, 28) || 'P';

  // Mermaid participant ids should be simple aliases
  if (!/^[A-Za-z]/.test(base)) base = `P_${base}`;

  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

function cleanLabel(label: string): string {
  return String(label).replace(/"/g, "'").trim() || 'Step';
}

/**
 * Map a request-flow step list into ordered sequence participants.
 * Always anchors: User → Frontend → … → Response
 */
function buildParticipants(
  flowSteps: string[],
  frontend: string,
  backend: string
): Participant[] {
  const used = new Set<string>();
  const participants: Participant[] = [];

  const add = (label: string) => {
    const cleaned = cleanLabel(label);
    if (participants.some((p) => p.label.toLowerCase() === cleaned.toLowerCase())) {
      return participants.find((p) => p.label.toLowerCase() === cleaned.toLowerCase())!;
    }
    const id = sanitizeId(cleaned, used);
    const p = { id, label: cleaned };
    participants.push(p);
    return p;
  };

  add('User');
  add(frontend);

  const skip = new Set(
    ['response', 'http server', frontend.toLowerCase()].map((s) => s.toLowerCase())
  );

  // Drop bare framework tokens — route/controller steps already carry the chain
  const steps = flowSteps.filter(
    (s) => !/^(express|nestjs|next\.js|fastify|http server)$/i.test(s)
  );

  const roleOrder: RegExp[] = [
    /\b(route|api layer|router)\b/i,
    /\bcontroller\b/i,
    /\bmiddleware\b/i,
    /\bservice\b/i,
    /\b(model|repository)\b/i,
    /\b(mongodb|postgres|mysql|sqlite|redis|database|prisma|supabase|firebase)\b/i,
    /\b(jwt|passport|bcrypt|nextauth|clerk)\b/i,
    /\b(openai|stripe|cloudinary|socket|http client)\b/i
  ];

  const remaining = [...steps];

  for (const role of roleOrder) {
    const hitIdx = remaining.findIndex((s) => role.test(s) && !skip.has(s.toLowerCase()));
    if (hitIdx >= 0) {
      add(remaining[hitIdx]!);
      remaining.splice(hitIdx, 1);
    }
  }

  for (const step of remaining) {
    if (skip.has(step.toLowerCase())) continue;
    if (/^response$/i.test(step)) continue;
    if (participants.length >= 10) break;
    add(step);
  }

  // Thin-flow skeletons only when roles are missing
  if (!participants.some((p) => /route|api layer|router/i.test(p.label))) {
    add(`${backend} Route`);
  }
  if (!participants.some((p) => /controller/i.test(p.label)) && participants.length < 9) {
    add('Controller');
  }
  if (!participants.some((p) => /service/i.test(p.label)) && participants.length < 9) {
    add('Service');
  }
  if (
    !participants.some((p) =>
      /mongodb|postgres|mysql|database|redis|prisma|model/i.test(p.label)
    ) &&
    participants.length < 10
  ) {
    add('Database');
  }

  add('Response');
  return participants;
}

function actionLabel(name: string, route: string): string {
  if (route && route !== 'UNKNOWN *') return route;
  return name;
}

function flowRouteLabel(flow: RequestFlow): string {
  if (flow.endpoint === '*') return 'UNKNOWN *';
  return `${flow.method} ${flow.endpoint}`;
}

function flowStepNames(flow: RequestFlow): string[] {
  return flow.steps.map((s) => s.name);
}

/**
 * Build one Mermaid sequenceDiagram from participants + API name.
 */
export function flowToSequenceMermaid(
  name: string,
  flow: RequestFlow,
  opts: { frontend: string; backend: string }
): string {
  const participants = buildParticipants(flowStepNames(flow), opts.frontend, opts.backend);
  const lines: string[] = ['sequenceDiagram'];

  for (const p of participants) {
    if (p.label === 'User') {
      lines.push(`  actor ${p.id} as ${p.label}`);
    } else {
      lines.push(`  participant ${p.id} as ${p.label}`);
    }
  }

  // Wire sequential request down the chain, then response back up
  const ids = participants.map((p) => p.id);
  const requestAction = actionLabel(name, flowRouteLabel(flow));

  for (let i = 0; i < ids.length - 1; i += 1) {
    const from = ids[i]!;
    const to = ids[i + 1]!;
    const toLabel = participants[i + 1]!.label;

    if (i === 0) {
      lines.push(`  ${from}->>${to}: ${name} request`);
    } else if (i === 1) {
      lines.push(`  ${from}->>${to}: ${requestAction}`);
    } else if (/jwt|auth/i.test(toLabel) && !/route|controller/i.test(toLabel)) {
      lines.push(`  ${from}->>${to}: sign / verify`);
    } else if (/mongo|postgres|mysql|database|redis|prisma|model/i.test(toLabel)) {
      lines.push(`  ${from}->>${to}: query`);
    } else if (/response/i.test(toLabel)) {
      lines.push(`  ${from}->>${to}: result`);
    } else {
      lines.push(`  ${from}->>${to}: call`);
    }
  }

  // Return path (dashed) from Response back to User
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const from = ids[i]!;
    const to = ids[i - 1]!;
    if (i === ids.length - 1) {
      lines.push(`  ${from}-->>${to}: 200 OK`);
    } else if (i === 1) {
      lines.push(`  ${from}-->>${to}: success`);
    } else {
      lines.push(`  ${from}-->>${to}: return`);
    }
  }

  return lines.join('\n');
}

/**
 * Synthetic fallback flows when route parsing found nothing useful.
 */
function syntheticImportantFlows(
  analysis: RepositoryAnalysis | undefined,
  opts: { frontend: string; backend: string; database: string; auth: string }
): ApiSequenceDiagram[] {
  const hasAuth = Boolean(analysis?.technologies.authentication || opts.auth);
  const hasDb = Boolean(analysis?.technologies.database || opts.database);
  const names = IMPORTANT_API_PATTERNS.map((p) => p.name).slice(0, 4);

  // Only emit Login/Registration style fallbacks when auth stack exists
  const selected = hasAuth
    ? names.filter((n) => n === 'Login' || n === 'Registration')
    : names.slice(0, 1);

  return selected.map((name) => {
    const endpoint = `/${name.toLowerCase().replace(/\s+/g, '-')}`;
    const stepDefs = [
      { type: 'router', name: opts.backend, file: '' },
      { type: 'route', name: `${name} Route`, file: '' },
      { type: 'controller', name: `${name} Controller`, file: '' },
      { type: 'service', name: 'Service', file: '' },
      ...(hasDb
        ? [{ type: 'database', name: opts.database || 'Database', file: '' }]
        : []),
      ...(hasAuth && (name === 'Login' || name === 'Registration')
        ? [{ type: 'authentication', name: opts.auth || 'JWT', file: '' }]
        : []),
      { type: 'response', name: 'Response', file: '' }
    ];
    const steps = stepDefs.map((s, i) => ({
      ...s,
      next: i < stepDefs.length - 1 ? stepDefs[i + 1]!.name : undefined
    }));
    const flow: RequestFlow = {
      id: `flow-post-${name.toLowerCase().replace(/\s+/g, '-')}`,
      title: name,
      endpoint,
      method: 'POST',
      description: `Synthetic ${name} flow`,
      steps
    };
    return {
      name,
      route: flowRouteLabel(flow),
      mermaid: flowToSequenceMermaid(name, flow, {
        frontend: opts.frontend,
        backend: opts.backend
      })
    };
  });
}

/**
 * Generate one Mermaid sequence diagram per important API.
 * Each `mermaid` field contains only sequenceDiagram syntax.
 */
export function generateSequenceDiagrams(
  analysis: RepositoryAnalysis,
  options: GenerateSequenceDiagramsOptions = {}
): ApiSequenceDiagram[] {
  const ctx = buildArchitectureContext(analysis);
  const frontend =
    options.frontend ||
    ctx.frontend?.framework ||
    analysis.technologies.frontend ||
    'React';
  const backend =
    options.backend ||
    ctx.backend?.framework ||
    analysis.technologies.backend ||
    'Express';
  const database =
    options.database ||
    analysis.technologies.database?.split(',')[0]?.trim() ||
    'Database';
  const authentication =
    options.authentication ||
    analysis.technologies.authentication ||
    'JWT';

  const flows =
    options.flows ??
    analyzeRequestFlows({
      files: options.files ?? analysis.files,
      fileContents: options.fileContents,
      backend,
      database,
      authentication,
      maxRoutes: 40
    });

  const important = selectImportantFlows(flows, options.maxDiagrams ?? 8);

  if (important.length === 0) {
    return syntheticImportantFlows(analysis, {
      frontend,
      backend,
      database,
      auth: authentication
    });
  }

  return important.map(({ name, flow }) => ({
    name,
    route: flowRouteLabel(flow),
    mermaid: flowToSequenceMermaid(name, flow, { frontend, backend })
  }));
}

/**
 * Join all sequence diagrams into one Mermaid-only string
 * (diagrams separated by a blank line).
 */
export function generateSequenceDiagramsMermaid(
  analysis: RepositoryAnalysis,
  options: GenerateSequenceDiagramsOptions = {}
): string {
  return generateSequenceDiagrams(analysis, options)
    .map((d) => d.mermaid)
    .join('\n\n');
}
