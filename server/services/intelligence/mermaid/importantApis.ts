/**
 * Important API detection for sequence diagram generation.
 */

import type { RequestFlow } from '../flows/types.js';

export interface ImportantApiPattern {
  name: string;
  /** Match against route string + flow labels. */
  patterns: RegExp[];
  /** Preference weight (higher = more important). */
  weight: number;
}

/** Canonical “important” user journeys we always try to cover. */
export const IMPORTANT_API_PATTERNS: ImportantApiPattern[] = [
  {
    name: 'Login',
    patterns: [/login/i, /sign[-_]?in/i, /auth\/session/i],
    weight: 100
  },
  {
    name: 'Registration',
    patterns: [/register/i, /sign[-_]?up/i, /create[-_]?account/i],
    weight: 95
  },
  {
    name: 'Create Post',
    patterns: [/posts?$/i, /create[-_]?post/i, /\/posts?\b/i],
    weight: 80
  },
  {
    name: 'Payment',
    patterns: [/pay(ment)?/i, /checkout/i, /stripe/i, /billing/i, /order/i],
    weight: 90
  },
  {
    name: 'Chat',
    patterns: [/chat/i, /message/i, /conversation/i, /socket/i, /dm\b/i],
    weight: 75
  },
  {
    name: 'Profile Update',
    patterns: [/profile/i, /\/me\b/i, /account/i, /update[-_]?user/i, /settings/i],
    weight: 70
  }
];

export interface RankedFlow {
  name: string;
  flow: RequestFlow;
  score: number;
}

function routeKey(flow: RequestFlow): string {
  return `${flow.method} ${flow.endpoint}`;
}

function routeBlob(flow: RequestFlow): string {
  const stepNames = flow.steps.map((s) => s.name).join(' ');
  const files = flow.steps.map((s) => s.file).filter(Boolean).join(' ');
  return `${routeKey(flow)} ${flow.title} ${flow.description} ${stepNames} ${files}`;
}

/**
 * Score how well a detected route matches an important API pattern.
 */
export function scoreImportantApi(flow: RequestFlow, pattern: ImportantApiPattern): number {
  const blob = routeBlob(flow);
  if (!pattern.patterns.some((re) => re.test(blob))) return 0;

  let score = pattern.weight;
  if (flow.method === 'POST') score += 15;
  if (flow.method === 'PUT' || flow.method === 'PATCH') score += 10;
  if (flow.steps.length >= 4) score += 5;
  // Prefer richer chains (more than route + response)
  if (flow.steps.some((s) => s.type === 'service' || s.type === 'controller')) score += 10;
  if (flow.steps.some((s) => s.type === 'authentication')) score += 5;
  return score;
}

/**
 * Pick one best RequestFlow per important API name (Login, Registration, …).
 */
export function selectImportantFlows(
  flows: RequestFlow[],
  maxDiagrams = 8
): RankedFlow[] {
  const bestByName = new Map<string, RankedFlow>();

  for (const pattern of IMPORTANT_API_PATTERNS) {
    for (const flow of flows) {
      if (flow.endpoint === '*') continue;
      const score = scoreImportantApi(flow, pattern);
      if (score <= 0) continue;
      const prev = bestByName.get(pattern.name);
      if (!prev || score > prev.score) {
        bestByName.set(pattern.name, { name: pattern.name, flow, score });
      }
    }
  }

  // Also include mutating routes not already covered
  for (const flow of flows) {
    if (!['POST', 'PUT', 'PATCH'].includes(flow.method)) continue;
    if (flow.endpoint === '*') continue;
    if (flow.steps.length <= 2) continue;
    const already = [...bestByName.values()].some(
      (r) => routeKey(r.flow) === routeKey(flow)
    );
    if (already) continue;

    const name = flow.title || deriveNameFromEndpoint(flow.endpoint);
    if (bestByName.has(name)) continue;
    bestByName.set(name, {
      name,
      flow,
      score: 40 + (flow.steps.length >= 4 ? 10 : 0)
    });
  }

  return [...bestByName.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxDiagrams);
}

function deriveNameFromEndpoint(endpoint: string): string {
  const parts = endpoint.split('/').filter((p) => p && !p.startsWith(':'));
  const last = parts[parts.length - 1] || 'Request';
  return last
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
