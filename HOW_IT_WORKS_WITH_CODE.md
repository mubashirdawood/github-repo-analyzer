# GitLens.ai — How It Works (With Code + File Paths)

This guide explains **how each feature is actually implemented**, with short syntax snippets and the exact file where that code lives.

Companion overview (file list / flows without deep code): `PROJECT_CODEBASE_GUIDE.md`

---

## 0. Big picture in one sentence

**React pages** call functions in `client/src/api.js` → **Express** mounts routes in `server/server.js` → **controllers** call **services** → data lands in **Mongo models**; GitHub + OpenAI/Gemini are external APIs.

```
Landing / Login / Analyze / RepoPage
        │
        ▼
client/src/api.js   (fetch + JWT)
        │
        ▼
server/server.js    app.use('/api/...')
        │
        ▼
routes → controllers → services → models
```

---

## 1. App boot: how client and server start

### Client entry

`client/src/main.jsx` mounts React with router + toasts:

```jsx
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
```

### Route table + “is user logged in?”

`client/src/App.jsx` — public pages are open; private pages wrap children in `ProtectedRoute`:

```jsx
function ProtectedRoute({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  return children
}

// e.g.
<Route path="/dashboard" element={
  <ProtectedRoute><DashboardPage /></ProtectedRoute>
} />
```

`isAuthenticated()` is just “do we have a token in localStorage?” — see §2.

### Server entry + route mounting

`server/server.js` wires middleware, then mounts APIs:

```js
app.use('/api/auth', authRoutes);
app.use('/api/contact', sensitiveAuthRateLimiter, contactRoutes);
app.use('/api/repos', requireAuth, repoRoutes);           // ALL repo routes need JWT
app.use('/api/repositories', requireAuth, repositoryRoutes);
app.use(errorHandler);  // must be last
```

So: anything under `/api/repos` automatically runs `requireAuth` first.

---

## 2. How auth tokens work on the client

**File:** `client/src/api.js`

### Store / read token

```js
const TOKEN_KEY = 'devlens_token';

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function isAuthenticated() {
  return Boolean(getToken());
}
```

### Attach Bearer header on every API call

```js
function authHeaders(includeJson = true) {
  const headers = {};
  if (includeJson) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
```

### Auto-refresh on 401

If the access token expires, `apiFetch` tries refresh once, then retries:

```js
if (response.status === 401 && !retried && !String(url).includes('/api/auth/refresh')) {
  const ok = await attemptTokenRefresh();
  if (ok) return run(true);
}
```

`attemptTokenRefresh()` posts to `/api/auth/refresh` with cookie + optional body `refreshToken`, then `setAuthSession(data)`.

---

## 3. How login / signup is done (server)

### Route wiring

**File:** `server/routes/authRoutes.js`

```js
router.post('/signup', sensitiveAuthRateLimiter, asyncHandler(signup));
router.post('/login', loginRateLimiter, asyncHandler(login));
```

`asyncHandler` (`server/middleware/errorHandler.js`) catches async throws so Express error middleware can respond.

### Sign JWT after login

**File:** `server/controllers/authController.js`

```js
function signToken(userId, { sessionId, expiresIn } = {}) {
  const payload = { userId: String(userId) };
  if (sessionId) payload.sid = String(sessionId);
  return jwt.sign(payload, secret, {
    expiresIn: expiresIn || resolveTokenExpiry(false),
    algorithm: 'HS256',
  });
}
```

Payload shape: `{ userId, sid? }`. Expiry comes from `server/utils/authCookies.js` (`24h` or `30d` for remember-me).

### Create device session + hashed refresh token

**File:** `server/services/sessionService.js`

```js
const rawRefreshToken = crypto.randomBytes(48).toString('hex');

const session = await UserSession.create({
  userId,
  device, browser, os, ip,
  refreshToken: hashRefreshToken(rawRefreshToken), // SHA-256 only in DB
  expiresAt,
  rememberMe: Boolean(options.rememberMe),
});

return { session, refreshToken: rawRefreshToken }; // raw sent to client once
```

