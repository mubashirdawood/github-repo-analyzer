import { AppError, ANALYSIS_FAILED_MESSAGE } from '../errors/AppError.js';
import { getFileContent } from './githubService.js';
import {
  analyzeRepository,
  selectManifestsToFetch,
  explainArchitectureFromMetadata,
  runRepositoryPipeline
} from './intelligence/index.js';

const OPENAI_MODEL = 'gpt-4o-mini';
const GEMINI_MODEL = 'gemini-2.0-flash';

const MAX_ASK_FILE_CHARS = 5000;
const LLM_TIMEOUT_MS = 20000;
const MAX_MANIFEST_FETCH = 6;
const MAX_SOURCE_FETCH_FOR_FLOWS = 20;

const ASK_SYSTEM_DEFAULT = `You are GitLens, a senior software engineer answering questions about a GitHub repository.

Rules:
- Use ONLY the repository files provided in the user message.
- Prefer short Markdown: one lead sentence, then bullets when listing facts.
- Cite concrete file paths (and function/symbol names when known).
- Use fenced code blocks only for real snippets from the files.
- If the answer is not in the provided files, say so clearly. Do not invent APIs, files, or behavior.`;

const ASK_SYSTEM_EXPLAIN = `You are GitLens, a senior software engineer explaining how code in a GitHub repository works.

Rules:
- Use ONLY the repository files provided in the user message.
- Walk through the flow step by step in Markdown (numbered or bulleted).
- Name the key files and functions involved.
- Cite file paths for each major step.
- Use fenced code only for short, relevant snippets from the files.
- If something is not evidenced in the provided files, say so. Do not invent.`;

/**
 * @param {string} question
 * @param {Array<{ path: string, content: string }>} files
 * @param {{ mode?: 'ask' | 'explain' }} [options]
 */
export async function askQuestion(question, files, options = {}) {
  const mode = options.mode === 'explain' ? 'explain' : 'ask';
  let filesContext = '';
  for (const file of files) {
    const content =
      file.content.length > MAX_ASK_FILE_CHARS
        ? `${file.content.slice(0, MAX_ASK_FILE_CHARS)}\n\n…[truncated]`
        : file.content;
    filesContext += `--- FILE: ${file.path} ---\n${content}\n\n`;
  }

  const prompt = `Question:
${question}

Repository files:
${filesContext || '(No matching files discovered in the current search)'}`;

  return callLLM(prompt, {
    maxTokens: mode === 'explain' ? 1100 : 900,
    timeoutMs: LLM_TIMEOUT_MS,
    systemMessage: mode === 'explain' ? ASK_SYSTEM_EXPLAIN : ASK_SYSTEM_DEFAULT
  });
}

/**
 * Prefer metadata-derived architecture Mermaid (no folder trees).
 */
export function buildLocalArchitectureDiagram(repo, fileTree, options = {}) {
  try {
    const analysis = analyzeRepository({ fileTree: fileTree || [] });
    return explainArchitectureFromMetadata(analysis, {
      maxNodes: options.maxNodes ?? 40
    }).architectureDiagram;
  } catch {
    return buildLegacyFolderDiagram(repo, fileTree, options);
  }
}

