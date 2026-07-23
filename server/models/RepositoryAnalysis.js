import mongoose from 'mongoose';

/**
 * Cached architecture intelligence for a GitHub commit.
 * Collection: repository_analysis
 *
 * Cache key: owner + repoName + commitSha
 * If the HEAD SHA is unchanged, serve this document and skip regeneration.
 */
const repositoryAnalysisSchema = new mongoose.Schema(
  {
    repoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Repo',
      index: true
    },
    owner: {
      type: String,
      required: true,
      index: true
    },
    repoName: {
      type: String,
      required: true,
      index: true
    },
    /** GitHub commit SHA at analysis time */
    commitSha: {
      type: String,
      required: true,
      index: true
    },
    architectureSummary: {
      type: String,
      default: null
    },
    architectureDiagram: {
      type: String,
      default: null
    },
    requestFlowDiagram: {
      type: String,
      default: null
    },
    /** Serialized RepositoryGraph { nodes, edges } */
    repositoryGraph: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    analyzedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: 'repository_analysis',
    timestamps: false
  }
);

repositoryAnalysisSchema.index(
  { owner: 1, repoName: 1, commitSha: 1 },
  { unique: true }
);

const RepositoryAnalysis = mongoose.model('RepositoryAnalysis', repositoryAnalysisSchema);
export default RepositoryAnalysis;
