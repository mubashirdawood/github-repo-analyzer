/**
 * Architecture Context Builder
 * ============================
 * Converts RepositoryAnalysis → compact LLM-ready metadata (no source code).
 */

export type {
  ArchitectureContext,
  BackendArchitectureContext,
  BuildArchitectureContextOptions,
  FrontendArchitectureContext
} from './types.js';

export {
  architectureContextToPromptJson,
  buildArchitectureContext,
  toArchitectureLabel
} from './buildArchitectureContext.js';
