import Repo from '../models/Repo.js';
import { AppError } from '../errors/AppError.js';
import {
  findLatestRequestFlowAnalysis,
  findRequestFlowAnalysis,
  invalidateRequestFlowCacheByRepo,
  toRequestFlowResponse
} from '../services/requestFlowCacheService.js';
import {
  getOrGenerateRequestFlows,
  REQUEST_FLOW_STAGES
} from '../services/requestFlowService.js';
import { getRepoHeadSha } from '../services/githubService.js';

/**
 * Load a repository owned by the authenticated user.
 */
async function loadOwnedRepository(req) {
  const { id } = req.params;
  if (!id) {
    throw new AppError('Repository id is required', 400);
  }

  const repo = await Repo.findOne({ _id: id, userId: req.userId });
  if (!repo) {
    throw new AppError('Repository not found', 404);
  }
  return repo;
}

function toSuccessPayload(result, { cached }) {
  const requestFlow =
    result?.requestFlow ||
    (result?.mermaid
      ? {
          mermaid: result.mermaid,
          stats: result.stats || {},
          summary: result.summary || '',
          layers: result.layers || [],
          technologies: result.technologies || [],
          entryPoints: result.entryPoints || [],
          complexity: result.complexity || 'medium',
          complexityScore: result.complexityScore || 0
        }
      : null);

  return {
    success: true,
    requestFlow,
    cached: Boolean(cached),
    repositoryId: result?.repositoryId ?? null,
    branch: result?.branch ?? null,
    commitSha: result?.commitSha ?? null,
    createdAt: result?.createdAt ?? null,
    updatedAt: result?.updatedAt ?? null
  };
}

function wantsEventStream(req) {
  const accept = String(req.headers.accept || '');
  return (
    accept.includes('text/event-stream') ||
    req.query?.stream === '1' ||
    req.query?.stream === 'true' ||
    req.body?.stream === true
  );
}

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * GET /api/repositories/:id/request-flows
 * Returns cached comprehensive request flow only (no regeneration).
 */
export async function getCachedRequestFlows(req, res) {
  const repo = await loadOwnedRepository(req);
  const branch = req.query?.branch || undefined;

  let commitSha = repo.commitSha || null;
  try {
    commitSha = await getRepoHeadSha(repo.owner, repo.repoName, branch);
  } catch {
    // fall back to stored SHA / latest cache
  }

  let cached = null;
  if (commitSha) {
    cached = await findRequestFlowAnalysis({
      repositoryId: repo._id,
      commitSha,
      branch
    });
  }

  if (!cached) {
    cached = await findLatestRequestFlowAnalysis(repo._id);
  }

  if (!cached) {
    return res.status(200).json({
      success: true,
      requestFlow: null,
      cached: false,
      repositoryId: repo._id,
      branch: branch || null,
      commitSha,
      createdAt: null,
      updatedAt: null
    });
  }

  return res.status(200).json(
    toSuccessPayload(toRequestFlowResponse(cached, { cached: true }), {
      cached: true
    })
  );
}

/**
 * POST /api/repositories/:id/request-flows
 * Generate (or serve cache). Supports SSE when Accept: text/event-stream.
 */
export async function createRequestFlows(req, res) {
  const repo = await loadOwnedRepository(req);

  const force =
    req.body?.force === true ||
    req.query?.force === '1' ||
    req.query?.force === 'true';
  const branch = req.body?.branch || req.query?.branch || undefined;

  if (!wantsEventStream(req)) {
    const result = await getOrGenerateRequestFlows(repo, { force, branch });
    return res.status(200).json(
      toSuccessPayload(result, { cached: Boolean(result.cached) })
    );
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  writeSse(res, 'meta', {
    type: 'meta',
    stages: REQUEST_FLOW_STAGES,
    repositoryId: repo._id,
    startedAt: Date.now()
  });

  let clientGone = false;
  req.on('close', () => {
    clientGone = true;
  });

  let finalResult = null;

  try {
    finalResult = await getOrGenerateRequestFlows(repo, {
      force,
      branch,
      onProgress: (payload) => {
        if (clientGone) return;
        if (payload?.type === 'complete') {
          writeSse(res, 'complete', {
            ...toSuccessPayload(payload.result || finalResult, {
              cached: Boolean(payload.cached)
            }),
            stats: payload.stats || null,
            elapsedMs: payload.elapsedMs ?? null
          });
          return;
        }
        writeSse(res, 'progress', payload);
      }
    });
  } catch (err) {
    if (!clientGone) {
      writeSse(res, 'error', {
        type: 'error',
        error: err?.message || 'Request flow generation failed'
      });
    }
  } finally {
    if (!clientGone) res.end();
  }
}

/**
 * DELETE /api/repositories/:id/request-flows
 */
export async function deleteRequestFlowsCache(req, res) {
  const repo = await loadOwnedRepository(req);
  const deleted = await invalidateRequestFlowCacheByRepo(repo._id);

  return res.status(200).json({
    success: true,
    invalidated: deleted.deletedCount
  });
}
