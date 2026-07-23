/**
 * Request Flow analysis — one comprehensive flowchart + repository statistics.
 *
 * Progress stages:
 * scanning_routes → detecting_modules → building_diagram → summarizing → caching
 */

import { getFileContent, getRepoHeadSha } from './githubService.js';
import {
  analyzeRepository,
  selectManifestsToFetch,
  scanExpressRoutes,
  buildArchitectureContext,
  generateComprehensiveRequestFlow,
  buildRepoStatistics,
  ensureValidRequestFlowMermaid
} from './intelligence/index.js';
import {
  findRequestFlowAnalysis,
  saveRequestFlowAnalysis,
  invalidateStaleRequestFlowCache,
  invalidateRequestFlowCacheByRepo,
  toRequestFlowResponse,
  isCompleteRequestFlowAnalysis
} from './requestFlowCacheService.js';

const MAX_MANIFEST_FETCH = 6;
const MAX_SOURCE_FETCH = 30;

export const REQUEST_FLOW_STAGES = [
  { id: 'scanning_routes', label: 'Scanning routes...', weight: 20 },
  { id: 'detecting_modules', label: 'Detecting modules...', weight: 25 },
  { id: 'building_diagram', label: 'Building request flow diagram...', weight: 30 },
  { id: 'summarizing', label: 'Writing analysis summary...', weight: 15 },
  { id: 'caching', label: 'Caching results...', weight: 10 }
];

function emptyStats() {
  return {
    routes: 0,
    controllers: 0,
    services: 0,
    middleware: 0,
    components: 0,
    pages: 0,
    models: 0,
    files: 0
  };
}

function stageProgress(stageId, fractionWithinStage = 1) {
  const idx = REQUEST_FLOW_STAGES.findIndex((s) => s.id === stageId);
  if (idx < 0) return 0;
  const totalWeight = REQUEST_FLOW_STAGES.reduce((sum, s) => sum + s.weight, 0);
  const before = REQUEST_FLOW_STAGES.slice(0, idx).reduce((sum, s) => sum + s.weight, 0);
  const current = REQUEST_FLOW_STAGES[idx].weight * Math.min(1, Math.max(0, fractionWithinStage));
  return Math.round(((before + current) / totalWeight) * 100);
}

function emit(onProgress, payload) {
  if (typeof onProgress !== 'function') return;
  try {
    onProgress(payload);
  } catch (err) {
    console.warn('[request-flows] onProgress error:', err?.message || err);
  }
}

async function loadFlowFileContents(repo, fileTree) {
  const analysisProbe = analyzeRepository({ fileTree: fileTree || [] });
  const manifests = selectManifestsToFetch(analysisProbe.files, MAX_MANIFEST_FETCH);
  const structural = analysisProbe.files.filter(
    (p) =>
      /(^|\/)(routes?|controllers?|services?|models?|middleware)\//i.test(p) ||
      /(server|app|index|main)\.(js|ts|mjs|cjs)$/i.test(p) ||
      /(?:^|\/)app\/api\//i.test(p) ||
      /(?:^|\/)pages\/api\//i.test(p)
  );
  const toFetch = [...new Set([...manifests, ...structural])].slice(
    0,
    MAX_MANIFEST_FETCH + MAX_SOURCE_FETCH
  );

  const fileContents = {};
  await Promise.all(
    toFetch.map(async (path) => {
      try {
        const content = await getFileContent(repo.owner, repo.repoName, path, repo._id);
        if (content != null) fileContents[path] = content;
      } catch (err) {
        console.warn(`[request-flows] fetch skipped ${path}:`, err.message);
      }
    })
  );
  return { fileContents, files: analysisProbe.files };
}

/**
 * Generate one comprehensive request-flow diagram + stats.
 */
