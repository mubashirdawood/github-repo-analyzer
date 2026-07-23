import RequestFlowAnalysis from '../models/RequestFlowAnalysis.js';
import { ensureValidRequestFlowMermaid } from './intelligence/flows/generate/validateMermaidFlowchart.js';

/**
 * Normalize a request-flow document payload for API responses.
 */
export function toRequestFlowPayload(doc, { cached = true } = {}) {
  const stats = doc?.stats && typeof doc.stats === 'object' ? doc.stats : {};
  const mermaid = ensureValidRequestFlowMermaid(doc?.mermaid || '', {
    frontend: stats.framework || null,
    backend: null,
    database: stats.database || null
  });

  return {
    repositoryId: doc.repositoryId,
    branch: doc.branch,
    commitSha: doc.commitSha,
    mermaid,
    stats,
    summary: doc.summary || stats.summary || '',
    layers: Array.isArray(doc.layers) ? doc.layers : stats.layers || [],
    technologies: Array.isArray(doc.technologies)
      ? doc.technologies
      : stats.technologies || [],
    entryPoints: Array.isArray(doc.entryPoints)
      ? doc.entryPoints
      : stats.entryPoints || [],
    complexity: doc.complexity || stats.complexity || 'medium',
    complexityScore:
      typeof doc.complexityScore === 'number'
        ? doc.complexityScore
        : stats.complexityScore || 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    cached
  };
}

/**
 * Shape for API: { requestFlow, cached, ...meta }
 */
export function toRequestFlowResponse(doc, { cached = true } = {}) {
  const payload = toRequestFlowPayload(doc, { cached });
  return {
    repositoryId: payload.repositoryId,
    branch: payload.branch,
    commitSha: payload.commitSha,
    requestFlow: {
      mermaid: payload.mermaid,
      stats: payload.stats,
      summary: payload.summary,
      layers: payload.layers,
      technologies: payload.technologies,
      entryPoints: payload.entryPoints,
      complexity: payload.complexity,
      complexityScore: payload.complexityScore
    },
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    cached
  };
}

/**
 * Find cached request flows for a repository commit.
 */
export async function findRequestFlowAnalysis({
  repositoryId,
  commitSha,
  branch
}) {
  if (!repositoryId || !commitSha) return null;

  const query = { repositoryId, commitSha };
  if (branch) query.branch = branch;

  const doc = await RequestFlowAnalysis.findOne(query).lean();
  if (!doc || !isCompleteRequestFlowAnalysis(doc)) return null;
  return doc;
}

/**
 * Latest complete cache entry for a repository (any SHA).
 */
export async function findLatestRequestFlowAnalysis(repositoryId) {
  if (!repositoryId) return null;
  const doc = await RequestFlowAnalysis.findOne({ repositoryId })
    .sort({ updatedAt: -1 })
    .lean();
  if (!doc || !isCompleteRequestFlowAnalysis(doc)) return null;
  return doc;
}

/**
 * Upsert comprehensive request-flow analysis.
 */
export async function saveRequestFlowAnalysis({
  repositoryId,
  branch,
  commitSha,
  mermaid,
  stats,
  summary,
  layers,
  technologies,
  entryPoints,
  complexity,
  complexityScore
}) {
  if (!repositoryId || !commitSha) {
    throw new Error('repositoryId and commitSha are required to cache request flows');
  }

  const safeMermaid = ensureValidRequestFlowMermaid(mermaid || '', {
    database: stats?.database || null
  });

  const doc = await RequestFlowAnalysis.findOneAndUpdate(
    { repositoryId, commitSha },
    {
      $set: {
        repositoryId,
        branch: branch || 'main',
        commitSha,
        mermaid: safeMermaid,
        stats: stats || {},
        summary: summary || stats?.summary || '',
        layers: layers || stats?.layers || [],
        technologies: technologies || stats?.technologies || [],
        entryPoints: entryPoints || stats?.entryPoints || [],
        complexity: complexity || stats?.complexity || 'medium',
        complexityScore:
          typeof complexityScore === 'number'
            ? complexityScore
            : stats?.complexityScore || 0,
        generatedFlows: []
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return doc;
}

export function isCompleteRequestFlowAnalysis(doc) {
  if (!doc || !doc.commitSha) return false;
  const mermaid = typeof doc.mermaid === 'string' ? doc.mermaid : '';
  if (!mermaid.includes('flowchart')) return false;
  const stats = doc.stats;
  if (!stats || typeof stats !== 'object') return false;
  if (typeof stats.totalSourceFiles !== 'number') return false;
  return true;
}

export async function invalidateRequestFlowCacheByRepo(repositoryId) {
  if (!repositoryId) return { deletedCount: 0 };
  return RequestFlowAnalysis.deleteMany({ repositoryId });
}

export async function invalidateRequestFlowCacheBySha({
  repositoryId,
  commitSha,
  branch
}) {
  if (!repositoryId || !commitSha) return { deletedCount: 0 };
  const query = { repositoryId, commitSha };
  if (branch) query.branch = branch;
  return RequestFlowAnalysis.deleteMany(query);
}

export async function invalidateStaleRequestFlowCache(repositoryId, currentCommitSha) {
  if (!repositoryId) return { deletedCount: 0 };
  if (!currentCommitSha) {
    return invalidateRequestFlowCacheByRepo(repositoryId);
  }
  return RequestFlowAnalysis.deleteMany({
    repositoryId,
    commitSha: { $ne: currentCommitSha }
  });
}

/** @deprecated Legacy multi-flow repair — no-op compatibility. */
export function repairGeneratedFlows(flows) {
  return Array.isArray(flows) ? flows : [];
}

export function repairFlowMermaid(flow) {
  return flow;
}
