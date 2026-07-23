/**
 * Service Analyzer
 * ================
 * Locate a service function and return structured metadata about its
 * database, model, API, upload, email, payment, queue, and cache usage.
 *
 * AST-first. No LLM. No prose summaries.
 */

import { resolveController } from '../controller/resolveController.js';
import { extractControllerCalls } from '../controller/extractCalls.js';
import { classifyServiceCalls } from './classifyCalls.js';
import type { AnalyzeServiceOptions, ServiceAnalysis } from './types.js';

function emptyAnalysis(service: string): ServiceAnalysis {
  return {
    service,
    calls: [],
    database: [],
    models: [],
    externalApis: [],
    fileUploads: [],
    email: [],
    payments: [],
    queues: [],
    cache: []
  };
}

/**
 * Analyze a single service function.
 *
 * Example input:  "userService.createUser"
 * Example output metadata buckets: database, models, externalApis, …
 */
export function analyzeService(options: AnalyzeServiceOptions): ServiceAnalysis {
  const reference = (options.service || '').trim();
  const shortName = reference.includes('.')
    ? reference.split('.').pop()!
    : reference || 'unknown';

  if (!reference) return emptyAnalysis('unknown');

  const resolved = resolveController({
    controller: reference,
    files: options.files,
    fileContents: options.fileContents,
    hintFile: options.hintFile,
    importMap: options.importMap,
    prefer: 'service'
  });

  if (!resolved) {
    return emptyAnalysis(shortName);
  }

  const { calls, parser } = extractControllerCalls(
    resolved.source,
    resolved.file,
    resolved.body,
    resolved.bodyStart,
    resolved.bodyEnd
  );

  const classified = classifyServiceCalls(calls);

  return {
    service: resolved.name,
    sourceFile: resolved.file,
    parser,
    calls,
    database: classified.database,
    models: classified.models,
    externalApis: classified.externalApis,
    fileUploads: classified.fileUploads,
    email: classified.email,
    payments: classified.payments,
    queues: classified.queues,
    cache: classified.cache
  };
}

/**
 * Analyze many service references (deduped).
 */
export function analyzeServices(
  services: string[],
  options: Omit<AnalyzeServiceOptions, 'service'>
): ServiceAnalysis[] {
  const seen = new Set<string>();
  const results: ServiceAnalysis[] = [];

  for (const ref of services) {
    const key = ref.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    results.push(analyzeService({ ...options, service: key }));
  }

  return results;
}