export async function generateRequestFlowsFresh(repo, options = {}) {
  const branch = options.branch || 'main';
  const commitSha = options.commitSha;
  const onProgress = options.onProgress;
  let progressStats = emptyStats();

  const report = (stageId, label, extra = {}) => {
    const progress = stageProgress(stageId, extra.fraction ?? 1);
    emit(onProgress, {
      type: 'progress',
      stage: stageId,
      label,
      progress,
      status: extra.status || 'running',
      stats: { ...progressStats, ...(extra.stats || {}) },
      detail: extra.detail || null,
      elapsedMs: extra.elapsedMs ?? null
    });
  };

  // ── 1. Scanning routes ──────────────────────────────────────────
  report('scanning_routes', 'Scanning routes...', { fraction: 0.2, status: 'running' });
  const fileTree = repo.fileTree || [];
  const { fileContents, files } = await loadFlowFileContents(repo, fileTree);

  report('scanning_routes', 'Scanning routes...', { fraction: 0.6, status: 'running' });
  const routes = scanExpressRoutes({
    files,
    fileContents,
    maxRoutes: 200
  });

  progressStats = {
    ...progressStats,
    routes: routes.length
  };
  report('scanning_routes', 'Scanning routes...', {
    fraction: 1,
    status: 'done',
    detail: `${routes.length} route${routes.length === 1 ? '' : 's'} found`
  });

  // ── 2. Detecting modules ────────────────────────────────────────
  report('detecting_modules', 'Detecting modules...', {
    fraction: 0.3,
    status: 'running'
  });

  const analysis = analyzeRepository({
    fileTree,
    fileContents,
    owner: repo.owner,
    repoName: repo.repoName
  });
  const context = buildArchitectureContext(analysis, { maxLabels: 10 });

  progressStats = {
    routes: routes.length,
    controllers: analysis.structure.controllers.length,
    services: analysis.structure.services.length,
    middleware: analysis.structure.middleware.length,
    components: analysis.structure.components.length,
    pages: analysis.structure.pages.length,
    models: analysis.structure.models.length,
    files: analysis.filteredFileCount || analysis.files.length
  };

  report('detecting_modules', 'Detecting modules...', {
    fraction: 1,
    status: 'done',
    detail: `${analysis.projectType} · ${progressStats.files} source files`
  });

  // ── 3. Building diagram ─────────────────────────────────────────
  report('building_diagram', 'Building request flow diagram...', {
    fraction: 0.4,
    status: 'running',
    detail: 'Composing lifecycle flowchart'
  });

  const rawMermaid = generateComprehensiveRequestFlow(analysis, {
    context,
    routeCount: routes.length,
    maxNodes: 40
  });

  const mermaid = ensureValidRequestFlowMermaid(rawMermaid, {
    frontend: context.frontend?.framework || analysis.technologies.frontend,
    backend: context.backend?.framework || analysis.technologies.backend,
    database: context.database || analysis.technologies.database
  });

  report('building_diagram', 'Building request flow diagram...', {
    fraction: 1,
    status: 'done',
    detail: 'Validated Mermaid flowchart ready'
  });

  // ── 4. Summarizing / statistics ─────────────────────────────────
  report('summarizing', 'Writing analysis summary...', {
    fraction: 0.4,
    status: 'running'
  });

  const routeLabels = routes
    .slice(0, 8)
    .map((r) => `${String(r.method || 'GET').toUpperCase()} ${r.path || r.endpoint || ''}`.trim())
    .filter(Boolean);

  const stats = buildRepoStatistics(analysis, {
    context,
    routeCount: routes.length,
    routeLabels
  });

  report('summarizing', 'Writing analysis summary...', {
    fraction: 1,
    status: 'done',
    detail: `Complexity ${stats.complexity} · ${stats.architectureLayers} layers`,
    stats: progressStats
  });

  return {
    repositoryId: repo._id,
    branch,
    commitSha: commitSha || repo.commitSha || null,
    mermaid,
    stats,
    summary: stats.summary,
    layers: stats.layers,
    technologies: stats.technologies,
    entryPoints: stats.entryPoints,
    complexity: stats.complexity,
    complexityScore: stats.complexityScore,
    progressStats
  };
}

/**
 * Get comprehensive request flow — cache hit by commitSha skips regeneration.
 */