function buildLegacyFolderDiagram(repo, fileTree, options = {}) {
  const MAX_NODES = options.maxNodes ?? 120;
  const MAX_DEPTH = options.maxDepth ?? 6;
  const label = `${repo.owner || 'repo'}/${repo.repoName || 'app'}`;
  const quote = (s) => `"${String(s).replace(/"/g, "'")}"`;
  const nodeId = (path) => {
    const id = `n_${String(path).replace(/[^a-zA-Z0-9]/g, '_')}`;
    return id.slice(0, 64) || 'n_node';
  };

  const dirSet = new Set();
  const filePaths = [];
  for (const file of fileTree || []) {
    const parts = String(file.path || '').split('/').filter(Boolean);
    if (parts.length === 0) continue;
    const depth = Math.min(parts.length, MAX_DEPTH);
    for (let i = 1; i < depth; i += 1) dirSet.add(parts.slice(0, i).join('/'));
    if (parts.length <= MAX_DEPTH) filePaths.push(parts.join('/'));
    else dirSet.add(parts.slice(0, MAX_DEPTH).join('/'));
  }

  const dirs = [...dirSet].sort(
    (a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b)
  );
  const files = [...filePaths].sort((a, b) => a.localeCompare(b));
  const lines = ['graph TD', `  Root[${quote(label)}]`];
  const created = new Set(['Root']);
  const edges = new Set();
  let count = 1;

  const addNode = (path, display, isDir) => {
    const id = nodeId(path);
    if (created.has(id)) return id;
    if (count >= MAX_NODES) return null;
    created.add(id);
    count += 1;
    lines.push(`  ${id}[${quote(isDir ? `${display}/` : display)}]`);
    return id;
  };
  const addEdge = (fromId, toId) => {
    const key = `${fromId}->${toId}`;
    if (edges.has(key) || !fromId || !toId) return;
    edges.add(key);
    lines.push(`  ${fromId} --> ${toId}`);
  };

  for (const dir of dirs) {
    if (count >= MAX_NODES) break;
    const parts = dir.split('/');
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : null;
    const parentId = parentPath ? nodeId(parentPath) : 'Root';
    const id = addNode(dir, parts[parts.length - 1], true);
    if (!id) break;
    if (created.has(parentId)) addEdge(parentId, id);
  }
  for (const filePath of files) {
    if (count >= MAX_NODES) break;
    const parts = filePath.split('/');
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : null;
    const parentId =
      parentPath && created.has(nodeId(parentPath)) ? nodeId(parentPath) : 'Root';
    const id = addNode(filePath, parts[parts.length - 1], false);
    if (!id) break;
    addEdge(parentId, id);
  }
  return lines.join('\n');
}

/**
 * Fetch manifests + structural sources for intelligence (no full-repo download).
 */
async function loadIntelligenceFileContents(repo, fileTree) {
  const analysisProbe = analyzeRepository({ fileTree: fileTree || [] });
  const manifests = selectManifestsToFetch(analysisProbe.files, MAX_MANIFEST_FETCH);
  const structural = analysisProbe.files.filter(
    (p) =>
      /(^|\/)(routes?|controllers?|services?|models?|middleware)\//i.test(p) ||
      /(server|app|index|main)\.(js|ts|mjs|cjs)$/i.test(p)
  );
  const toFetch = [...new Set([...manifests, ...structural])].slice(
    0,
    MAX_MANIFEST_FETCH + MAX_SOURCE_FETCH_FOR_FLOWS
  );

  const fileContents = {};
  await Promise.all(
    toFetch.map(async (path) => {
      try {
        const content = await getFileContent(repo.owner, repo.repoName, path, repo._id);
        if (content != null) fileContents[path] = content;
      } catch (err) {
        console.warn(`Intelligence fetch skipped for ${path}:`, err.message);
      }
    })
  );
  return fileContents;
}

/**
 * Full GitLens pipeline:
 * Scanner → Tech Detector → Import/Route Parser → Graph → Context + Flows
 * → (optional) OpenAI/Gemini → Summary + Mermaid diagrams
 *
 * Caller persists results to MongoDB `repository_analysis`.
 */
export async function generateArchitectureExplanation(repo, fileTree) {
  const fileContents = await loadIntelligenceFileContents(repo, fileTree);

  const artifacts = await runRepositoryPipeline({
    owner: repo.owner,
    repoName: repo.repoName,
    fileTree: fileTree || [],
    fileContents,
    commitSha: repo.commitSha || null,
    callLlm: async (userPrompt, systemMessage) =>
      callLLM(userPrompt, {
        maxTokens: 1200,
        timeoutMs: LLM_TIMEOUT_MS,
        preferGemini: true,
        systemMessage
      })
  });

  return {
    architectureSummary: artifacts.architectureSummary,
    architectureDiagram: artifacts.architectureDiagram,
    requestFlowDiagram: artifacts.requestFlowDiagram,
    repositoryGraph: {
      nodes: artifacts.repositoryGraph.nodes,
      edges: artifacts.repositoryGraph.edges
    },
    stages: artifacts.stages
  };
}

