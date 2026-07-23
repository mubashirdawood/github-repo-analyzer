cv # GitLens.ai — Full Project Codebase Guide

> Generated documentation of the existing codebase. **No application code was modified** to produce this file.
>
> Product name in UI: **GitLens.ai** · npm package root: `gitlens-ai` · DB default: `devlens-ai`

---

## 1. What This Product Is

GitLens.ai is a **MERN** app that:

1. Lets users **sign up / log in** (email + password, verification, sessions).
2. Accepts a **public GitHub repository URL**.
3. Fetches the **file tree** from GitHub.
4. Runs a **Repository Intelligence Engine** (structural analysis + optional LLM polish).
5. Shows **architecture diagrams** (Mermaid), **request-flow diagrams**, and a **Q&A** chat over relevant source files.
6. Caches analysis by **commit SHA** so unchanged repos are not re-analyzed.

---

## 2. High-Level Architecture

```
┌─────────────────────┐         HTTP / JSON / SSE         ┌──────────────────────────┐
│  client/ (Vite+React)│ ◄──────────────────────────────► │  server/ (Express+tsx)   │
│  localhost:5173      │     Bearer JWT + httpOnly cookies │  localhost:5000          │
└─────────────────────┘                                   └────────────┬─────────────┘
                                                                       │
                         ┌─────────────────────────────────────────────┼─────────────────┐
                         ▼                                             ▼                 ▼
                   MongoDB (Mongoose)                           GitHub API          OpenAI / Gemini
                   users, sessions, repos,                      file tree +         (Q&A + optional
                   caches, login audits                         file contents        architecture polish)
```

| Layer | Path | Role |
|-------|------|------|
| Root monorepo scripts | `/package.json` | `install-all`, concurrent `dev` (client + server) |
| Backend API | `/server` | Express routes, auth, GitHub fetch, intelligence, LLM, mail |
| Frontend SPA | `/client` | React Router pages, Mermaid viewers, API client |

---

## 3. How to Run (context only)

From repo root:

```bash
npm run install-all
cp server/.env.example server/.env   # fill secrets
npm run dev
```

- **Client:** Vite on `http://localhost:5173`
- **API:** Express on `http://localhost:5000`
- **Health:** `GET /api/health`

Before `dev`, `server/scripts/free-port.js` kills anything already listening on `PORT` (avoids `EADDRINUSE`).

---

## 4. Environment Variables (`server/.env`)

| Variable | Purpose |
|----------|---------|
| `PORT` | API port (default `5000`) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | HS256 signing key (≥32 chars required in production) |
| `CLIENT_URL` | Frontend origin(s) for CORS + email redirects |
| `COOKIE_SECURE` | Force secure cookies (`true`/`false`) |
| `TRUST_PROXY` | Trust `X-Forwarded-For` behind nginx/Cloudflare |
| `API_PUBLIC_URL` | Public API base used in verification email links |
| `EMAIL_USER` / `EMAIL_PASS` | Gmail SMTP (contact + verification + reset) |
| `GITHUB_TOKEN` | Optional PAT to raise GitHub rate limits |
| `OPENAI_API_KEY` | Preferred LLM (`gpt-4o-mini`) |
| `GEMINI_API_KEY` | Fallback LLM (`gemini-2.0-flash`) |

Client may set `VITE_API_BASE_URL` (defaults to `http://localhost:5000`).

---

## 5. End-to-End Feature Flows

### 5.1 Authentication flow

```
Signup
  → POST /api/auth/signup
  → bcrypt hash password (12 rounds)
  → create User (emailVerified=false)
  → store SHA-256(verificationToken), email raw token
  → no JWT until verified

Verify email
  → GET /api/auth/verify-email/:token  (API)
  → hash token, match User, set emailVerified=true
  → redirect to CLIENT_URL /verify-email/success|failed

Login
  → POST /api/auth/login
  → lockout after 5 failures (15 min)
  → audit LoginAttempt
  → create UserSession + refresh token (hashed in DB)
  → sign JWT { userId, sid }  (24h or 30d if rememberMe)
  → set httpOnly cookies + return tokens in JSON

Protected API
  → requireAuth middleware
  → Bearer header OR access cookie
  → verify JWT; if sid present, validate session still exists

Refresh
  → POST /api/auth/refresh
  → rotate refresh token, new access JWT

Logout
  → POST /api/auth/logout (current)
  → DELETE /api/auth/sessions/:id | DELETE /api/auth/sessions (all)
```

