/**
 * Request Flow Analyzer
 * =====================
 * Extracts structured HTTP request processing chains from
 * Express, Next.js API Routes, and NestJS — no LLM.
 */

export type {
  AnalyzeRequestFlowsOptions,
  DetectedRoute,
  FlowFramework,
  RequestFlow,
  RequestMethod,
  RequestStep,
  RequestStepType
} from './types.js';

export {
  analyzeRequestFlows,
  buildFlowDescription,
  buildFlowId,
  buildFlowTitle
} from './analyzeRequestFlows.js';
export { parseExpressRoutes } from './parseExpressRoutes.js';
export { parseNextApiRoutes } from './parseNextApiRoutes.js';
export { parseNestRoutes } from './parseNestRoutes.js';
export { linkSteps, toStepType, traceHandlerFlow } from './traceHandler.js';

export type {
  ExpressHttpMethod,
  ExpressRouteDeclaration,
  ExpressRouterMount,
  ParseExpressRouteFileOptions,
  ScanExpressRoutesOptions
} from './express/index.js';

export {
  parseExpressRouteFile,
  parseExpressMounts,
  scanExpressRoutes
} from './express/index.js';

export type {
  AnalyzeControllerOptions,
  ControllerAnalysis,
  ResolvedController
} from './controller/index.js';

export {
  analyzeController,
  analyzeControllers,
  resolveController
} from './controller/index.js';

export type {
  AnalyzeMiddlewareOptions,
  MiddlewareAnalysis
} from './middleware/index.js';

export { analyzeMiddleware, analyzeMiddlewares } from './middleware/index.js';

export type {
  AnalyzeServiceOptions,
  ServiceAnalysis,
  ServiceCallCategory
} from './service/index.js';

export {
  analyzeService,
  analyzeServices,
  classifyServiceCalls
} from './service/index.js';

export type {
  BuildExecutionGraphsOptions,
  ExecutionGraph,
  ExecutionGraphEdge,
  ExecutionGraphNode,
  ExecutionNodeType,
  ExecutionRelation,
  RankedExecutionGraph
} from './executionGraph/index.js';

export {
  buildExecutionGraph,
  buildExecutionGraphForRoute,
  buildExecutionGraphs
} from './executionGraph/index.js';

export type {
  FlowImportanceCategory,
  RankableRoute,
  RankedRouteResult
} from './ranking/index.js';

export {
  DEFAULT_TOP_FLOWS,
  FLOW_IGNORE_PATTERNS,
  FLOW_IMPORTANCE_PATTERNS,
  rankRoutes,
  scoreRouteImportance,
  selectTopRoutes,
  shouldIgnoreRoute
} from './ranking/index.js';

export type {
  RequestFlowPromptInput,
  RequestFlowPromptOptions,
  RequestFlowSummary
} from './prompt/index.js';

export { summarizeRequestFlow, formatFlowOutline } from './prompt/index.js';

export type { MermaidFlowchartValidationResult } from './generate/index.js';

export {
  validateMermaidFlowchart,
  extractMermaidFlowchart,
  sanitizeMermaidFlowchart,
  ensureValidRequestFlowMermaid,
  callOpenAIChat,
  REQUEST_FLOW_OPENAI_MODEL
} from './generate/index.js';
