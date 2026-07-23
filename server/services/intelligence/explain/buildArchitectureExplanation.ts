/**
 * Architecture explanation — metadata only, no invented files.
 * Produces { architectureSummary, architectureDiagram, requestFlowDiagram }.
 */

import type { RepositoryAnalysis } from '../types.js';
import type { ArchitectureContext } from '../architectureContext/types.js';
import type { RepositoryGraph } from '../graph/types.js';
import type { RequestFlow } from '../flows/types.js';
import { buildArchitectureContext } from '../architectureContext/buildArchitectureContext.js';
import { architectureContextToPromptJson } from '../architectureContext/buildArchitectureContext.js';
import { buildRepositoryGraph } from '../graph/buildRepositoryGraph.js';
import { analyzeRequestFlows } from '../flows/analyzeRequestFlows.js';
import { generateArchitectureMermaid } from '../mermaid/generateArchitectureMermaid.js';
import {
  generateSequenceDiagrams,
  generateSequenceDiagramsMermaid
} from '../mermaid/generateSequenceDiagrams.js';
import { buildArchitectPrompt, ARCHITECT_SYSTEM_MESSAGE } from './architectPrompt.js';

export interface ArchitectureExplanation {
  architectureSummary: string;
  architectureDiagram: string;
  requestFlowDiagram: string;
}

export interface ExplainArchitectureOptions {
  fileContents?: Record<string, string>;
  /** Optional precomputed pieces to avoid re-work. */
  context?: ArchitectureContext;
  graph?: RepositoryGraph;
  flows?: RequestFlow[];
  /** Max nodes in architecture Mermaid. */
  maxNodes?: number;
}

export interface IntelligencePack {
  analysis: RepositoryAnalysis;
  context: ArchitectureContext;
  graph: RepositoryGraph;
  flows: RequestFlow[];
}

/**
 * Run the full intelligence pipeline needed for architecture explanation.
 */
export function buildIntelligencePack(
  analysis: RepositoryAnalysis,
  options: ExplainArchitectureOptions = {}
): IntelligencePack {
  const context =
    options.context ??
    buildArchitectureContext(analysis, {
      externalServices: undefined
    });

  const graph =
    options.graph ??
    buildRepositoryGraph({
      files: analysis.files,
      fileContents: options.fileContents,
      entryFiles: analysis.entryFiles,
      database: analysis.technologies.database,
      backend: analysis.technologies.backend,
      frontend: analysis.technologies.frontend,
      maxFilesToParse: 80
    });

  const flows =
    options.flows ??
    analyzeRequestFlows({
      files: analysis.files,
      fileContents: options.fileContents,
      backend: analysis.technologies.backend,
      database: analysis.technologies.database,
      authentication: analysis.technologies.authentication,
      maxRoutes: 30
    });

  return { analysis, context, graph, flows };
}

/**
 * Deterministic architecture explanation from metadata only.
 * Never invents files — only uses ArchitectureContext, graph signals, and flows.
 */
export function explainArchitectureFromMetadata(
  analysis: RepositoryAnalysis,
  options: ExplainArchitectureOptions = {}
): ArchitectureExplanation {
  const pack = buildIntelligencePack(analysis, options);
  const { context, flows } = pack;

  const architectureDiagram = generateArchitectureMermaid(analysis, {
    context,
    maxNodes: options.maxNodes ?? 40
  });

  const sequences = generateSequenceDiagrams(analysis, {
    flows,
    fileContents: options.fileContents,
    files: analysis.files,
    maxDiagrams: 4
  });

  const requestFlowDiagram =
    sequences.length > 0
      ? sequences.map((s) => s.mermaid).join('\n\n')
      : generateSequenceDiagramsMermaid(analysis, {
          flows,
          fileContents: options.fileContents,
          files: analysis.files
        });

  const architectureSummary = writeArchitectureSummary(context, flows);

  return {
    architectureSummary,
    architectureDiagram,
    requestFlowDiagram
  };
}

/**
 * Build the LLM prompt payload (for callers that want model-polished prose).
 * Diagrams should still be taken from explainArchitectureFromMetadata to avoid invention.
 */
export function buildArchitectLlmPrompt(
  analysis: RepositoryAnalysis,
  options: ExplainArchitectureOptions = {}
): { systemMessage: string; userPrompt: string; local: ArchitectureExplanation } {
  const pack = buildIntelligencePack(analysis, options);
  const local = explainArchitectureFromMetadata(analysis, {
    ...options,
    context: pack.context,
    graph: pack.graph,
    flows: pack.flows
  });

  const compactFlows = pack.flows.slice(0, 12).map((f) => ({
    id: f.id,
    title: f.title,
    method: f.method,
    endpoint: f.endpoint,
    description: f.description,
    steps: f.steps.map((s) => ({
      type: s.type,
      name: s.name,
      file: s.file,
      next: s.next
    }))
  }));

  const userPrompt = buildArchitectPrompt({
    architectureContext: JSON.parse(architectureContextToPromptJson(pack.context) || '{}'),
    repositoryGraph: {
      nodes: pack.graph.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type
      })),
      edges: pack.graph.edges.map((e) => ({
        source: e.source,
        target: e.target,
        relation: e.relation
      }))
    },
    requestFlows: compactFlows,
    architectureDiagramHint: local.architectureDiagram,
    requestFlowDiagramHint: local.requestFlowDiagram
  });

  return {
    systemMessage: ARCHITECT_SYSTEM_MESSAGE,
    userPrompt,
    local
  };
}

/**
 * Parse LLM JSON safely; fall back to local diagrams if the model invents junk.
 */
