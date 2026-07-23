/**
 * OpenAI client — gpt-4o-mini only (Request Flow generation).
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
export const REQUEST_FLOW_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 25000;

export interface OpenAIChatOptions {
  systemMessage?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  apiKey?: string;
  model?: string;
  /** When 'json_object', asks the API for a JSON object response. */
  responseFormat?: 'json_object' | 'text';
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`OpenAI request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call OpenAI Chat Completions with gpt-4o-mini.
 */
export async function callOpenAIChat(
  userPrompt: string,
  options: OpenAIChatOptions = {}
): Promise<string> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const model = options.model || REQUEST_FLOW_OPENAI_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const body: Record<string, unknown> = {
    model,
    messages: [
      ...(options.systemMessage
        ? [{ role: 'system' as const, content: options.systemMessage }]
        : []),
      { role: 'user', content: userPrompt }
    ],
    max_tokens: options.maxTokens ?? 1200,
    temperature: options.temperature ?? 0.1
  };

  if (options.responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetchWithTimeout(
    OPENAI_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    },
    timeoutMs
  );

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`OpenAI API error ${response.status}: ${errBody.slice(0, 240)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) {
    throw new Error('OpenAI returned empty response');
  }
  return content;
}
