const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const TOKEN_KEY = 'devlens_token';
const REFRESH_KEY = 'devlens_refresh';
const SESSION_KEY = 'devlens_session_id';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function getSessionId() {
  return localStorage.getItem(SESSION_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Persist access token + optional session fields (backward compatible with token-only). */
export function setAuthSession({ token, refreshToken, sessionId }) {
  if (token) setToken(token);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  else localStorage.removeItem(REFRESH_KEY);
  if (sessionId) localStorage.setItem(SESSION_KEY, sessionId);
  else localStorage.removeItem(SESSION_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(SESSION_KEY);
}

export function isAuthenticated() {
  return Boolean(getToken());
}

function authHeaders(includeJson = true) {
  const headers = {};
  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/** Default fetch options — include cookies for httpOnly auth when present. */
let refreshInFlight = null;

async function attemptTokenRefresh() {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    });
    if (!response.ok) return false;
    const data = await response.json().catch(() => null);
    if (!data?.token) return false;
    setAuthSession(data);
    return true;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

function apiFetch(url, options = {}) {
  const run = async (retried) => {
    const headers = { ...(options.headers || {}) };
    if (retried && headers.Authorization) {
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      credentials: 'include',
      ...options,
      headers,
    });

    if (response.status === 401 && !retried && !String(url).includes('/api/auth/refresh')) {
      const ok = await attemptTokenRefresh();
      if (ok) return run(true);
    }

    return response;
  };

  return run(false);
}

/**
 * Shared response handler — clears auth and notifies the app on 401.
 */
async function handleResponse(response, fallbackMessage) {
  if (response.status === 401) {
    clearToken();
    window.dispatchEvent(new Event('auth:logout'));
    if (!window.location.pathname.startsWith('/login')) {
      window.location.assign('/login');
    }
    const errorDetails = await response.json().catch(() => ({}));
    throw new Error(errorDetails.error || 'Session expired. Please log in again.');
  }

  if (!response.ok) {
    const errorDetails = await response.json().catch(() => ({}));
    const error = new Error(errorDetails.error || errorDetails.message || fallbackMessage);
    if (errorDetails.requiresVerification) {
      error.requiresVerification = true;
    }
    throw error;
  }

  return response.json();
}

/**
 * POST /api/auth/signup
 */
export async function signup(email, password) {
  const response = await apiFetch(`${API_BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password })
  });

  return handleResponse(response, 'Failed to create account');
}

/**
 * POST /api/auth/login
 * @param {boolean} [rememberMe=false] — 30d JWT when true, 24h when false
 */
export async function login(email, password, rememberMe = false) {
  const response = await apiFetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password, rememberMe: Boolean(rememberMe) })
  });

  return handleResponse(response, 'Failed to log in');
}

/**
 * POST /api/auth/resend-verification
 */
export async function resendVerification(email) {
  const response = await apiFetch(`${API_BASE_URL}/api/auth/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });

  return handleResponse(response, 'Failed to resend verification email');
}

/**
 * POST /api/auth/forgot-password
 */
export async function forgotPassword(email) {
  const response = await apiFetch(`${API_BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });

  return handleResponse(response, 'Failed to send password reset email');
}

/**
 * POST /api/auth/reset-password/:token
 */
export async function resetPassword(token, password) {
  const response = await apiFetch(
    `${API_BASE_URL}/api/auth/reset-password/${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    }
  );

  return handleResponse(response, 'Failed to reset password');
}

/**
 * GET /api/auth/sessions — active devices
 */
export async function listSessions() {
  const response = await apiFetch(`${API_BASE_URL}/api/auth/sessions`, {
    method: 'GET',
    headers: authHeaders(false),
  });
  return handleResponse(response, 'Failed to load sessions');
}

/**
 * DELETE /api/auth/sessions/:id — logout one device
 */
export async function logoutSession(sessionId) {
  const response = await apiFetch(
    `${API_BASE_URL}/api/auth/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(false),
    }
  );
  return handleResponse(response, 'Failed to log out device');
}

/**
 * DELETE /api/auth/sessions — logout all devices
 */
export async function logoutAllSessions() {
  const response = await apiFetch(`${API_BASE_URL}/api/auth/sessions`, {
    method: 'DELETE',
    headers: authHeaders(false),
  });
  return handleResponse(response, 'Failed to log out all devices');
}

/**
 * POST /api/auth/logout — logout current device session
 */
export async function logoutCurrentSession() {
  const response = await apiFetch(`${API_BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: authHeaders(false),
  });
  // Even if the request fails (legacy token / offline), client still clears local auth.
  if (response.status === 401) {
    clearToken();
    return { message: 'Logged out' };
  }
  if (!response.ok) {
    clearToken();
    return { message: 'Logged out locally' };
  }
  return response.json().catch(() => ({ message: 'Logged out' }));
}

/** GET /api/auth/me */
export async function getAccount() {
  const response = await apiFetch(`${API_BASE_URL}/api/auth/me`, {
    method: 'GET',
    headers: authHeaders(false),
  });
  return handleResponse(response, 'Failed to load account');
}

/** PATCH /api/auth/password */
export async function changePassword({ currentPassword, newPassword }) {
  const response = await apiFetch(`${API_BASE_URL}/api/auth/password`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return handleResponse(response, 'Failed to change password');
}

/** PATCH /api/auth/email */
export async function changeEmail({ email, password }) {
  const response = await apiFetch(`${API_BASE_URL}/api/auth/email`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(response, 'Failed to change email');
}

/** POST /api/auth/resend-verification-me */
export async function resendMyVerification() {
  const response = await apiFetch(`${API_BASE_URL}/api/auth/resend-verification-me`, {
    method: 'POST',
    headers: authHeaders(false),
  });
  return handleResponse(response, 'Failed to resend verification');
}

/** GET /api/auth/activity */
export async function getSecurityActivity(limit = 30) {
  const response = await apiFetch(
    `${API_BASE_URL}/api/auth/activity?limit=${encodeURIComponent(limit)}`,
    {
      method: 'GET',
      headers: authHeaders(false),
    }
  );
  return handleResponse(response, 'Failed to load security activity');
}

/** GET /api/auth/export — triggers JSON download */
export async function exportAccountData() {
  const response = await apiFetch(`${API_BASE_URL}/api/auth/export`, {
    method: 'GET',
    headers: authHeaders(false),
  });

  if (response.status === 401) {
    clearToken();
    window.dispatchEvent(new Event('auth:logout'));
    window.location.assign('/login');
    throw new Error('Session expired. Please log in again.');
  }

  if (!response.ok) {
    const errorDetails = await response.json().catch(() => ({}));
    throw new Error(errorDetails.error || 'Failed to export account data');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gitlens-account-export-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { ok: true };
}

/** DELETE /api/auth/account */
export async function deleteAccount({ password, confirmation } = {}) {
  const response = await apiFetch(`${API_BASE_URL}/api/auth/account`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ password, confirmation }),
  });
  return handleResponse(response, 'Failed to delete account');
}

/**
 * POST /api/contact — public landing-page contact form
 */
export async function sendContact({ name, email, message }) {
  const response = await apiFetch(`${API_BASE_URL}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, message }),
  });

  return handleResponse(response, 'Failed to send message');
}

/**
 * GET /api/repos — list current user's repos (summary fields)
 */
export async function listRepos() {
  const response = await apiFetch(`${API_BASE_URL}/api/repos`, {
    method: 'GET',
    headers: authHeaders()
  });

  return handleResponse(response, 'Failed to list repositories');
}

/**
 * GET /api/repos/:id — load one repo including fileTree
 */
export async function getRepo(repoId) {
  const response = await apiFetch(`${API_BASE_URL}/api/repos/${repoId}`, {
    method: 'GET',
    headers: authHeaders()
  });

  return handleResponse(response, 'Failed to load repository');
}

/**
 * DELETE /api/repos/:id — delete repo and all related data
 * @param {string} repoId
 * @returns {Promise<{ok: boolean, deleted: object}>}
 */
export async function deleteRepo(repoId) {
  const response = await apiFetch(`${API_BASE_URL}/api/repos/${repoId}`, {
    method: 'DELETE',
    headers: authHeaders(false)
  });

  return handleResponse(response, 'Failed to delete repository');
}

/**
 * Sends a repo URL to be analyzed by the server.
 * @param {string} githubUrl
 * @returns {Promise<{repoId: string, fileTree: Array}>}
 */
export async function analyzeRepository(githubUrl) {
  const response = await apiFetch(`${API_BASE_URL}/api/repos/analyze`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ githubUrl })
  });

  return handleResponse(response, 'Failed to analyze repository');
}

/**
 * Submits a question about the repository to the server.
 * @param {string} repoId
 * @param {string} question
 * @param {{ mode?: 'explain' }} [options]
 * @returns {Promise<{answer: string, filesUsed: Array<string>}>}
 */
export async function askQuestion(repoId, question, options = {}) {
  const response = await apiFetch(`${API_BASE_URL}/api/repos/${repoId}/ask`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      question,
      ...(options.mode ? { mode: options.mode } : {})
    })
  });

  return handleResponse(response, 'Failed to process question');
}

/**
 * Fetches architecture summary + Mermaid diagrams for a repo.
 * Server caches by GitHub commit SHA in `repository_analysis` (unchanged SHA → no regenerate).
 * @param {string} repoId
 * @returns {Promise<{architectureSummary: string, architectureDiagram?: string, diagramSyntax: string, requestFlowDiagram?: string, repositoryGraph?: object|null, commitSha?: string|null, analyzedAt?: string|null, cached?: boolean}>}
 */
export async function fetchArchitecture(repoId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);

  try {
    const response = await apiFetch(`${API_BASE_URL}/api/repos/${repoId}/architecture`, {
      method: 'POST',
      headers: authHeaders(),
      signal: controller.signal
    });

    return await handleResponse(response, 'Failed to load architecture');
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Architecture generation timed out — please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /api/repositories/:id/request-flows — cached comprehensive request flow
 * @returns {Promise<{success: boolean, requestFlow: object|null, cached?: boolean}>}
 */
export async function getRequestFlows(repoId) {
  const response = await apiFetch(`${API_BASE_URL}/api/repositories/${repoId}/request-flows`, {
    method: 'GET',
    headers: authHeaders()
  });

  return handleResponse(response, 'Failed to load request flows');
}

/**
 * POST /api/repositories/:id/request-flows — generate or serve cache
 * @param {string} repoId
 * @param {{ force?: boolean, branch?: string }} [options]
 * @returns {Promise<{success: boolean, requestFlow: object|null, cached?: boolean}>}
 */
export async function generateRequestFlows(repoId, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await apiFetch(`${API_BASE_URL}/api/repositories/${repoId}/request-flows`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        ...(options.force ? { force: true } : {}),
        ...(options.branch ? { branch: options.branch } : {})
      }),
      signal: controller.signal
    });

    return await handleResponse(response, 'Failed to generate request flows');
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request flow generation timed out — please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST /api/repositories/:id/request-flows as SSE progress stream.
 * @param {string} repoId
 * @param {{
 *   force?: boolean,
 *   branch?: string,
 *   signal?: AbortSignal,
 *   onProgress?: (event: object) => void,
 *   onMeta?: (event: object) => void
 * }} [options]
 * @returns {Promise<{success: boolean, requestFlow: object|null, cached?: boolean, stats?: object}>}
 */
export async function generateRequestFlowsStream(repoId, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300000);

  const onAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const response = await apiFetch(`${API_BASE_URL}/api/repositories/${repoId}/request-flows`, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        Accept: 'text/event-stream'
      },
      body: JSON.stringify({
        stream: true,
        ...(options.force ? { force: true } : {}),
        ...(options.branch ? { branch: options.branch } : {})
      }),
      signal: controller.signal
    });

    if (response.status === 401) {
      clearToken();
      window.dispatchEvent(new Event('auth:logout'));
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
      throw new Error('Session expired. Please log in again.');
    }

    if (!response.ok) {
      const errorDetails = await response.json().catch(() => ({}));
      throw new Error(errorDetails.error || errorDetails.message || 'Failed to generate request flows');
    }

    if (!response.body) {
      throw new Error('Streaming is not supported in this browser.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completePayload = null;

    const dispatchBlock = (block) => {
      const lines = block.split(/\r?\n/);
      let eventName = 'message';
      const dataLines = [];
      for (const line of lines) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) return;
      let data;
      try {
        data = JSON.parse(dataLines.join('\n'));
      } catch {
        return;
      }

      if (eventName === 'meta') options.onMeta?.(data);
      else if (eventName === 'progress') options.onProgress?.(data);
      else if (eventName === 'complete') {
        completePayload = data;
        options.onProgress?.({
          type: 'progress',
          stage: 'caching',
          label: 'Caching results...',
          progress: 100,
          status: 'done',
          stats: data.stats,
          elapsedMs: data.elapsedMs
        });
      } else if (eventName === 'error') {
        throw new Error(data.error || 'Request flow generation failed');
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\n\n/);
      buffer = parts.pop() || '';
      for (const part of parts) {
        if (part.trim()) dispatchBlock(part);
      }
    }
    if (buffer.trim()) dispatchBlock(buffer);

    if (!completePayload) {
      throw new Error('Analysis stream ended without a result.');
    }

    return completePayload;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request flow generation was cancelled or timed out.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (options.signal) options.signal.removeEventListener('abort', onAbort);
  }
}