### Email verification token (never store raw)

**File:** `server/controllers/authController.js`

```js
function createSecureToken(ttlMs) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expires = new Date(Date.now() + ttlMs);
  return { rawToken, tokenHash, expires };
}
```

Signup saves `tokenHash` on `User`; email link contains `rawToken`. Verify route hashes the URL token and looks up the user.

### Password hashing

Same controller uses:

```js
const passwordHash = await bcrypt.hash(password, 12); // SALT_ROUNDS = 12
const match = await bcrypt.compare(password, user.passwordHash);
```

### Client login call

**File:** `client/src/api.js`

```js
export async function login(email, password, rememberMe = false) {
  const response = await apiFetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password, rememberMe: Boolean(rememberMe) })
  });
  return handleResponse(response, 'Failed to log in');
}
```

UI (`client/src/components/AuthPage.jsx`) then typically calls `setAuthSession({ token, refreshToken, sessionId })` with the JSON response.

---

## 4. How protected APIs check “who is this?”

**File:** `server/middleware/authMiddleware.js`

```js
function extractAccessToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  // fallback: httpOnly cookie named gitlens_access
  return req.cookies?.[ACCESS_COOKIE] || null;
}

export async function requireAuth(req, res, next) {
  const token = extractAccessToken(req);
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  req.userId = decoded.userId;
  req.sessionId = decoded.sid || null;

  if (req.sessionId) {
    const check = await validateAndTouchSession(req.sessionId, req.userId);
    if (!check.ok) return res.status(401).json({ error: 'Invalid or expired token' });
  }
  next();
}
```

Controllers then filter Mongo by ownership, e.g. `Repo.findOne({ _id: id, userId: req.userId })`.

---

## 5. How analyzing a GitHub repo is done

### Step A — UI → API

**File:** `client/src/api.js`

```js
export async function analyzeRepository(githubUrl) {
  const response = await apiFetch(`${API_BASE_URL}/api/repos/analyze`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ githubUrl })
  });
  return handleResponse(response, 'Failed to analyze repository');
}
```

Triggered from `client/src/pages/AnalyzePage.jsx`, then navigate to `/repo/:repoId`.

### Step B — route → controller

**File:** `server/routes/repoRoutes.js`

```js
router.post('/analyze', asyncHandler(analyzeRepo));
```

**File:** `server/controllers/repoController.js`

```js
export async function analyzeRepo(req, res) {
  const { githubUrl } = req.body;
  const { owner, repoName, fileTree, truncated, commitSha } =
    await getRepoContents(githubUrl);

  const cached = commitSha
    ? await findAnalysisBySha(owner, repoName, commitSha)
    : null;

  const repo = new Repo({
    userId: req.userId,
    githubUrl, owner, repoName, fileTree, truncated, commitSha,
    status: cached ? 'analyzed' : 'pending',
    architectureSummary: cached?.architectureSummary || null,
    diagramSyntax: cached?.architectureDiagram || null,
    // ...
  });
  await repo.save();
  return res.status(201).json({ repoId: repo._id, fileTree, /* ... */ });
}
```

### Step C — fetch GitHub tree

**File:** `server/services/githubService.js`

```js
export async function getRepoContents(url) {
  const { owner, repo } = parseGitHubUrl(url);

  // 1) repo metadata → default_branch
  const metaResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });

  // 2) recursive git tree
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`;
  const treeData = await (await fetch(treeUrl, { headers })).json();

  // 3) filter node_modules, images, huge files, etc.
  // 4) truncateFileTree(..., 300)  // keep max 300 priority files
  return { owner, repoName: repo, fileTree, truncated, commitSha };
}
```

`parseGitHubUrl` accepts `https://github.com/owner/repo`, `git@...`, or `owner/repo`.

