/**
 * Mermaid Architecture Diagram
 * ============================
 * Converts RepositoryAnalysis → software-architecture Mermaid (not folders).
 */

export type { GenerateArchitectureMermaidOptions } from './generateArchitectureMermaid.js';
export { generateArchitectureMermaid } from './generateArchitectureMermaid.js';

export type { GenerateComprehensiveRequestFlowOptions } from './generateComprehensiveRequestFlow.js';
export {
  generateComprehensiveRequestFlow,
  buildFallbackRequestLifecycleMermaid
} from './generateComprehensiveRequestFlow.js';

export type {
  GenerateSequenceDiagramsOptions,
  ApiSequenceDiagram
} from './generateSequenceDiagrams.js';
export {
  generateSequenceDiagrams,
  generateSequenceDiagramsMermaid,
  flowToSequenceMermaid
} from './generateSequenceDiagrams.js';
