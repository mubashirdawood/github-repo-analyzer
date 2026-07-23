import Repo from '../models/Repo.js';
import Question from '../models/Question.js';
import FileCache from '../models/FileCache.js';
import RepositoryAnalysis from '../models/RepositoryAnalysis.js';
import { AppError } from '../errors/AppError.js';
import { getRepoContents, getFileContent, getRepoHeadSha } from '../services/githubService.js';
import { findRelevantFiles } from '../services/retrievalService.js';
import {
  askQuestion,
  generateArchitectureExplanation,
  buildFallbackSummary,
  buildLocalArchitectureDiagram
} from '../services/llmService.js';
import {
  findAnalysisBySha,
  saveRepositoryAnalysis,
  toArchitectureResponse
} from '../services/analysisCacheService.js';
import {
  invalidateRequestFlowCacheByRepo
} from '../services/requestFlowCacheService.js';
import {
  createRequestFlows,
  deleteRequestFlowsCache
} from './requestFlowController.js';

/**
 * Controller to handle GET /api/repos
 * Returns the authenticated user's repos (summary fields only).
 */
export async function listUserRepos(req, res) {
  const repos = await Repo.find({ userId: req.userId })
    .select('githubUrl owner repoName status createdAt truncated commitSha')
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json({ repos });
}

/**
 * Controller to handle GET /api/repos/:id
 * Returns a single owned repo including fileTree for the detail workspace.
 */
export async function getRepoById(req, res) {
  const { id } = req.params;

  const repo = await Repo.findOne({ _id: id, userId: req.userId })
    .select(
      'githubUrl owner repoName status createdAt fileTree architectureSummary diagramSyntax truncated commitSha'
    );

  if (!repo) {
    throw new AppError('Repository not found', 404);
  }

  return res.status(200).json({
    repoId: repo._id,
    githubUrl: repo.githubUrl,
    owner: repo.owner,
    repoName: repo.repoName,
    status: repo.status,
    createdAt: repo.createdAt,
    fileTree: repo.fileTree || [],
    truncated: Boolean(repo.truncated),
    commitSha: repo.commitSha || null
  });
}

/**
 * Controller to handle POST /api/repos/analyze
 * Parses public GitHub URL, fetches the filtered file tree,
 * saves a new Repo record, and returns the workspace payload.
 */
export async function analyzeRepo(req, res) {
  const { githubUrl } = req.body;

  if (!githubUrl) {
    throw new AppError('githubUrl is required', 400);
  }

  console.log(`Starting analysis for URL: ${githubUrl}`);

  const { owner, repoName, fileTree, truncated, commitSha } = await getRepoContents(githubUrl);

  // If this commit was already analyzed, attach cached artifacts to the new Repo row
  const cached = commitSha
    ? await findAnalysisBySha(owner, repoName, commitSha)
    : null;

  const repo = new Repo({
    userId: req.userId,
    githubUrl,
    owner,
    repoName,
    fileTree,
    truncated: Boolean(truncated),
    commitSha: commitSha || null,
    status: cached ? 'analyzed' : 'pending',
    architectureSummary: cached?.architectureSummary || null,
    diagramSyntax: cached?.architectureDiagram || null,
    requestFlowDiagram: cached?.requestFlowDiagram || null
  });

  await repo.save();

  // Keep cache linked to this repo document when reusing
  if (cached && commitSha) {
    await saveRepositoryAnalysis({
      repoId: repo._id,
      owner,
      repoName,
      commitSha,
      architectureSummary: cached.architectureSummary,
      architectureDiagram: cached.architectureDiagram,
      requestFlowDiagram: cached.requestFlowDiagram,
      repositoryGraph: cached.repositoryGraph
    });
  }

  return res.status(201).json({
    repoId: repo._id,
    fileTree: repo.fileTree,
    truncated: repo.truncated,
    commitSha: repo.commitSha,
    analysisCached: Boolean(cached)
  });
}

/**
 * DELETE /api/repos/:id
 * Removes the repo and all related data owned by the current user:
 * Questions, FileCache, RepositoryAnalysis (by repoId), and the Repo itself.
 */
