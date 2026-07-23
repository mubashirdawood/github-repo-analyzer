import FileCache from '../models/FileCache.js';
import { AppError } from '../errors/AppError.js';

const MAX_FILES = 300;

const PRIORITY_DIRS = new Set([
  'src', 'app', 'lib', 'routes', 'controllers', 'models',
  'server', 'client', 'api', 'components', 'services', 'middleware', 'utils', 'hooks'
]);

const DEPRIORITY_DIRS = new Set([
  'test', 'tests', '__tests__', 'spec', 'specs', 'config', 'configs',
  '.github', 'docs', 'doc', 'examples', 'example', 'fixtures', 'fixture',
  'coverage', 'scripts', 'migrations', 'stories', '__mocks__'
]);

/**
 * Parses GitHub repository URL to extract owner and repository name.
 * Supports web URLs, git URLs, and shorthand formats.
 * @param {string} url
 * @returns {{ owner: string, repo: string }}
 */
export function parseGitHubUrl(url) {
  if (!url || typeof url !== 'string' || !url.trim()) {
    throw new AppError('Invalid GitHub URL. Expected format: https://github.com/owner/repo', 400);
  }

  let cleanUrl = url.trim();

  if (cleanUrl.endsWith('.git')) {
    cleanUrl = cleanUrl.slice(0, -4);
  }

  cleanUrl = cleanUrl.replace(/\/+$/, '');

  const regex = /(?:github\.com[\/:])([^\/]+)\/([^\/]+)/i;
  const match = cleanUrl.match(regex);

  if (match) {
    return { owner: match[1], repo: match[2] };
  }

  const parts = cleanUrl.split('/');
  if (parts.length === 2 && !cleanUrl.includes(':') && parts[0] && parts[1]) {
    return { owner: parts[0], repo: parts[1] };
  }

  throw new AppError('Invalid GitHub URL. Expected format: https://github.com/owner/repo', 400);
}

/**
 * Throw typed errors for GitHub API failures (404 private/missing, rate limits).
 */
function throwForGitHubFailure(response, bodyText = '') {
  if (response.status === 404) {
    throw new AppError('Repository not found or is private', 404);
  }

  const remaining = response.headers.get('x-ratelimit-remaining');
  const retryAfter = response.headers.get('retry-after');
  const rateLimited =
    response.status === 429 ||
    (response.status === 403 &&
      (remaining === '0' ||
        retryAfter != null ||
        /rate limit|api rate limit/i.test(bodyText)));

  if (rateLimited) {
    throw new AppError('GitHub rate limit reached, please try again shortly', 429);
  }

  if (response.status === 403) {
    throw new AppError('Repository not found or is private', 404);
  }

  throw new AppError('Failed to fetch repository from GitHub', 502);
}

function scoreFilePath(path) {
  const parts = path.toLowerCase().split('/');
  const depth = parts.length;
  const filename = parts[parts.length - 1];
  let score = 0;

  if (parts.some((p) => PRIORITY_DIRS.has(p))) score += 50;
  if (parts.some((p) => DEPRIORITY_DIRS.has(p))) score -= 40;

  // Prefer shallower paths; deeply nested config/test already penalized above
  score -= Math.max(0, depth - 2) * 4;

  if (/\.(js|jsx|ts|tsx|mjs|cjs|py|go|java|rs|rb|php)$/i.test(filename)) score += 12;
  if (/\.(json|yml|yaml|toml|md|lock)$/i.test(filename)) score -= 8;
  if (/^(test|spec)\./i.test(filename) || /\.(test|spec)\./i.test(filename)) score -= 25;

  return score;
}

/**
 * Keep at most MAX_FILES using priority heuristics.
 * @returns {{ fileTree: Array, truncated: boolean }}
 */
export function truncateFileTree(fileTree, limit = MAX_FILES) {
  if (!Array.isArray(fileTree) || fileTree.length <= limit) {
    return { fileTree: fileTree || [], truncated: false };
  }

  const ranked = [...fileTree].sort((a, b) => {
    const scoreDiff = scoreFilePath(b.path) - scoreFilePath(a.path);
    if (scoreDiff !== 0) return scoreDiff;
    return a.path.localeCompare(b.path);
  });

  return {
    fileTree: ranked.slice(0, limit),
    truncated: true
  };
}

/**
 * Fetches repository structure from GitHub recursively and filters it.
 * @param {string} url
 * @returns {Promise<{ owner: string, repoName: string, fileTree: Array, truncated: boolean }>}
 */