**Security notes baked into this flow:**

- Strong password rules (length, upper/lower/digit).
- Verification / reset tokens stored only as **SHA-256 hashes**.
- Timing-safe login for unknown emails (dummy bcrypt compare).
- Rate limits active only when `NODE_ENV=production`.
- Helmet, CORS allowlist, `express-mongo-sanitize`, body size `100kb`.

---

### 5.2 Analyze repository flow

```
User (AnalyzePage) enters GitHub URL
  → client api.analyzeRepository(url)
  → POST /api/repos/analyze  (auth required)
  → githubService.parseGitHubUrl + getRepoContents
       • GitHub Trees API (recursive)
       • filter ignored dirs/binaries
       • truncate to ≤300 priority files
       • resolve HEAD commit SHA
  → findAnalysisBySha(owner, repo, sha)  // cache reuse
  → create Repo document for this user
       status: 'analyzed' if cache hit, else 'pending'
  → return { repoId, fileTree, truncated, commitSha, analysisCached }
  → client navigates to /repo/:id
```

Architecture diagrams are **not** fully generated in this step unless cache already exists; the repo workspace then requests architecture / request-flows separately.

---

### 5.3 Architecture summary flow

```
RepoPage → fetchArchitecture(repoId)
  → POST /api/repos/:id/architecture
  → resolve current GitHub HEAD SHA
  → CACHE HIT: repository_analysis for (owner, repoName, commitSha)
       → sync fields onto Repo, return diagrams
  → CACHE MISS:
       → llmService.generateArchitectureExplanation
            • fetch manifests + key sources via GitHub/FileCache
            • intelligence.runRepositoryPipeline
                 scanner → tech → graph → architecture context
                 → request flows → Mermaid diagrams
                 → optional LLM polish of summary
            • fallbacks if LLM fails (local Mermaid + text summary)
       → saveRepositoryAnalysis (upsert by SHA)
       → update Repo status='analyzed'
```

---

### 5.4 Ask / Explain Q&A flow (RAG-lite)

```
RepoPage chat → askQuestion(repoId, question, { mode })
  → POST /api/repos/:id/ask
  → retrievalService.findRelevantFiles(fileTree, question, 6)
       • keyword scoring + semantic clusters (auth, payment, db, …)
       • overview questions → sample representative files
       • explain mode → prioritize exact filenames
  → githubService.getFileContent (Mongo FileCache first, then GitHub)
  → llmService.askQuestion (OpenAI then Gemini fallback)
  → persist Question { question, answer, filesUsed }
  → return { answer, filesUsed }
```

---

### 5.5 Request-flow diagram flow

```
RequestFlowPanel
  → GET  /api/repositories/:id/request-flows   (cache only)
  → POST /api/repositories/:id/request-flows   (generate; optional SSE)

Server (requestFlowService.getOrGenerateRequestFlows)
  → check RequestFlowAnalysis cache by (repositoryId, commitSha)
  → on miss / force:
       stages (SSE progress):
         scanning_routes → detecting_modules → building_diagram
         → summarizing → caching
       • scan Express/Nest/Next routes (AST + regex)
       • build architecture context + stats
       • generateComprehensiveRequestFlow Mermaid
       • validate Mermaid; ensureValidRequestFlowMermaid fallback
       • upsert RequestFlowAnalysis
```

Legacy aliases still exist under `/api/repos/:id/request-flows`.

---

### 5.6 Contact form flow