export async function deleteRepo(req, res) {
  const { id } = req.params;

  const repo = await Repo.findOne({ _id: id, userId: req.userId });
  if (!repo) {
    throw new AppError('Repository not found', 404);
  }

  const repoId = repo._id;
  const owner = repo.owner;
  const repoName = repo.repoName;
  const commitSha = repo.commitSha;

  const [questionsResult, fileCacheResult, analysisByRepoId, requestFlowsByRepo] =
    await Promise.all([
      Question.deleteMany({ repoId }),
      FileCache.deleteMany({ repoId }),
      RepositoryAnalysis.deleteMany({ repoId }),
      invalidateRequestFlowCacheByRepo(repoId)
    ]);

  // Also clear SHA-keyed analysis for this GitHub repo when it belonged to this record
  let analysisBySha = { deletedCount: 0 };
  if (owner && repoName && commitSha) {
    analysisBySha = await RepositoryAnalysis.deleteMany({
      owner,
      repoName,
      commitSha
    });
  }

  await Repo.deleteOne({ _id: repoId, userId: req.userId });

  console.log(
    `[repo deleted] ${owner}/${repoName} id=${repoId} ` +
      `questions=${questionsResult.deletedCount} ` +
      `files=${fileCacheResult.deletedCount} ` +
      `analysis=${analysisByRepoId.deletedCount + analysisBySha.deletedCount} ` +
      `requestFlows=${requestFlowsByRepo.deletedCount}`
  );

  return res.status(200).json({
    ok: true,
    deleted: {
      repoId: String(repoId),
      questions: questionsResult.deletedCount,
      fileCache: fileCacheResult.deletedCount,
      repositoryAnalysis: analysisByRepoId.deletedCount + analysisBySha.deletedCount,
      requestFlowAnalysis: requestFlowsByRepo.deletedCount
    }
  });
}

/**
 * Controller to handle POST /api/repos/:id/ask
 */
export async function askRepoQuestion(req, res) {
  const { id } = req.params;
  const { question, mode } = req.body;

  if (!question) {
    throw new AppError('question is required', 400);
  }

  const repo = await Repo.findOne({ _id: id, userId: req.userId });
  if (!repo) {
    throw new AppError('Repository not found', 404);
  }

  const matchingPaths = findRelevantFiles(repo.fileTree, question, 6, {
    prioritizeFilenames: mode === 'explain'
  });

  const files = [];
  const filesUsed = [];

  for (const path of matchingPaths) {
    const content = await getFileContent(repo.owner, repo.repoName, path, repo._id);
    if (content !== null) {
      files.push({ path, content });
      filesUsed.push(path);
    }
  }

  const answer = await askQuestion(question, files, {
    mode: mode === 'explain' ? 'explain' : 'ask'
  });

  const questionDoc = new Question({
    repoId: repo._id,
    question,
    answer,
    filesUsed
  });
  await questionDoc.save();

  return res.status(200).json({
    answer,
    filesUsed
  });
}

/**
 * Controller to handle POST /api/repos/:id/architecture
 *
 * Cache rules:
 * - Resolve current GitHub HEAD SHA
 * - If repository_analysis exists for that SHA → serve cache (do NOT regenerate diagrams)
 * - Otherwise generate once, persist to repository_analysis, return fresh results
 */
