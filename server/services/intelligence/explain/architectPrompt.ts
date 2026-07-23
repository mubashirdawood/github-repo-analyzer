/**
 * Senior-architect prompt for LLM-backed architecture explanations.
 * Placeholders are filled with compact metadata only — never raw source.
 */

export const ARCHITECT_SYSTEM_MESSAGE = `You are a senior software architect writing clear Markdown for GitLens.

Rules:
- Use ONLY the repository metadata in the user message. Never invent files, routes, or services.
- Prefer a high-quality architectureSummary in Markdown.
- Do NOT invent diagram nodes. Prefer the provided diagram hints; leave diagram fields empty if unsure.
- Never list every folder; group related modules.
- Return ONLY valid JSON with keys architectureSummary, architectureDiagram, requestFlowDiagram.
- No markdown fences around the JSON.`;

export interface ArchitectPromptPayload {
  architectureContext: unknown;
  repositoryGraph: unknown;
  requestFlows: unknown;
  /** Prefer these local diagrams if the model should refine prose only. */
  architectureDiagramHint?: string;
  requestFlowDiagramHint?: string;
}

/**
 * Build the user prompt with ArchitectureContext / Graph / Flows injected.
 */
export function buildArchitectPrompt(payload: ArchitectPromptPayload): string {
  const contextJson = JSON.stringify(payload.architectureContext, null, 2);
  const graphJson = compactGraph(payload.repositoryGraph);
  const flowsJson = JSON.stringify(payload.requestFlows, null, 2);

  return `Write an architecture explanation for this repository.

Cover in Markdown (architectureSummary):
1. Architecture overview
2. Frontend
3. Backend
4. Authentication
5. Database
6. Request lifecycle
7. External integrations

Rules
- Do not invent files, routes, or services missing from the metadata.
- If a section has no evidence, say so briefly.
- Prefer the provided diagram hints. You may copy them into architectureDiagram / requestFlowDiagram, or leave those strings empty. Do not invent new Mermaid nodes.

Repository Metadata

${contextJson}

Repository Graph

${graphJson}

Request Flows

${flowsJson}

${
  payload.architectureDiagramHint
    ? `Preferred architecture diagram (reuse or leave empty; keep ≤40 nodes):\n\n${payload.architectureDiagramHint}\n`
    : ''
}
${
  payload.requestFlowDiagramHint
    ? `Preferred request-flow diagram hint (reuse or leave empty):\n\n${payload.requestFlowDiagramHint}\n`
    : ''
}

Return JSON

{
  "architectureSummary": "",
  "architectureDiagram": "",
  "requestFlowDiagram": ""
}`;
}

/** Keep graph JSON small for the LLM context window. */
function compactGraph(graph: unknown): string {
  if (!graph || typeof graph !== 'object') return JSON.stringify(graph ?? {});
  const g = graph as { nodes?: unknown[]; edges?: unknown[] };
  const nodes = Array.isArray(g.nodes) ? g.nodes.slice(0, 60) : [];
  const edges = Array.isArray(g.edges) ? g.edges.slice(0, 80) : [];
  return JSON.stringify({ nodes, edges, truncated: true }, null, 2);
}