```
Landing contact → POST /api/contact
  → validate name/email/message
  → mailService.sendContactEmail via Gmail SMTP
```

---

## 6. API Route Map

### Mounted in `server/server.js`

| Mount | Auth | Module |
|-------|------|--------|
| `/api/auth` | mixed | `routes/authRoutes.js` |
| `/api/contact` | public + rate limit | `routes/contactRoutes.js` |
| `/api/repos` | `requireAuth` | `routes/repoRoutes.js` |
| `/api/repositories` | `requireAuth` | `routes/repositoryRoutes.js` |
| `/api/health` | public | inline |
| `/` | public | inline status string |

### Auth routes (`/api/auth`)

| Method | Path | Handler | Notes |
|--------|------|---------|-------|
| POST | `/signup` | `signup` | sensitive rate limit |
| POST | `/login` | `login` | login rate limit |
| GET | `/verify-email/:token` | `verifyEmail` | redirects to client |
| POST | `/resend-verification` | `resendVerification` | |
| POST | `/forgot-password` | `forgotPassword` | |
| POST | `/reset-password/:token` | `resetPassword` | |
| POST | `/refresh` | `refreshAccessToken` | |
| GET | `/sessions` | `listSessions` | auth |
| DELETE | `/sessions/:id` | `logoutSession` | auth |
| DELETE | `/sessions` | `logoutAllSessions` | auth |
| POST | `/logout` | `logoutCurrent` | auth |
| GET | `/me` | `getAccount` | auth |
| PATCH | `/password` | `changePassword` | auth |
| PATCH | `/email` | `changeEmail` | auth |
| POST | `/resend-verification-me` | `resendMyVerification` | auth |
| GET | `/activity` | `getSecurityActivity` | auth |
| GET | `/export` | `exportAccountData` | auth |
| DELETE | `/account` | `deleteAccount` | auth |

### Repo routes (`/api/repos`)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/` | `listUserRepos` |
| POST | `/analyze` | `analyzeRepo` |
| GET | `/:id` | `getRepoById` |
| DELETE | `/:id` | `deleteRepo` |
| POST | `/:id/ask` | `askRepoQuestion` |
| POST | `/:id/architecture` | `getArchitectureSummary` |
| POST | `/:id/request-flows` | `getRequestFlows` (alias) |
| DELETE | `/:id/request-flows` | `invalidateRequestFlows` (alias) |

### Repository request-flow routes (`/api/repositories`)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/:id/request-flows` | `getCachedRequestFlows` |
| POST | `/:id/request-flows` | `createRequestFlows` (JSON or SSE) |
| DELETE | `/:id/request-flows` | `deleteRequestFlowsCache` |

---

## 7. Server — File-by-File

### 7.1 Entry & config

| File | What it does |
|------|----------------|
| `server/server.js` | Boots Express: Helmet, CORS, Morgan, JSON, cookies, mongo-sanitize; connects MongoDB; mounts routes; health check; centralized `errorHandler`; refuses weak `JWT_SECRET` in production. |
| `server/package.json` | ESM package; `tsx`/`nodemon` for JS+TS mix; deps for auth, mail, rate limit, Babel parser, etc. |
| `server/tsconfig.json` | Typecheck config for intelligence TypeScript modules. |
| `server/.env.example` | Template for all required secrets (do not commit real `.env`). |

### 7.2 Middleware & errors

| File | What it does |
|------|----------------|
| `middleware/authMiddleware.js` | `requireAuth` — extracts JWT from Bearer or cookie; verifies HS256; attaches `req.userId` / `req.sessionId`; validates live session when `sid` present. |
| `middleware/rateLimit.js` | `authRateLimiter`, `loginRateLimiter`, `sensitiveAuthRateLimiter` — real limits in production; no-ops in local/dev. |
| `middleware/errorHandler.js` | Maps operational `AppError` and DB-offline errors to JSON `{ error }`; `asyncHandler` wraps async routes. |
| `errors/AppError.js` | Operational error class (`statusCode`, `isOperational`) + shared analysis failure message constant. |