export async function getOrGenerateRequestFlows(repo, options = {}) {
  const force = Boolean(options.force);
  const onProgress = options.onProgress;
  const startedAt = Date.now();
  let branch = options.branch || repo.defaultBranch || 'main';
  let commitSha = repo.commitSha || null;

  const withElapsed = (payload) =>
    emit(onProgress, {
      ...payload,
      elapsedMs: Date.now() - startedAt
    });

  try {
    commitSha = await getRepoHeadSha(repo.owner, repo.repoName, branch);
  } catch (err) {
    console.warn(
      '[request-flows] HEAD SHA lookup failed, using stored SHA:',
      err.message
    );
  }

  if (commitSha) {
    await invalidateStaleRequestFlowCache(repo._id, commitSha);
  }

  if (!force && commitSha) {
    const cached = await findRequestFlowAnalysis({
      repositoryId: repo._id,
      commitSha,
      branch
    });
    if (cached) {
      console.log(
        `[request-flow cache HIT] repo=${repo._id} ${branch}@${commitSha.slice(0, 7)}`
      );
      const result = toRequestFlowResponse(cached, { cached: true });
      withElapsed({
        type: 'progress',
        stage: 'caching',
        label: 'Caching results...',
        progress: 100,
        status: 'done',
        cached: true,
        stats: {
          routes: cached.stats?.apiRoutes || 0,
          controllers: cached.stats?.controllers || 0,
          services: cached.stats?.services || 0,
          middleware: cached.stats?.middleware || 0,
          files: cached.stats?.totalSourceFiles || 0
        },
        detail: 'Served from cache'
      });
      withElapsed({
        type: 'complete',
        cached: true,
        requestFlow: result.requestFlow,
        result
      });
      return result;
    }
  }

  if (force) {
    await invalidateRequestFlowCacheByRepo(repo._id);
  }

  console.log(
    `[request-flow cache MISS] repo=${repo._id} ${branch}@${commitSha ? commitSha.slice(0, 7) : 'unknown'} — generating`
  );

  const wrappedProgress = (payload) => {
    withElapsed(payload);
  };

  const fresh = await generateRequestFlowsFresh(repo, {
    branch,
    commitSha,
    onProgress: wrappedProgress
  });

  wrappedProgress({
    type: 'progress',
    stage: 'caching',
    label: 'Caching results...',
    progress: stageProgress('caching', 0.4),
    status: 'running',
    stats: fresh.progressStats,
    detail: 'Writing analysis to MongoDB'
  });

  let result;
  if (!commitSha) {
    result = {
      repositoryId: repo._id,
      branch,
      commitSha,
      requestFlow: {
        mermaid: fresh.mermaid,
        stats: fresh.stats,
        summary: fresh.summary,
        layers: fresh.layers,
        technologies: fresh.technologies,
        entryPoints: fresh.entryPoints,
        complexity: fresh.complexity,
        complexityScore: fresh.complexityScore
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      cached: false
    };
  } else {
    const saved = await saveRequestFlowAnalysis({
      repositoryId: repo._id,
      branch,
      commitSha,
      mermaid: fresh.mermaid,
      stats: fresh.stats,
      summary: fresh.summary,
      layers: fresh.layers,
      technologies: fresh.technologies,
      entryPoints: fresh.entryPoints,
      complexity: fresh.complexity,
      complexityScore: fresh.complexityScore
    });

    if (repo.commitSha !== commitSha) {
      repo.commitSha = commitSha;
      await repo.save();
    }

    result = toRequestFlowResponse(saved, { cached: false });
  }

  wrappedProgress({
    type: 'progress',
    stage: 'caching',
    label: 'Caching results...',
    progress: 100,
    status: 'done',
    stats: fresh.progressStats,
    detail: 'Analysis complete'
  });

  wrappedProgress({
    type: 'complete',
    cached: false,
    requestFlow: result.requestFlow,
    stats: fresh.progressStats,
    result
  });

  return result;
}

export { isCompleteRequestFlowAnalysis };