export function mergeArchitectLlmResponse(
  local: ArchitectureExplanation,
  llmRaw: string
): ArchitectureExplanation {
  const parsed = tryParseJson(llmRaw);
  if (!parsed) return local;

  const summary =
    typeof parsed.architectureSummary === 'string' && parsed.architectureSummary.trim()
      ? parsed.architectureSummary.trim()
      : local.architectureSummary;

  // Prefer local Mermaid (metadata-derived). Only accept LLM diagram if it looks like Mermaid
  // and stays within size bounds — still replace with local if missing flowchart/sequence.
  let architectureDiagram = local.architectureDiagram;
  if (
    typeof parsed.architectureDiagram === 'string' &&
    /flowchart|graph\s/i.test(parsed.architectureDiagram) &&
    countMermaidNodes(parsed.architectureDiagram) <= 40
  ) {
    architectureDiagram = stripFences(parsed.architectureDiagram);
  }

  let requestFlowDiagram = local.requestFlowDiagram;
  if (
    typeof parsed.requestFlowDiagram === 'string' &&
    /sequenceDiagram/i.test(parsed.requestFlowDiagram)
  ) {
    requestFlowDiagram = stripFences(parsed.requestFlowDiagram);
  }

  return { architectureSummary: summary, architectureDiagram, requestFlowDiagram };
}

function writeArchitectureSummary(context: ArchitectureContext, flows: RequestFlow[]): string {
  const lines: string[] = [];

  lines.push('## 1. Architecture overview');
  lines.push(
    `This repository is classified as **${context.projectType}**.` +
      (context.frontend || context.backend
        ? ` It follows a layered client/server design with clear separation between UI, API, and data.`
        : ` Structure is inferred from available metadata only.`)
  );
  if (context.importantFiles.length) {
    lines.push(
      `Key entry points: ${context.importantFiles.map((f) => `\`${f}\``).join(', ')}.`
    );
  }
  lines.push('');

  lines.push('## 2. Frontend');
  if (context.frontend) {
    const fe = context.frontend;
    lines.push(
      `The UI is built with **${fe.framework || 'an unidentified frontend framework'}**.`
    );
    if (fe.pages.length) {
      lines.push(`Primary pages/screens: ${fe.pages.join(', ')}.`);
    }
    lines.push(`Component inventory: **${fe.components}** component module(s).`);
    if (fe.stateManagement) lines.push(`State management: ${fe.stateManagement}.`);
    if (fe.uiLibrary) lines.push(`UI library: ${fe.uiLibrary}.`);
  } else {
    lines.push('No frontend framework or page/component modules were detected in the metadata.');
  }
  lines.push('');

  lines.push('## 3. Backend');
  if (context.backend) {
    const be = context.backend;
    lines.push(
      `The API layer runs on **${be.framework || 'an unidentified backend framework'}**.`
    );
    if (be.routes.length) {
      lines.push(`Route modules: ${be.routes.join(', ')}.`);
    }
    if (be.middleware.length) {
      lines.push(`Middleware: ${be.middleware.join(', ')}.`);
    }
    if (be.services?.length) {
      lines.push(`Services: ${be.services.join(', ')}.`);
    }
  } else {
    lines.push('No backend framework or route/service modules were detected in the metadata.');
  }
  lines.push('');

  lines.push('## 4. Authentication');
  if (context.authentication) {
    lines.push(
      `Authentication is handled with **${context.authentication}**.` +
        (context.backend?.middleware?.length
          ? ` Related middleware modules include: ${context.backend.middleware.join(', ')}.`
          : '')
    );
  } else {
    lines.push('No authentication mechanism was detected in the metadata.');
  }
  lines.push('');

  lines.push('## 5. Database');
  if (context.database) {
    lines.push(`Persistence is provided by **${context.database}**.`);
    if (context.cache) lines.push(`Caching: ${context.cache}.`);
  } else {
    lines.push('No database technology was detected in the metadata.');
  }
  lines.push('');

  lines.push('## 6. Request lifecycle');
  if (flows.length && flows[0]!.endpoint !== '*') {
    lines.push(
      'Typical requests move through: client → route/API layer → controller → service → data store → response.'
    );
    lines.push('Observed flows:');
    for (const f of flows.slice(0, 6)) {
      const chain = f.steps.map((s) => s.name).join(' → ');
      lines.push(`- \`${f.method} ${f.endpoint}\`: ${chain}`);
    }
  } else {
    lines.push(
      'Specific HTTP routes could not be fully traced from metadata; the expected lifecycle is still client → API → services → database → response where those layers exist.'
    );
  }
  lines.push('');

  lines.push('## 7. External integrations');
  const externals = [
    ...context.externalServices,
    context.realtime,
    context.deployment
  ].filter(Boolean) as string[];
  const unique = [...new Set(externals.map((e) => e.trim()).filter(Boolean))];
  if (unique.length) {
    lines.push(`External / platform integrations: ${unique.join(', ')}.`);
  } else {
    lines.push('No external service integrations were detected in the metadata.');
  }
  if (context.testing) {
    lines.push(`Testing stack: ${context.testing}.`);
  }

  return lines.join('\n').trim();
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // Try fenced block
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence?.[1]) {
      try {
        return JSON.parse(fence[1].trim()) as Record<string, unknown>;
      } catch {
        /* continue */
      }
    }
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function stripFences(text: string): string {
  return text
    .replace(/^```(?:mermaid)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function countMermaidNodes(mermaid: string): number {
  const lines = mermaid.split('\n');
  let count = 0;
  for (const line of lines) {
    if (/^\s*(participant|actor)\s+/i.test(line)) count += 1;
    else if (/^\s+\w+(\[|\(|\{)/.test(line) && !/subgraph|end/.test(line)) count += 1;
  }
  return count || lines.filter((l) => /-->/.test(l)).length;
}