### 7.3 Routes

| File | What it does |
|------|----------------|
| `routes/authRoutes.js` | Wires auth/session/account controllers + rate limiters. |
| `routes/repoRoutes.js` | User repos: list, analyze, get, delete, ask, architecture, request-flows aliases. |
| `routes/repositoryRoutes.js` | Dedicated request-flow CRUD-style endpoints under `/api/repositories`. |
| `routes/contactRoutes.js` | `POST /` → contact form. |

### 7.4 Controllers

| File | What it does |
|------|----------------|
| `controllers/authController.js` | Signup, login (lockout + audit), email verify, resend verification, forgot/reset password, JWT signing helper. |
| `controllers/refreshController.js` | Refresh-token rotation → new access JWT + cookies. |
| `controllers/sessionController.js` | List devices, revoke one/all, logout current; clears cookies when needed. |
| `controllers/accountController.js` | Profile (`/me`), change password/email, security activity, GDPR-style export, account delete (cascades related data). |
| `controllers/repoController.js` | Core product: list/get/analyze/delete repos; ask Q&A; architecture generation/cache; request-flow aliases. |
| `controllers/requestFlowController.js` | Cache-aware request-flow get/generate/delete; Server-Sent Events progress streaming. |
| `controllers/contactController.js` | Validates and sends contact emails. |

### 7.5 Models (MongoDB)

| File | Collection / purpose |
|------|----------------------|
| `models/User.js` | Accounts: email, passwordHash, verification/reset token hashes, lockout fields, legacy Google fields. |
| `models/UserSession.js` | Per-device sessions; hashed refresh tokens; TTL index on `expiresAt`. |
| `models/LoginAttempt.js` | Login audit trail; auto-expire after ~90 days. |
| `models/Repo.js` | Per-user analyzed repo: URL, owner/name, fileTree, status, cached diagram fields, commitSha. |
| `models/Question.js` | Saved Q&A pairs + `filesUsed` paths. |
| `models/FileCache.js` | Cached GitHub file contents keyed by `(repoId, path)`. |
| `models/RepositoryAnalysis.js` | SHA-keyed architecture cache (`owner+repoName+commitSha` unique). |
| `models/RequestFlowAnalysis.js` | SHA-keyed comprehensive request-flow Mermaid + stats. |

### 7.6 Services (business logic)

| File | What it does |
|------|----------------|
| `services/githubService.js` | Parse GitHub URLs; fetch recursive tree; score/truncate files; get HEAD SHA; fetch file blobs; populate `FileCache`; typed errors for 404/private/rate-limit. |
| `services/retrievalService.js` | Keyword + cluster ranking to pick files for Q&A; overview sampling; filename prioritization. |
| `services/llmService.js` | OpenAI-first / Gemini-fallback LLM calls; ask/explain prompts; architecture explanation orchestration; local Mermaid fallbacks. |
| `services/analysisCacheService.js` | Read/write/shape `RepositoryAnalysis` documents. |
| `services/requestFlowCacheService.js` | Read/write/invalidate `RequestFlowAnalysis`; Mermaid validation on read. |
| `services/requestFlowService.js` | Full request-flow pipeline with progress stages and cache get-or-generate. |
| `services/sessionService.js` | Create/list/revoke sessions; touch `lastActive`; rotate refresh tokens. |
| `services/mailService.js` | Nodemailer Gmail SMTP (IPv4 lookup); contact, verification, password-reset HTML emails. |
| `services/intelligence/**` | See §8 — structural analysis engine (mostly TypeScript). |

### 7.7 Utils & scripts

| File | What it does |
|------|----------------|
| `utils/authCookies.js` | Cookie names, secure flags, set/clear access+refresh cookies, expiry helpers (24h / 30d). |
| `utils/authValidation.js` | Email normalize + strong password validation. |
| `utils/userAgent.js` | Lightweight UA → device/browser/OS; client IP helper. |
| `scripts/free-port.js` | Kill process holding API port (Windows `netstat`/`taskkill`, Unix `lsof`). |
| `scripts/test-mongo-connect.mjs` | Manual Mongo connectivity check. |
| `scripts/verify-delete-repo.js` | Helper script around delete-repo behavior. |

