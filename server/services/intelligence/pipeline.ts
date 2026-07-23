/**
 * GitLens AI — Repository Intelligence Pipeline
 * =============================================
 *
 * GitHub URL
 *      │
 *      ▼
 * GitHub API
 *      │
 *      ▼
 * Repository Scanner
 *      │
 *      ▼
 * Technology Detector
 *      │
 *      ▼
 * Import & Route Parser
 *      │
 *      ▼
 * Repository Graph Builder
 *      │
 *      ├──────────────┐
 *      ▼              ▼
 * Architecture Context  Request Flow Extractor
 *      │              │
 *      └──────┬───────┘
 *             ▼
 *         OpenAI / Gemini API  (optional polish)
 *             │
 *             ▼
 * ┌─────────────────────────────┐
 * │ Architecture Summary         │
 * │ Mermaid Architecture Diagram │
 * │ Request Flow Diagram         │
 * │ AI Q&A over Repository (RAG) │  ← separate ask endpoint
 * └─────────────────────────────┘
 *             │
 *             ▼
 *       Cache in MongoDB (repository_analysis)
 */

import type { FileTreeEntry, RepositoryAnalysis } from './types.js';
import type { ArchitectureContext } from './architectureContext/types.js';
import type { RepositoryGraph } from './graph/types.js';
import type { RequestFlow } from './flows/types.js';
import { analyzeRepository } from './analyzeRepository.js';
import { buildArchitectureContext } from './architectureContext/buildArchitectureContext.js';
import { buildRepositoryGraph } from './graph/buildRepositoryGraph.js';
import { analyzeRequestFlows } from './flows/analyzeRequestFlows.js';
import { generateArchitectureMermaid } from './mermaid/generateArchitectureMermaid.js';
import { generateSequenceDiagrams } from './mermaid/generateSequenceDiagrams.js';
import {
  explainArchitectureFromMetadata,
  buildArchitectLlmPrompt,
  mergeArchitectLlmResponse,
  type ArchitectureExplanation
} from './explain/buildArchitectureExplanation.js';

export interface PipelineInput {
  owner?: string;
  repoName?: string;
  fileTree: FileTreeEntry[];
  /** Manifest + source file texts (from GitHub API / FileCache). */
  fileContents?: Record<string, string>;
  commitSha?: string | null;
  /**
   * Optional LLM caller: (userPrompt, systemMessage) => raw model text.
   * When omitted, metadata-only explanation is used (still produces all diagrams).
   */
  callLlm?: (userPrompt: string, systemMessage: string) => Promise<string>;
}

export interface PipelineArtifacts {
  /** Stage outputs (for debugging / RAG context). */
  stages: {
    scanner: RepositoryAnalysis;
    technology: RepositoryAnalysis['technologies'];
    graph: RepositoryGraph;
    architectureContext: ArchitectureContext;
    requestFlows: RequestFlow[];
  };
  /** Final deliverables. */
  architectureSummary: string;
  architectureDiagram: string;
  requestFlowDiagram: string;
  repositoryGraph: RepositoryGraph;
  commitSha?: string | null;
}

/**
 * Run the full intelligence pipeline (everything before MongoDB cache write).
 *
 * Stages map 1:1 to the GitLens architecture diagram.
 */
