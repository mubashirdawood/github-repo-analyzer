/**
 * Repository Intelligence Engine
 * ==============================
 * Structural + dependency analysis that runs BEFORE any LLM call.
 *
 * Usage:
 *   import { analyzeRepository } from './services/intelligence/index.js';
 *
 *   const analysis = analyzeRepository({
 *     fileTree,                         // from githubService.getRepoContents
 *     fileContents: {                   // optional but recommended
 *       'package.json': '...',
 *       'requirements.txt': '...'
 *     }
 *   });
 */

export type {
  AnalyzeRepositoryOptions,
  FileContentMap,
  FileTreeEntry,
  ManifestInfo,
  ProjectType,
  RepositoryAnalysis,
  RepositoryStructure,
  TechnologyStack
} from './types.js';

export {
  analyzeRepository,
  analyzeRepositoryFromPaths
} from './analyzeRepository.js';

export {
  filterFileTree,
  shouldIgnorePath,
  IGNORED_DIRECTORIES,
  IGNORED_LOCK_FILES,
  BINARY_EXTENSIONS
} from './ignore.js';

export { detectProjectType } from './detectProjectType.js';
export { detectTechnologies } from './detectTechnologies.js';
export { detectEntryFiles } from './detectEntryFiles.js';
export { findStructure } from './findStructure.js';
export { findManifests } from './manifests.js';
export {
  PRIORITY_MANIFEST_NAMES,
  selectManifestsToFetch
} from './selectManifests.js';

export type {
  BuildRepositoryGraphOptions,
  GraphEdge,
  GraphNode,
  GraphNodeType,
  GraphRelation,
  RepositoryGraph
} from './graph/index.js';

export {
  buildRepositoryGraph,
  classifyFileNodeType,
  parseImports,
  inferRelation
} from './graph/index.js';

export type {
  AnalyzeRequestFlowsOptions,
  DetectedRoute,
  FlowFramework,
  RequestFlow,
  RequestMethod,
  RequestStep,
  RequestStepType
} from './flows/index.js';

export {
  analyzeRequestFlows,
  parseExpressRoutes,
  parseExpressRouteFile,
  parseExpressMounts,
  scanExpressRoutes,
  parseNextApiRoutes,
  parseNestRoutes,
  analyzeController,
  analyzeControllers,
  resolveController,
  analyzeService,
  analyzeServices,
  analyzeMiddleware,
  analyzeMiddlewares,
  buildExecutionGraph,
  buildExecutionGraphs,
  rankRoutes,
  scoreRouteImportance,
  selectTopRoutes,
  summarizeRequestFlow,
  validateMermaidFlowchart,
  ensureValidRequestFlowMermaid
} from './flows/index.js';

export type {
  ExpressHttpMethod,
  ExpressRouteDeclaration,
  ExpressRouterMount,
  ScanExpressRoutesOptions,
  AnalyzeControllerOptions,
  ControllerAnalysis,
  AnalyzeServiceOptions,
  ServiceAnalysis,
  AnalyzeMiddlewareOptions,
  MiddlewareAnalysis,
  ExecutionGraph,
  ExecutionGraphNode,
  ExecutionGraphEdge,
  RankedExecutionGraph,
  BuildExecutionGraphsOptions,
  FlowImportanceCategory,
  RankedRouteResult,
  RequestFlowSummary,
  MermaidFlowchartValidationResult
} from './flows/index.js';

export type {
  ArchitectureContext,
  BackendArchitectureContext,
  BuildArchitectureContextOptions,
  FrontendArchitectureContext
} from './architectureContext/index.js';

export {
  buildArchitectureContext,
  architectureContextToPromptJson,
  toArchitectureLabel
} from './architectureContext/index.js';

export type { GenerateArchitectureMermaidOptions } from './mermaid/index.js';
export { generateArchitectureMermaid } from './mermaid/index.js';

export type { GenerateComprehensiveRequestFlowOptions } from './mermaid/index.js';
export {
  generateComprehensiveRequestFlow,
  buildFallbackRequestLifecycleMermaid
} from './mermaid/index.js';

export type {
  GenerateSequenceDiagramsOptions,
  ApiSequenceDiagram
} from './mermaid/index.js';
export {
  generateSequenceDiagrams,
  generateSequenceDiagramsMermaid,
  flowToSequenceMermaid
} from './mermaid/index.js';

export type {
  LanguageShare,
  RepoStatistics,
  BuildRepoStatisticsOptions
} from './stats/index.js';
export { buildRepoStatistics } from './stats/index.js';

export type {
  ArchitectureExplanation,
  ExplainArchitectureOptions,
  IntelligencePack,
  ArchitectPromptPayload
} from './explain/index.js';

export {
  ARCHITECT_SYSTEM_MESSAGE,
  buildArchitectPrompt,
  buildArchitectLlmPrompt,
  buildIntelligencePack,
  explainArchitectureFromMetadata,
  mergeArchitectLlmResponse
} from './explain/index.js';

export type { PipelineInput, PipelineArtifacts } from './pipeline.js';
export {
  runRepositoryPipeline,
  runRepositoryPipelineSync
} from './pipeline.js';