export async function getRepoContents(url) {
  const { owner, repo } = parseGitHubUrl(url);

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'GitLens-AI-App'
  };

  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const repoMetaUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const metaResponse = await fetch(repoMetaUrl, { headers });

  if (!metaResponse.ok) {
    const errText = await metaResponse.text().catch(() => '');
    throwForGitHubFailure(metaResponse, errText);
  }

  const repoMeta = await metaResponse.json();
  const defaultBranch = repoMeta.default_branch || 'main';

  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`;
  const treeResponse = await fetch(treeUrl, { headers });

  if (!treeResponse.ok) {
    const errText = await treeResponse.text().catch(() => '');
    throwForGitHubFailure(treeResponse, errText);
  }

  const treeData = await treeResponse.json();

  if (!treeData.tree || !Array.isArray(treeData.tree)) {
    throw new AppError('Failed to fetch repository from GitHub', 502);
  }

  // Prefer commit SHA of default branch HEAD (stable cache key)
  let commitSha = null;
  try {
    commitSha = await fetchHeadCommitSha(owner, repo, defaultBranch, headers);
  } catch (err) {
    console.warn('Could not resolve HEAD commit SHA, falling back to tree SHA:', err.message);
    commitSha = treeData.sha || null;
  }

  const forbiddenDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'vendor', 'coverage'];
  const forbiddenFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock'];
  const forbiddenExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.lock', '.map', '.pdf', '.zip', '.tar', '.gz', '.mp4'
  ];

  const MAX_FILE_SIZE = 500 * 1024;

  const filteredTree = treeData.tree
    .filter((item) => {
      if (item.type !== 'blob') return false;

      const pathSegments = item.path.split('/');
      if (pathSegments.some((segment) => forbiddenDirs.includes(segment))) return false;

      const fileName = pathSegments[pathSegments.length - 1];
      if (forbiddenFiles.includes(fileName)) return false;

      if (forbiddenExtensions.some((ext) => item.path.toLowerCase().endsWith(ext))) return false;
      if (item.size && item.size > MAX_FILE_SIZE) return false;

      return true;
    })
    .map((item) => ({
      path: item.path,
      type: 'file',
      sizeBytes: item.size || 0
    }));

  const { fileTree, truncated } = truncateFileTree(filteredTree, MAX_FILES);

  return {
    owner,
    repoName: repo,
    fileTree,
    truncated,
    commitSha,
    defaultBranch
  };
}

/**
 * Resolve the latest commit SHA on a branch (for analysis cache invalidation).
 */
export async function fetchHeadCommitSha(owner, repo, branch, headers) {
  const refUrl = `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`;
  const refResponse = await fetch(refUrl, { headers: headers || githubHeaders() });

  if (refResponse.ok) {
    const refData = await refResponse.json();
    const sha = refData?.object?.sha;
    if (sha) return sha;
  }

  // Fallback: commits API
  const commitsUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`;
  const commitsResponse = await fetch(commitsUrl, {
    headers: {
      ...(headers || githubHeaders()),
      Accept: 'application/vnd.github.v3.sha'
    }
  });

  if (commitsResponse.ok) {
    // Some responses return raw sha text when Accept: sha
    const text = (await commitsResponse.text()).trim();
    if (/^[0-9a-f]{7,40}$/i.test(text)) return text;

    try {
      const json = JSON.parse(text);
      if (json?.sha) return json.sha;
    } catch {
      /* ignore */
    }
  }

  throw new Error(`Unable to resolve HEAD SHA for ${owner}/${repo}@${branch}`);
}

/**
 * Lightweight HEAD SHA check (used before serving cached architecture).
 */
export async function getRepoHeadSha(owner, repoName, branchHint) {
  const headers = githubHeaders();

  let branch = branchHint;
  if (!branch) {
    const metaResponse = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
      headers
    });
    if (!metaResponse.ok) {
      const errText = await metaResponse.text().catch(() => '');
      throwForGitHubFailure(metaResponse, errText);
    }
    const meta = await metaResponse.json();
    branch = meta.default_branch || 'main';
  }

  return fetchHeadCommitSha(owner, repoName, branch, headers);
}

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'GitLens-AI-App'
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

/**
 * Retrieves the text content of a file from GitHub, with local MongoDB caching.
 */
export async function getFileContent(owner, repoName, path, repoId) {
  try {
    const cachedFile = await FileCache.findOne({ repoId, path });
    if (cachedFile) {
      console.log(`[cache HIT] ${path}`);
      return cachedFile.content;
    }

    console.log(`[cache MISS] fetching from GitHub: ${path}`);
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitLens-AI-App'
    };

    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const fileUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${encodedPath}`;

    const response = await fetch(fileUrl, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`File not found on GitHub: ${owner}/${repoName}/${path}`);
        return null;
      }

      const remaining = response.headers.get('x-ratelimit-remaining');
      if (response.status === 429 || (response.status === 403 && remaining === '0')) {
        throw new AppError('GitHub rate limit reached, please try again shortly', 429);
      }

      console.warn(`Failed to fetch file content (status ${response.status})`);
      return null;
    }

    const data = await response.json();

    if (!data || data.type !== 'file' || !data.content) {
      console.warn(`Path is not a valid file or lacks content: ${path}`);
      return null;
    }

    let decodedContent = '';
    try {
      decodedContent = Buffer.from(data.content, 'base64').toString('utf8');
      if (decodedContent.includes('\u0000')) {
        console.log(`File is likely binary/non-text, returning null: ${path}`);
        return null;
      }
    } catch (decodeErr) {
      console.error(`Error decoding base64 content for file ${path}:`, decodeErr);
      return null;
    }

    const tokenCount = Math.round(decodedContent.length / 4);
    const newCache = new FileCache({
      repoId,
      path,
      content: decodedContent,
      tokenCount
    });
    await newCache.save();

    return decodedContent;
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error(`Error in getFileContent for ${path}:`, error.message);
    return null;
  }
}
