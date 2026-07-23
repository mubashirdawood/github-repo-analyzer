/**
 * Score and rank request routes by product importance.
 * Ignores debug / test / internal. Returns top N (default 10).
 */

import type {
  FlowImportanceCategory,
  ImportancePattern,
  RankableRoute,
  RankedRouteResult
} from './types.js';
import {
  DEFAULT_TOP_FLOWS,
  FLOW_IGNORE_PATTERNS,
  FLOW_IMPORTANCE_PATTERNS
} from './types.js';

function routeBlob(route: RankableRoute): string {
  return [
    route.method,
    route.endpoint,
    route.sourceFile ?? '',
    route.blob ?? ''
  ].join(' ');
}

/**
 * True when a route should be excluded from analysis.
 */
export function shouldIgnoreRoute(route: RankableRoute): boolean {
  const blob = routeBlob(route);
  return FLOW_IGNORE_PATTERNS.some((re) => re.test(blob));
}

/**
 * Best matching importance category for a route (or Other).
 */
export function categorizeRouteImportance(
  route: RankableRoute,
  patterns: ImportancePattern[] = FLOW_IMPORTANCE_PATTERNS
): { category: FlowImportanceCategory; weight: number } {
  const blob = routeBlob(route);

  // Authentication before Registration when both could match (e.g. /auth/register
  // is still Registration because Registration patterns are checked — order matters.
  // Registration is listed after Authentication; /register won't match auth patterns first.
  for (const pattern of patterns) {
    if (pattern.patterns.some((re) => re.test(blob))) {
      return { category: pattern.category, weight: pattern.weight };
    }
  }

  return { category: 'Other', weight: 20 };
}

/**
 * Compute an importance score for one route.
 */
export function scoreRouteImportance(route: RankableRoute): {
  category: FlowImportanceCategory;
  score: number;
} {
  if (shouldIgnoreRoute(route)) {
    return { category: 'Other', score: -1 };
  }

  const { category, weight } = categorizeRouteImportance(route);
  let score = weight;
  const method = (route.method || '').toUpperCase();
  const endpoint = route.endpoint || '';

  // Method signals
  if (method === 'POST') score += 12;
  else if (method === 'PUT' || method === 'PATCH') score += 8;
  else if (method === 'DELETE') score += 6;
  else if (method === 'GET') score += 2;

  // Category-specific method boosts
  if (category === 'Authentication' || category === 'Registration' || category === 'Payment') {
    if (method === 'POST') score += 10;
  }
  if (category === 'CRUD') {
    if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
      score += 8;
    }
  }
  if (category === 'File Upload' && method === 'POST') score += 8;
  if (category === 'Health' && method === 'GET') score += 5;

  // Path depth / resource richness
  const segments = endpoint.split('/').filter(Boolean);
  if (segments.length >= 2) score += 3;
  if (segments.some((s) => s.startsWith(':'))) score += 2;

  // Prefer API-prefixed product routes slightly
  if (/\/api\b/i.test(endpoint)) score += 2;

  // Soft-penalize very generic roots
  if (/^\/?(index|root|home)?$/i.test(endpoint)) score -= 5;

  return { category, score };
}

/**
 * Rank routes by importance. Drops ignored routes. Returns top `limit` (default 10).
 *
 * Strategy:
 * 1. Take the best route per priority category (Authentication → Health)
 * 2. Fill remaining slots by raw score
 */
export function rankRoutes<T extends RankableRoute>(
  routes: T[],
  limit: number = DEFAULT_TOP_FLOWS
): RankedRouteResult<T>[] {
  type Row = { category: FlowImportanceCategory; score: number; item: T };

  const scored: Row[] = [];
  for (const item of routes) {
    const { category, score } = scoreRouteImportance(item);
    if (score < 0) continue;
    scored.push({ category, score, item });
  }

  const categoryOrder: FlowImportanceCategory[] = [
    'Authentication',
    'Registration',
    'Payment',
    'CRUD',
    'File Upload',
    'Chat',
    'Admin',
    'Search',
    'Health',
    'Other'
  ];

  const categoryRank = Object.fromEntries(
    categoryOrder.map((c, i) => [c, i])
  ) as Record<FlowImportanceCategory, number>;

  const byKey = (a: Row, b: Row) => {
    if (b.score !== a.score) return b.score - a.score;
    const cat = categoryRank[a.category] - categoryRank[b.category];
    if (cat !== 0) return cat;
    return `${a.item.method} ${a.item.endpoint}`.localeCompare(
      `${b.item.method} ${b.item.endpoint}`
    );
  };

  scored.sort(byKey);

  const picked: Row[] = [];
  const seenKeys = new Set<string>();
  const keyOf = (r: Row) => `${r.item.method.toUpperCase()} ${r.item.endpoint}`;

  const tryPick = (row: Row) => {
    const key = keyOf(row);
    if (seenKeys.has(key)) return;
    if (picked.length >= limit) return;
    seenKeys.add(key);
    picked.push(row);
  };

  // Pass 1: best per priority category (ensures Chat/Admin/Search can surface)
  for (const category of categoryOrder) {
    if (category === 'Other') continue;
    const best = scored.find((r) => r.category === category);
    if (best) tryPick(best);
  }

  // Pass 2: fill by score
  for (const row of scored) {
    tryPick(row);
    if (picked.length >= limit) break;
  }

  return picked.map((row, i) => ({
    rank: i + 1,
    category: row.category,
    score: row.score,
    item: row.item
  }));
}

/**
 * Convenience: return only the ranked items (routes/graphs), top N.
 */
export function selectTopRoutes<T extends RankableRoute>(
  routes: T[],
  limit: number = DEFAULT_TOP_FLOWS
): T[] {
  return rankRoutes(routes, limit).map((r) => r.item);
}