export async function getArchitectureSummary(req, res) {
  const { id } = req.params;

  const repo = await Repo.findOne({ _id: id, userId: req.userId });
  if (!repo) {
    throw new AppError('Repository not found', 404);
  }

  // Current remote SHA — cache hit only when unchanged
  let commitSha = repo.commitSha || null;
  let shaResolved = false;
  try {
    commitSha = await getRepoHeadSha(repo.owner, repo.repoName);
    shaResolved = true;
  } catch (err) {
    console.warn('HEAD SHA lookup failed, using stored SHA if any:', err.message);
  }

  // Prefer repository_analysis cache for this SHA
  if (commitSha) {
    const cached = await findAnalysisBySha(repo.owner, repo.repoName, commitSha);
    if (cached) {
      console.log(
        `[analysis cache HIT] ${repo.owner}/${repo.repoName}@${commitSha.slice(0, 7)}`
      );

      let dirty = false;
      if (repo.commitSha !== commitSha) {
        repo.commitSha = commitSha;
        dirty = true;
      }
      if (repo.architectureSummary !== cached.architectureSummary) {
        repo.architectureSummary = cached.architectureSummary;
        dirty = true;
      }
      if (repo.diagramSyntax !== cached.architectureDiagram) {
        repo.diagramSyntax = cached.architectureDiagram;
        dirty = true;
      }
      if (repo.requestFlowDiagram !== cached.requestFlowDiagram) {
        repo.requestFlowDiagram = cached.requestFlowDiagram;
        dirty = true;
      }
      if (repo.status !== 'analyzed') {
        repo.status = 'analyzed';
        dirty = true;
      }
      if (dirty) await repo.save();

      return res.status(200).json(toArchitectureResponse(cached, { cached: true }));
    }
  }

  // SHA unchanged (or unverifiable) and Repo already has full artifacts → do not regenerate
  const repoHasArtifacts =
    Boolean(repo.architectureSummary) &&
    Boolean(repo.diagramSyntax) &&
    repo.requestFlowDiagram != null;

  if (
    repoHasArtifacts &&
    (!shaResolved || !commitSha || commitSha === repo.commitSha)
  ) {
    console.log(
      `[analysis cache HIT/repo] ${repo.owner}/${repo.repoName} — serving stored diagrams`
    );
    return res.status(200).json({
      architectureSummary: repo.architectureSummary,
      architectureDiagram: repo.diagramSyntax,
      diagramSyntax: repo.diagramSyntax,
      requestFlowDiagram: repo.requestFlowDiagram || '',
      repositoryGraph: null,
      commitSha: repo.commitSha || commitSha,
      analyzedAt: null,
      cached: true
    });
  }

  console.log(
    `[analysis cache MISS] ${repo.owner}/${repo.repoName}@${commitSha ? commitSha.slice(0, 7) : 'unknown'} — generating`
  );

  let architectureSummary = null;
  let architectureDiagram = null;
  let requestFlowDiagram = '';
  let repositoryGraph = null;

  try {
    const explanation = await generateArchitectureExplanation(repo, repo.fileTree);
    architectureSummary = explanation.architectureSummary;
    architectureDiagram = explanation.architectureDiagram;
    requestFlowDiagram = explanation.requestFlowDiagram || '';
    repositoryGraph = explanation.repositoryGraph || null;
  } catch (err) {
    console.error('Architecture explanation failed:', err.message);
    architectureSummary = buildFallbackSummary(repo, repo.fileTree);
    architectureDiagram = buildLocalArchitectureDiagram(repo, repo.fileTree);
    requestFlowDiagram = '';
    repositoryGraph = null;
  }

  // Persist to repository_analysis when we have a SHA (skip incomplete SHA-less writes as unique key)
  let saved = null;
  if (commitSha) {
    saved = await saveRepositoryAnalysis({
      repoId: repo._id,
      owner: repo.owner,
      repoName: repo.repoName,
      commitSha,
      architectureSummary,
      architectureDiagram,
      requestFlowDiagram,
      repositoryGraph
    });
  }

  repo.commitSha = commitSha || repo.commitSha;
  repo.architectureSummary = architectureSummary;
  repo.diagramSyntax = architectureDiagram;
  repo.requestFlowDiagram = requestFlowDiagram;
  repo.status = 'analyzed';
  await repo.save();

  return res.status(200).json(
    toArchitectureResponse(
      saved || {
        architectureSummary,
        architectureDiagram,
        requestFlowDiagram,
        repositoryGraph,
        commitSha,
        analyzedAt: new Date()
      },
      { cached: false }
    )
  );
}

/**
 * POST /api/repos/:id/request-flows (legacy alias)
 * Prefer POST /api/repositories/:id/request-flows
 */
export async function getRequestFlows(req, res) {
  return createRequestFlows(req, res);
}

/**
 * DELETE /api/repos/:id/request-flows (legacy alias)
 */
export async function invalidateRequestFlows(req, res) {
  return deleteRequestFlowsCache(req, res);
}
