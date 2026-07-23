import RepositoryAnalysis from '../models/RepositoryAnalysis.js';

/**
 * Find a cached analysis for this GitHub commit.
 * @returns {Promise<object|null>}
 */
export async function findAnalysisBySha(owner, repoName, commitSha) {
  if (!owner || !repoName || !commitSha) return null;

  const doc = await RepositoryAnalysis.findOne({
    owner,
    repoName,
    commitSha
  }).lean();

  if (!doc) return null;
  if (!isCompleteAnalysis(doc)) return null;
  return doc;
}

/**
 * Find by GitLens repo document id (latest complete analysis).
 */
export async function findAnalysisByRepoId(repoId) {
  if (!repoId) return null;
  const doc = await RepositoryAnalysis.findOne({ repoId })
    .sort({ analyzedAt: -1 })
    .lean();
  if (!doc || !isCompleteAnalysis(doc)) return null;
  return doc;
}

/**
 * Persist architecture artifacts for a commit SHA.
 * Upserts on (owner, repoName, commitSha).
 */
export async function saveRepositoryAnalysis({
  repoId,
  owner,
  repoName,
  commitSha,
  architectureSummary,
  architectureDiagram,
  requestFlowDiagram,
  repositoryGraph
}) {
  const analyzedAt = new Date();

  const doc = await RepositoryAnalysis.findOneAndUpdate(
    { owner, repoName, commitSha },
    {
      $set: {
        repoId,
        owner,
        repoName,
        commitSha,
        architectureSummary: architectureSummary || null,
        architectureDiagram: architectureDiagram || null,
        requestFlowDiagram: requestFlowDiagram || null,
        repositoryGraph: repositoryGraph || null,
        analyzedAt
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return doc;
}

export function isCompleteAnalysis(doc) {
  return Boolean(
    doc &&
      doc.commitSha &&
      doc.architectureSummary &&
      doc.architectureDiagram &&
      doc.requestFlowDiagram != null
  );
}

/**
 * Shape cached doc for API responses.
 */
export function toArchitectureResponse(doc, { cached = true } = {}) {
  return {
    architectureSummary: doc.architectureSummary,
    architectureDiagram: doc.architectureDiagram,
    diagramSyntax: doc.architectureDiagram,
    requestFlowDiagram: doc.requestFlowDiagram || '',
    repositoryGraph: doc.repositoryGraph || null,
    commitSha: doc.commitSha,
    analyzedAt: doc.analyzedAt,
    cached
  };
}