---

## 8. Intelligence Engine (`server/services/intelligence`)

This is the **heart of analysis**. It runs **before / alongside** LLM calls so diagrams and stats are grounded in real structure, not pure hallucination.

### 8.1 Public barrel — `index.ts`

Re-exports the whole engine: scanner, ignore rules, tech detection, graph, flows, Mermaid generators, stats, explain helpers, and `runRepositoryPipeline`.

### 8.2 Core scan pipeline

| File | Role |
|------|------|
| `analyzeRepository.ts` | Orchestrates: filter tree → find manifests → detect project type/tech/entries/structure → confidence score. |
| `ignore.ts` | Directory / lockfile / binary ignore rules. |
| `manifests.ts` | Discover & parse manifests (`package.json`, `requirements.txt`, etc.). |
| `selectManifests.ts` | Choose which manifests to fetch from GitHub (priority list, capped). |
| `detectProjectType.ts` | Classify app type (Node/React/Next/Express/Python/…). |
| `detectTechnologies.ts` | Infer frameworks, DB, auth libs from manifests + paths. |
| `detectEntryFiles.ts` | Likely entrypoints (`server.js`, `app/`, `main`, …). |
| `findStructure.ts` | High-level folder roles (routes, controllers, client, …). |
| `types.ts` | Shared TS types for analysis results. |
| `pipeline.ts` | **Full pipeline** documented in-file: scan → tech → imports/graph → architecture context → request flows → Mermaid → optional LLM polish → artifacts for Mongo cache. |

### 8.3 Dependency graph (`graph/`)

| File | Role |
|------|------|
| `index.ts` | Barrel for graph APIs. |
| `parseImports.ts` | Extract import/require statements. |
| `resolveImport.ts` | Resolve relative imports to file paths. |
| `classifyNode.ts` | Label nodes (controller, service, model, …). |
| `inferRelation.ts` | Edge relation types between nodes. |
| `packageMap.ts` | Package/path mapping helpers. |
| `types.ts` | Graph node/edge types. |

### 8.4 Request flows (`flows/`)

| Area | Files | Role |
|------|-------|------|
| Entry | `analyzeRequestFlows.ts`, `index.ts`, `types.ts` | Orchestrate multi-framework route analysis. |
| Express | `express/*`, `parseExpressRoutes.ts`, `expressLegacyMounts.ts` | AST + regex route parsing and router mounts. |
| Other frameworks | `parseNestRoutes.ts`, `parseNextApiRoutes.ts` | NestJS / Next.js API routes. |
| Controllers | `controller/*` | Resolve handler → extract calls → normalize. |
| Middleware | `middleware/*` | Detect middleware on routes. |
| Services | `service/*` | Classify downstream service/DB/external calls. |
| Execution graph | `executionGraph/*` | Build node/edge execution graphs per route. |
| Ranking | `ranking/*` | Score important APIs for diagram focus. |
| Labels / trace | `labels.ts`, `traceHandler.ts` | Human labels + handler tracing. |
| Prompt / generate | `prompt/*`, `generate/*` | Summarize flows; OpenAI client; Mermaid validation. |

### 8.5 Architecture context, Mermaid, explain, stats

| Path | Role |
|------|------|
| `architectureContext/` | Build structured frontend/backend context for prompts & diagrams. |
| `mermaid/generateArchitectureMermaid.ts` | Architecture flowchart Mermaid from context/graph. |
| `mermaid/generateComprehensiveRequestFlow.ts` | One whole-repo request lifecycle Mermaid. |
| `mermaid/generateSequenceDiagrams.ts` | Per-API sequence diagrams. |
| `mermaid/importantApis.ts` | Pick important APIs to visualize. |
| `explain/` | Architect system prompt + metadata-only explanation + LLM merge. |
| `stats/` | Aggregate repo statistics (routes, layers, languages, complexity). |