/**
 * Bundle used by the architecture API (diagram = architecture Mermaid).
 */
export async function generateArchitectureBundle(repo, fileTree) {
  const explanation = await generateArchitectureExplanation(repo, fileTree);
  return {
    architectureSummary: explanation.architectureSummary,
    diagramSyntax: explanation.architectureDiagram,
    requestFlowDiagram: explanation.requestFlowDiagram
  };
}

export function buildFallbackSummary(repo, fileTree) {
  try {
    return explainArchitectureFromMetadata(
      analyzeRepository({ fileTree: fileTree || [] })
    ).architectureSummary;
  } catch {
    return `## Architecture overview\nRepository: **${repo.owner}/${repo.repoName}** (${(fileTree || []).length} files indexed).`;
  }
}

export async function generateArchitectureSummary(repo, fileTree) {
  const explanation = await generateArchitectureExplanation(repo, fileTree);
  return explanation.architectureSummary;
}

export async function generateArchitectureDiagram(repo, fileTree) {
  const explanation = await generateArchitectureExplanation(repo, fileTree);
  return explanation.architectureDiagram;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = LLM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`LLM request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function callLLM(prompt, { maxTokens = 1000, systemMessage, preferGemini = false, timeoutMs = LLM_TIMEOUT_MS } = {}) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!openaiKey && !geminiKey) {
    throw new AppError(ANALYSIS_FAILED_MESSAGE, 500);
  }

  const tryGemini = async () =>
    askGemini(prompt, geminiKey, { maxTokens, timeoutMs, systemMessage });
  const tryOpenAI = async () =>
    askOpenAI(prompt, openaiKey, { maxTokens, systemMessage, timeoutMs });

  try {
    if (preferGemini && geminiKey) {
      try {
        return await tryGemini();
      } catch (err) {
        console.error('Gemini failed:', err.message);
        if (!openaiKey) throw err;
        console.warn('Falling back to OpenAI…');
        return await tryOpenAI();
      }
    }

    if (openaiKey) {
      try {
        return await tryOpenAI();
      } catch (err) {
        console.error('OpenAI failed:', err.message);
        if (!geminiKey) throw err;
        console.warn('Falling back to Gemini…');
        return await tryGemini();
      }
    }

    return await tryGemini();
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('LLM API failure:', err.message);
    throw new AppError(ANALYSIS_FAILED_MESSAGE, 500);
  }
}

async function askOpenAI(prompt, apiKey, { maxTokens = 1000, systemMessage, timeoutMs = LLM_TIMEOUT_MS } = {}) {
  let response;
  try {
    response = await fetchWithTimeout(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            {
              role: 'system',
              content: systemMessage ||
                'You are a helpful software engineering assistant designed to answer questions based strictly on code snippets provided.'
            },
            { role: 'user', content: prompt }
          ],
          max_tokens: maxTokens,
          temperature: 0.1
        })
      },
      timeoutMs
    );
  } catch (err) {
    throw new Error(`OpenAI network error: ${err.message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenAI API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty/malformed response');
  }
  return content;
}

async function askGemini(
  prompt,
  apiKey,
  { maxTokens = 1000, timeoutMs = LLM_TIMEOUT_MS, systemMessage } = {}
) {
  const text = systemMessage
    ? `${systemMessage}\n\n---\n\n${prompt}`
    : prompt;
  let response;
  try {
    response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.1
          }
        })
      },
      timeoutMs
    );
  } catch (err) {
    throw new Error(`Gemini network error: ${err.message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Gemini API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    throw new Error('Gemini returned empty/malformed response');
  }
  return content;
}
