import mongoose from 'mongoose';

/**
 * Cached comprehensive request-flow analysis for a repository commit.
 * Collection: request_flow_analysis
 *
 * Cache key: repositoryId + commitSha
 * One validated flowchart Mermaid + repository statistics.
 */
const languageShareSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    percent: { type: Number, default: 0 }
  },
  { _id: false }
);

const statsSchema = new mongoose.Schema(
  {
    framework: { type: String, default: 'Unknown' },
    frontendComponents: { type: Number, default: 0 },
    pages: { type: Number, default: 0 },
    apiRoutes: { type: Number, default: 0 },
    controllers: { type: Number, default: 0 },
    services: { type: Number, default: 0 },
    models: { type: Number, default: 0 },
    middleware: { type: Number, default: 0 },
    databaseCollections: { type: Number, default: 0 },
    externalApis: { type: Number, default: 0 },
    authentication: { type: String, default: 'None' },
    totalSourceFiles: { type: Number, default: 0 },
    languages: { type: [languageShareSchema], default: [] },
    complexity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    complexityScore: { type: Number, default: 0 },
    architectureLayers: { type: Number, default: 0 },
    layers: { type: [String], default: [] },
    technologies: { type: [String], default: [] },
    entryPoints: { type: [String], default: [] },
    stateManagement: { type: String, default: null },
    database: { type: String, default: null },
    summary: { type: String, default: '' }
  },
  { _id: false }
);

const requestFlowAnalysisSchema = new mongoose.Schema(
  {
    repositoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Repo',
      required: true,
      index: true
    },
    branch: {
      type: String,
      required: true,
      default: 'main',
      index: true
    },
    commitSha: {
      type: String,
      required: true,
      index: true
    },
    /** Validated Mermaid flowchart TD for the whole repository. */
    mermaid: {
      type: String,
      default: ''
    },
    stats: {
      type: statsSchema,
      default: () => ({})
    },
    summary: {
      type: String,
      default: ''
    },
    layers: {
      type: [String],
      default: []
    },
    technologies: {
      type: [String],
      default: []
    },
    entryPoints: {
      type: [String],
      default: []
    },
    complexity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    complexityScore: {
      type: Number,
      default: 0
    },
    /**
     * Legacy multi-flow field — kept for backward-compatible reads only.
     * New writes leave this empty.
     */
    generatedFlows: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    }
  },
  {
    collection: 'request_flow_analysis',
    timestamps: true
  }
);

requestFlowAnalysisSchema.index(
  { repositoryId: 1, commitSha: 1 },
  { unique: true }
);

requestFlowAnalysisSchema.index({ repositoryId: 1, branch: 1, commitSha: 1 });

const RequestFlowAnalysis = mongoose.model(
  'RequestFlowAnalysis',
  requestFlowAnalysisSchema
);

export default RequestFlowAnalysis;