---

## 9. Client — File-by-File

### 9.1 Bootstrap & routing

| File | What it does |
|------|----------------|
| `client/index.html` | HTML shell; mounts `#root`. |
| `client/src/main.jsx` | React root: `BrowserRouter` + `ToastProvider` + `App`. |
| `client/src/App.jsx` | Route table; `ProtectedRoute` gates dashboard/analyze/repo/security/settings via `isAuthenticated()`. |
| `client/src/api.js` | **Single API client**: token storage, refresh-on-401, all auth/repo/contact endpoints, SSE request-flow helper. |
| `client/vite.config.js` | Vite + React + Tailwind v4 plugin. |
| `client/src/index.css` / `App.css` | Global / app styles (Tailwind theme). |

### 9.2 Pages

| File | Route | What it does |
|------|-------|----------------|
| `pages/LandingPage.jsx` | `/` | Marketing landing with scroll-driven frame sequence (`public/frames`), nav, contact; uses marketing components. |
| `pages/LoginPage.jsx` | `/login` | Thin wrapper around `AuthPage` (login/signup UI). |
| `pages/ForgotPasswordPage.jsx` | `/forgot-password` | Request reset email. |
| `pages/ResetPasswordPage.jsx` | `/reset-password/:token` | Set new password with client-side strength checks. |
| `pages/VerifyEmailSuccessPage.jsx` | `/verify-email/success` | Post-verify success UX. |
| `pages/VerifyEmailFailedPage.jsx` | `/verify-email/failed` | Invalid/expired token UX. |
| `pages/ResendVerificationPage.jsx` | `/resend-verification` | Resend verification email. |
| `pages/DashboardPage.jsx` | `/dashboard` | Lists user’s repos; navigate to analyze/repo; delete. |
| `pages/AnalyzePage.jsx` | `/analyze` | GitHub URL input → `analyzeRepository` → redirect to `/repo/:id`. |
| `pages/RepoPage.jsx` | `/repo/:id` | Main workspace: architecture, ask/explain chat, lazy `RequestFlowPanel`. |
| `pages/SecurityPage.jsx` | `/security` | Active sessions / device logout UI. |
| `pages/SettingsPage.jsx` | `/settings` | Email, password, activity, export, delete account, sessions. |

### 9.3 Components

| File | What it does |
|------|----------------|
| `components/AuthPage.jsx` | Shared login/signup form; calls `api.login` / `api.signup`; stores session. |
| `components/AppShell.jsx` | Authenticated chrome (nav, title slot) wrapping dashboard-style pages. |
| `components/Toast.jsx` | Global toast provider + `useToast()`. |
| `components/ArchitectureDiagram.jsx` | Wrapper presenting architecture Mermaid. |
| `components/MermaidViewer.jsx` | Renders Mermaid into DOM with error fallback. |
| `components/InteractiveMermaidViewer.jsx` | Zoom/pan, download SVG, modal variant for exploration. |
| `components/ArchitectureSkeleton.jsx` | Loading placeholder while architecture generates. |
| `components/RequestFlowPanel.jsx` | Loads/generates request flows; shows stats + Mermaid; progress UI. |
| `components/RequestFlowProgress.jsx` | Stage progress UI for SSE generation. |
| `components/FrameSideParticles.jsx` | Decorative particles beside landing frame canvas. |
| `components/landing/GitLensMarketing.jsx` | Large marketing sections (features, demos, pricing, FAQ, CTA). |
| `components/landing/HeroMockup.jsx` | Animated product mockup for hero. |
| `components/landing/primitives.jsx` | Shared section headers / glow cards for marketing. |
| `utils/mermaidSafe.js` | Sanitize / harden Mermaid strings before render. |

### 9.4 Static assets