export async function runRepositoryPipeline(
  input: PipelineInput
): Promise<PipelineArtifacts> {
  const fileContents = input.fileContents ?? {};

  // ── Repository Scanner + Technology Detector ──────────────────────────
  const scanner = analyzeRepository({
    fileTree: input.fileTree,
    fileContents,
    owner: input.owner,
    repoName: input.repoName
  });

  // ── Import & Route Parser → Repository Graph Builder ──────────────────
  const graph = buildRepositoryGraph({
    files: scanner.files,
    fileContents,
    entryFiles: scanner.entryFiles,
    database: scanner.technologies.database,
    backend: scanner.technologies.backend,
    frontend: scanner.technologies.frontend,
    maxFilesToParse: 80
  });

  // ── Parallel branches from the graph / analysis ───────────────────────
  const architectureContext = buildArchitectureContext(scanner, {
    externalServices: collectExternalFromGraph(graph)
  });

  const requestFlows = analyzeRequestFlows({
    files: scanner.files,
    fileContents,
    backend: scanner.technologies.backend,
    database: scanner.technologies.database,
    authentication: scanner.technologies.authentication,
    maxRoutes: 30
  });

  // Local Mermaid (always — never invent files)
  const localExplanation = explainArchitectureFromMetadata(scanner, {
    fileContents,
    context: architectureContext,
    graph,
    flows: requestFlows
  });

  // Ensure sequence diagrams exist even if local path was thin
  const sequences = generateSequenceDiagrams(scanner, {
    flows: requestFlows,
    fileContents,
    files: scanner.files,
    maxDiagrams: 4
  });
  const requestFlowDiagram =
    localExplanation.requestFlowDiagram ||
    sequences.map((s) => s.mermaid).join('\n\n') ||
    '';

  const architectureDiagram =
    localExplanation.architectureDiagram ||
    generateArchitectureMermaid(scanner, {
      context: architectureContext,
      maxNodes: 40
    });

  let architectureSummary = localExplanation.architectureSummary;

  // ── OpenAI / Gemini (optional prose polish) ───────────────────────────
  if (input.callLlm) {
    try {
      const { systemMessage, userPrompt, local } = buildArchitectLlmPrompt(scanner, {
        fileContents,
        context: architectureContext,
        graph,
        flows: requestFlows
      });
      const raw = await input.callLlm(userPrompt, systemMessage);
      const merged = mergeArchitectLlmResponse(
        {
          ...local,
          architectureDiagram,
          requestFlowDiagram
        },
        raw
      );
      architectureSummary = merged.architectureSummary;
      // Diagrams stay metadata-derived unless merge accepted a valid Mermaid refine
    } catch (err) {
      console.error(
        '[pipeline] LLM polish failed, keeping metadata summary:',
        err instanceof Error ? err.message : err
      );
    }
  }

  return {
    stages: {
      scanner,
      technology: scanner.technologies,
      graph,
      architectureContext,
      requestFlows
    },
    architectureSummary,
    architectureDiagram,
    requestFlowDiagram,
    repositoryGraph: graph,
    commitSha: input.commitSha ?? null
  };
}

/**
 * Synchronous metadata-only path (no LLM) — useful for tests / fallbacks.
 */
export function runRepositoryPipelineSync(
  input: Omit<PipelineInput, 'callLlm'>
): PipelineArtifacts {
  // Async LLM skipped; reuse async implementation via blocking isn't possible —
  // duplicate the sync stages here without callLlm.
  const fileContents = input.fileContents ?? {};
  const scanner = analyzeRepository({
    fileTree: input.fileTree,
    fileContents,
    owner: input.owner,
    repoName: input.repoName
  });
  const graph = buildRepositoryGraph({
    files: scanner.files,
    fileContents,
    entryFiles: scanner.entryFiles,
    database: scanner.technologies.database,
    backend: scanner.technologies.backend,
    frontend: scanner.technologies.frontend,
    maxFilesToParse: 80
  });
  const architectureContext = buildArchitectureContext(scanner, {
    externalServices: collectExternalFromGraph(graph)
  });
  const requestFlows = analyzeRequestFlows({
    files: scanner.files,
    fileContents,
    backend: scanner.technologies.backend,
    database: scanner.technologies.database,
    authentication: scanner.technologies.authentication,
    maxRoutes: 30
  });
  const explanation = explainArchitectureFromMetadata(scanner, {
    fileContents,
    context: architectureContext,
    graph,
    flows: requestFlows
  });

  return {
    stages: {
      scanner,
      technology: scanner.technologies,
      graph,
      architectureContext,
      requestFlows
    },
    architectureSummary: explanation.architectureSummary,
    architectureDiagram: explanation.architectureDiagram,
    requestFlowDiagram: explanation.requestFlowDiagram,
    repositoryGraph: graph,
    commitSha: input.commitSha ?? null
  };
}

function collectExternalFromGraph(graph: RepositoryGraph): string[] {
  return graph.nodes
    .filter((n) => n.type === 'External API')
    .map((n) => n.name)
    .slice(0, 8);
}

export type { ArchitectureExplanation };