Model shape for the saved tree: `server/models/Repo.js` → `fileTree: [{ path, type, sizeBytes }]`.

---

## 6. How architecture diagrams are generated + cached

### Client request

**File:** `client/src/api.js`

```js
export async function fetchArchitecture(repoId) {
  const response = await apiFetch(`${API_BASE_URL}/api/repos/${repoId}/architecture`, {
    method: 'POST',
    headers: authHeaders(),
    // AbortController timeout ~35s
  });
  return handleResponse(response, 'Failed to fetch architecture');
}
```

Used by `client/src/pages/RepoPage.jsx`.

### Server cache rule

**File:** `server/controllers/repoController.js` → `getArchitectureSummary`

Conceptually:

```js
commitSha = await getRepoHeadSha(repo.owner, repo.repoName);
cached = await findAnalysisBySha(repo.owner, repo.repoName, commitSha);
if (cached) return toArchitectureResponse(cached, { cached: true });

// miss → generate
explanation = await generateArchitectureExplanation(repo, repo.fileTree);
await saveRepositoryAnalysis({ owner, repoName, commitSha, ...explanation });
```

Cache helpers: `server/services/analysisCacheService.js`  
Unique key in model: `server/models/RepositoryAnalysis.js`

```js
repositoryAnalysisSchema.index(
  { owner: 1, repoName: 1, commitSha: 1 },
  { unique: true }
);
```

### Intelligence pipeline (the real “how diagrams are built”)

**File:** `server/services/intelligence/pipeline.ts`

```ts
const scanner = analyzeRepository({ fileTree, fileContents, owner, repoName });

const graph = buildRepositoryGraph({
  files: scanner.files,
  fileContents,
  entryFiles: scanner.entryFiles,
  maxFilesToParse: 80
});

const architectureContext = buildArchitectureContext(scanner, { /* ... */ });
const requestFlows = analyzeRequestFlows({ files, fileContents, /* ... */ });

const localExplanation = explainArchitectureFromMetadata(scanner, {
  fileContents, context: architectureContext, graph, flows: requestFlows
});

// Mermaid from metadata (no inventing files)
const architectureDiagram =
  localExplanation.architectureDiagram ||
  generateArchitectureMermaid(scanner, { context: architectureContext, maxNodes: 40 });

// Optional LLM polish of the prose summary only
if (input.callLlm) {
  const raw = await input.callLlm(userPrompt, systemMessage);
  architectureSummary = mergeArchitectLlmResponse(...).architectureSummary;
}
```

Entry barrel: `server/services/intelligence/index.ts`  
LLM wrapper that feeds `callLlm`: `server/services/llmService.js` → `generateArchitectureExplanation`.

### Render Mermaid in UI

- `client/src/components/ArchitectureDiagram.jsx` wraps viewer  
- `client/src/components/MermaidViewer.jsx` calls Mermaid lib  
- `client/src/utils/mermaidSafe.js` sanitizes syntax before render  
- Interactive zoom/download: `client/src/components/InteractiveMermaidViewer.jsx`

---

## 7. How Ask / Explain (Q&A) works

### Client

**File:** `client/src/api.js`

```js
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
```

### Server controller

**File:** `server/controllers/repoController.js`

```js
export async function askRepoQuestion(req, res) {
  const { question, mode } = req.body;
  const repo = await Repo.findOne({ _id: id, userId: req.userId });

  const matchingPaths = findRelevantFiles(repo.fileTree, question, 6, {
    prioritizeFilenames: mode === 'explain'
  });

  const files = [];
  for (const path of matchingPaths) {
    const content = await getFileContent(repo.owner, repo.repoName, path, repo._id);
    if (content !== null) files.push({ path, content });
  }

  const answer = await askQuestion(question, files, {
    mode: mode === 'explain' ? 'explain' : 'ask'
  });

  await new Question({ repoId: repo._id, question, answer, filesUsed }).save();
  return res.json({ answer, filesUsed });
}
```