| Path | Role |
|------|------|
| `client/public/favicon.png`, `icons.svg` | Branding. |
| `client/public/frames/ezgif-frame-*.jpg` | Scroll-scrubbed landing animation frames (~179). |
| `client/public/features_section/*.png` | Feature section images. |

---

## 10. Data Model Relationships

```
User ──┬── UserSession (many devices)
       ├── LoginAttempt (audit)
       └── Repo (many)
              ├── Question (Q&A history)
              ├── FileCache (fetched file texts)
              ├── RepositoryAnalysis (by repoId and/or owner+repo+sha)
              └── RequestFlowAnalysis (by repositoryId + commitSha)
```

Deleting a repo (`deleteRepo`) removes questions, file cache, repository analyses, and request-flow cache for that repo.

Deleting an account (`deleteAccount`) cascades user-owned data and clears cookies/sessions.

---

## 11. Frontend ↔ Backend Contract (practical)

1. After login, client stores `devlens_token`, optional `devlens_refresh`, `devlens_session_id` in `localStorage`, and also receives httpOnly cookies.
2. Every authenticated `fetch` sends `Authorization: Bearer …` and `credentials: 'include'`.
3. On `401`, `api.js` tries `/api/auth/refresh` once; if that fails, clears tokens and redirects to `/login`.
4. Route protection is **client-side** (`ProtectedRoute`); real enforcement is **server-side** `requireAuth` on `/api/repos` and `/api/repositories`.

---

## 12. Caching Strategy (why analysis feels fast)

| Cache | Key | Avoids redoing |
|-------|-----|----------------|
| `FileCache` | `repoId + path` | Re-downloading the same GitHub file blobs |
| `RepositoryAnalysis` | `owner + repoName + commitSha` | Regenerating architecture diagrams for unchanged commits |
| `RequestFlowAnalysis` | `repositoryId + commitSha` | Regenerating comprehensive request-flow Mermaid |
| Repo document fields | `architectureSummary`, `diagramSyntax`, … | Quick serve when SHA unchanged |

When GitHub HEAD SHA changes, architecture/request-flow endpoints miss cache and regenerate.

---

## 13. LLM Usage Summary

| Feature | When LLM is used | Fallback if LLM fails |
|---------|------------------|------------------------|
| Ask / Explain | Always (with retrieved files) | Error surfaced to client |
| Architecture summary | Optional polish via pipeline `callLlm` | Metadata-only explanation + local Mermaid |
| Request flows | Mostly structural Mermaid generators; validation helpers | `ensureValidRequestFlowMermaid` / lifecycle fallback |

Provider order in `llmService`: **OpenAI `gpt-4o-mini` → Gemini `gemini-2.0-flash`**.

---

## 14. Root & Misc Files

| File | Role |
|------|------|
| `/package.json` | Root scripts: `install-all`, `dev` (concurrently), `free-port`. |
| `/README.md` | Quickstart (skeleton-oriented; product has grown past the README). |
| `server/.gitignore`, `client/.gitignore`, `/.gitignore` | Ignore `node_modules`, `.env`, build output, etc. |

---

## 15. Suggested Mental Model for New Contributors

1. **UI pages** call functions in `client/src/api.js`.
2. **Express routes** map URLs → controllers.
3. Controllers own HTTP validation and persistence; they call **services**.
4. **githubService** is the only place that talks to GitHub for trees/blobs.
5. **intelligence/** turns file trees (+ contents) into graphs, routes, Mermaid, stats.
6. **llmService** answers questions and optionally polishes architecture text.
7. **Mongo models** store users, sessions, and analysis caches keyed by commit SHA.

If you need to change product behavior:

- Auth/security → `authController`, `sessionService`, `authMiddleware`
- “Paste a GitHub URL” → `analyzeRepo` + `githubService`
- Diagrams → `intelligence/` + `getArchitectureSummary` / `requestFlowService`
- Chat answers → `retrievalService` + `llmService.askQuestion`
- UI chrome/pages → `client/src/pages/*` and `components/*`

---

*End of codebase guide.*
