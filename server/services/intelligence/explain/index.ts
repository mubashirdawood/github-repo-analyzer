/**
 * Architecture Explanation
 * ========================
 * Senior-architect style explanation from metadata only.
 * Returns { architectureSummary, architectureDiagram, requestFlowDiagram }.
 */

export { ARCHITECT_SYSTEM_MESSAGE, buildArchitectPrompt } from './architectPrompt.js';
export type { ArchitectPromptPayload } from './architectPrompt.js';

export type {
  ArchitectureExplanation,
  ExplainArchitectureOptions,
  IntelligencePack
} from './buildArchitectureExplanation.js';

export {
  buildArchitectLlmPrompt,
  buildIntelligencePack,
  explainArchitectureFromMetadata,
  mergeArchitectLlmResponse
} from './buildArchitectureExplanation.js';