### Pick which files matter

**File:** `server/services/retrievalService.js`

```js
export function findRelevantFiles(fileTree, question, maxFiles = 6, options = {}) {
  // tokenize question, drop stopwords
  // score paths using keywords + clusters like:
  //   auth → login, jwt, session, ...
  //   payment → stripe, checkout, ...
  // overview questions → sampleRepresentativeFiles(...)
}
```

### Fetch file text (cache first)

**File:** `server/services/githubService.js` → `getFileContent`

Typical pattern: look up `FileCache` by `(repoId, path)` → if miss, GitHub Contents API → save to `server/models/FileCache.js`.

### Call LLM

**File:** `server/services/llmService.js`

```js
export async function askQuestion(question, files, options = {}) {
  // build prompt with --- FILE: path --- blocks (truncated per file)
  return callLLM(prompt, {
    systemMessage: mode === 'explain' ? ASK_SYSTEM_EXPLAIN : ASK_SYSTEM_DEFAULT,
    maxTokens: mode === 'explain' ? 1100 : 900,
  });
}

async function callLLM(prompt, opts) {
  // Prefer OPENAI_API_KEY → gpt-4o-mini
  // On failure, fall back to GEMINI_API_KEY → gemini-2.0-flash
}
```

OpenAI call shape (same file):

```js
await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: prompt }
    ]
  })
});
```

---

## 8. How request-flow diagrams work (SSE progress)

### Routes

**File:** `server/routes/repositoryRoutes.js`

```js
router.get('/:id/request-flows', asyncHandler(getCachedRequestFlows));
router.post('/:id/request-flows', asyncHandler(createRequestFlows));
router.delete('/:id/request-flows', asyncHandler(deleteRequestFlowsCache));
```

Mounted at `/api/repositories` in `server/server.js`.

### Generate with optional Server-Sent Events

**File:** `server/controllers/requestFlowController.js`

```js
if (!wantsEventStream(req)) {
  const result = await getOrGenerateRequestFlows(repo, { force, branch });
  return res.json(toSuccessPayload(result, { cached: result.cached }));
}

// SSE mode:
res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
writeSse(res, 'meta', { stages: REQUEST_FLOW_STAGES, ... });
await getOrGenerateRequestFlows(repo, {
  onProgress: (payload) => writeSse(res, 'progress', payload)
});
```

Stages defined in `server/services/requestFlowService.js`:

```js
export const REQUEST_FLOW_STAGES = [
  { id: 'scanning_routes', label: 'Scanning routes...', weight: 20 },
  { id: 'detecting_modules', label: 'Detecting modules...', weight: 25 },
  { id: 'building_diagram', label: 'Building request flow diagram...', weight: 30 },
  { id: 'summarizing', label: 'Writing analysis summary...', weight: 15 },
  { id: 'caching', label: 'Caching results...', weight: 10 }
];
```

### Inside generation

Same service:

1. Load route/controller/service files via GitHub/`FileCache`
2. `scanExpressRoutes({ files, fileContents })` — also Nest/Next parsers under `intelligence/flows/`
3. `analyzeRepository` + `buildArchitectureContext`
4. `generateComprehensiveRequestFlow` → Mermaid string
5. `ensureValidRequestFlowMermaid` validates / fixes
6. Upsert `RequestFlowAnalysis` (`server/models/RequestFlowAnalysis.js`)

UI: `client/src/components/RequestFlowPanel.jsx` + `RequestFlowProgress.jsx`  
Client stream helper: `generateRequestFlowsStream` in `client/src/api.js`.

---

## 9. How emails are sent

**File:** `server/services/mailService.js`

```js
function createTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },  // EMAIL_USER / EMAIL_PASS from .env
    lookup: ipv4Lookup,    // force IPv4 (avoids IPv6 reachability issues)
  });
}
```

Used for:

- Contact form → `controllers/contactController.js` → `sendContactEmail`
- Signup / resend → `sendVerificationEmail` from `authController.js`
- Forgot password → `sendPasswordResetEmail`

Contact route: `server/routes/contactRoutes.js` → `POST /api/contact`.

---

## 10. How errors become clean JSON

**File:** `server/errors/AppError.js`

```js
export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // safe to show to client
  }
}
```

**File:** `server/middleware/errorHandler.js`

```js
export function errorHandler(err, req, res, next) {
  const statusCode = isDbOffline ? 503 : err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal server error';
  return res.status(statusCode).json({ error: message });
}
```

Controllers throw `new AppError('Repository not found', 404)` instead of leaking stack traces.

---

## 11. How rate limiting is applied

**File:** `server/middleware/rateLimit.js`

```js
const isProd = process.env.NODE_ENV === 'production';

export const loginRateLimiter = isProd
  ? rateLimit({ windowMs: 15 * 60 * 1000, max: 40, message: { error: '...' } })
  : passthrough; // local/dev: unlimited
```

Attached in `authRoutes.js` and on `/api/contact` in `server.js`.

---

## 12. How cookies vs localStorage both work

**File:** `server/utils/authCookies.js`

```js
export const ACCESS_COOKIE = 'gitlens_access';
export const REFRESH_COOKIE = 'gitlens_refresh';

export function setAuthCookies(res, { accessToken, refreshToken, rememberMe }) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true, secure: isSecureCookie(), sameSite: 'lax', path: '/', maxAge
  });
  // same for REFRESH_COOKIE
}
```

Client also keeps tokens in localStorage (`devlens_*` keys in `api.js`) for `Authorization: Bearer` — dual support.

---

## 13. Feature → primary files cheat sheet

| Feature | Start here | Then goes to |
|---------|------------|--------------|
| Routing UI | `client/src/App.jsx` | `client/src/pages/*` |
| All HTTP calls | `client/src/api.js` | Express routes |
| Mount APIs | `server/server.js` | `server/routes/*` |
| Signup/login | `server/controllers/authController.js` | `User` model, `mailService`, `sessionService` |
| JWT gate | `server/middleware/authMiddleware.js` | controllers via `req.userId` |
| Paste GitHub URL | `repoController.analyzeRepo` | `githubService.getRepoContents` |
| Architecture | `repoController.getArchitectureSummary` | `llmService` + `intelligence/pipeline.ts` |
| Ask chat | `repoController.askRepoQuestion` | `retrievalService` → `llmService.askQuestion` |
| Request flows | `requestFlowController.js` | `requestFlowService.js` + `intelligence/flows/*` |
| Mermaid UI | `MermaidViewer.jsx` | `mermaidSafe.js` |
| Sessions UI | `SecurityPage.jsx` / `SettingsPage.jsx` | `/api/auth/sessions` |

---

## 14. One full walkthrough (example)

**User asks “How does login work?” on a repo workspace**

1. `RepoPage.jsx` calls `askQuestion(repoId, "How does login work?")`  
   → `client/src/api.js`
2. `POST /api/repos/:id/ask` with Bearer token  
   → `server/routes/repoRoutes.js` → `askRepoQuestion`
3. `requireAuth` already set `req.userId`  
   → `server/middleware/authMiddleware.js`
4. `findRelevantFiles(fileTree, question)` scores paths like `authController.js`, `authRoutes.js`  
   → `server/services/retrievalService.js`
5. `getFileContent(...)` loads text (Mongo cache or GitHub)  
   → `server/services/githubService.js`
6. `askQuestion(question, files)` builds prompt + calls OpenAI/Gemini  
   → `server/services/llmService.js`
7. Answer saved in `Question` model and returned as `{ answer, filesUsed }`  
   → `server/models/Question.js`
8. UI renders markdown answer (react-markdown on RepoPage)

---

*This file is documentation only — no application code was changed to create it.*
