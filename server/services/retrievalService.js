/**
 * Searches a repository's file tree and ranks paths based on keyword matches
 * and patterns associated with the query.
 * 
 * @param {Array<{path: string, type: string, sizeBytes: number}>} fileTree - Array of files from Repo model.
 * @param {string} question - The user query to search for.
 * @param {number} maxFiles - Maximum size of output.
 * @param {{ prioritizeFilenames?: boolean }} [options]
 * @returns {Array<string>} - Sorted array of file paths.
 */
export function findRelevantFiles(fileTree, question, maxFiles = 6, options = {}) {
  if (!fileTree || !Array.isArray(fileTree) || fileTree.length === 0 || !question) {
    return [];
  }

  const prioritizeFilenames = Boolean(options.prioritizeFilenames);

  // When the user names a file directly, jump straight to exact path/filename hits
  if (prioritizeFilenames) {
    const filenameHits = findByExactFilenames(fileTree, question, maxFiles);
    if (filenameHits.length > 0) {
      return filenameHits;
    }
  }

  // 1. Keyword extraction and cleaning
  const stopWords = new Set([
    'the', 'how', 'where', 'does', 'is', 'a', 'an', 'of', 'to', 'for', 'in', 'on', 'at', 'by', 'with',
    'from', 'and', 'or', 'what', 'why', 'who', 'when', 'can', 'do', 'get', 'set', 'should',
    'which', 'this', 'that', 'these', 'those', 'are', 'was', 'were', 'be', 'been', 'been', 'about',
    'file', 'files', 'code', 'repository', 'repo', 'app', 'application', 'how-to', 'show', 'list',
    'create', 'used', 'using', 'use', 'please', 'tell', 'me', 'any',
    'explain', 'function', 'functions', 'method', 'methods', 'class', 'specific'
  ]);

  // Normalize, remove punctuation, and tokenize query
  const cleanQuestion = question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const keywords = cleanQuestion
    .split(/\s+/)
    .map(kw => kw.trim())
    .filter(kw => kw.length > 1 && !stopWords.has(kw));

  // Broad / overview questions need sample source files, not filename keyword hits
  const overviewKeywords = new Set([
    'language', 'languages', 'lang', 'stack', 'tech', 'technology', 'technologies',
    'overview', 'summary', 'structure', 'architecture', 'written', 'programming',
    'framework', 'frameworks', 'built'
  ]);
  const isOverviewQuestion =
    !prioritizeFilenames &&
    (keywords.length === 0 ||
    keywords.some(kw => overviewKeywords.has(kw)));

  // Define semantic clusters for filename keyword expansion
  const authCluster = ['auth', 'authenticate', 'authenticator', 'authentication', 'login', 'signup', 'register', 'signout', 'logout', 'session', 'jwt', 'token', 'password', 'user', 'oauth'];
  const patternMap = {
    'auth': authCluster,
    'authentication': authCluster,
    'authenticate': authCluster,
    'authenticator': authCluster,
    'login': ['auth', 'login', 'signup', 'register', 'signout', 'logout', 'session', 'jwt', 'token', 'password', 'user'],
    'signup': ['auth', 'login', 'signup', 'register', 'session', 'user'],
    'register': ['auth', 'login', 'signup', 'register', 'session', 'user'],
    'security': ['auth', 'jwt', 'token', 'crypt', 'hash', 'salt', 'protect', 'guard', 'encryption'],
    'user': ['user', 'profile', 'member', 'account', 'customer'],
    'account': ['user', 'profile', 'member', 'account'],
    'payment': ['payment', 'stripe', 'checkout', 'billing', 'pay', 'charge', 'invoice', 'card', 'transaction'],
    'stripe': ['payment', 'stripe', 'checkout', 'billing', 'pay', 'charge', 'invoice', 'card'],
    'billing': ['payment', 'stripe', 'checkout', 'billing', 'pay', 'charge', 'invoice', 'card'],
    'checkout': ['payment', 'stripe', 'checkout', 'billing', 'pay', 'charge', 'invoice', 'card'],
    'route': ['route', 'api', 'controller', 'endpoint', 'handler', 'express', 'router'],
    'api': ['route', 'api', 'controller', 'endpoint', 'handler', 'express', 'router'],
    'endpoint': ['route', 'api', 'controller', 'endpoint', 'handler'],
    'controller': ['route', 'api', 'controller', 'endpoint', 'handler'],
    'db': ['db', 'database', 'mongo', 'mongoose', 'schema', 'model', 'connection', 'seed', 'connect'],
    'database': ['db', 'database', 'mongo', 'mongoose', 'schema', 'model', 'connection', 'seed', 'connect'],
    'model': ['model', 'schema', 'db', 'database', 'mongoose'],
    'schema': ['model', 'schema', 'db', 'database', 'mongoose'],
    'mongoose': ['model', 'schema', 'db', 'database', 'mongoose', 'connect'],
    'mongo': ['model', 'schema', 'db', 'database', 'mongoose', 'connect'],
    'config': ['config', 'setup', 'env', 'setting', 'constant', 'properties'],
    'env': ['config', 'setup', 'env', 'setting', 'constant']
  };

  if (isOverviewQuestion) {
    return sampleRepresentativeFiles(fileTree, maxFiles);
  }

  // 2. Score files in tree
  const scoredFiles = fileTree.map(file => {
    let score = 0;
    const pathLower = file.path.toLowerCase();

    // Deconstruct directory components vs exact filename
    const pathParts = pathLower.split('/');
    const filename = pathParts[pathParts.length - 1];
    const directory = pathParts.slice(0, -1).join('/');

    // Keep meaningful stems for both normal files and dotfiles (e.g. .gitignore → gitignore)
    const fileStem = filename.replace(/^\./, '').replace(/\.[^.]+$/, '') || filename;

    for (const kw of keywords) {
      // DIRECT MATCH WEIGHT — amplified when user is naming a file/function target
      const exactBoost = prioritizeFilenames ? 50 : 20;
      const partialBoost = prioritizeFilenames ? 25 : 10;

      if (fileStem === kw || filename === kw) {
        score += exactBoost;
      } else if (filename.includes(kw) || fileStem.includes(kw)) {
        score += partialBoost;
      } else if (kw.length >= 5 && fileStem.length >= 5 && sharedPrefixLength(kw, fileStem) >= 6) {
        // e.g. "authentication" ↔ "authenticate" / "authenticator"
        score += prioritizeFilenames ? 15 : 10;
      }

      if (directory.includes(kw)) {
        score += prioritizeFilenames ? 3 : 5;
      }

      // CLUSTER MAP EXPANSION WEIGHT — dialed down for targeted explain queries
      if (patternMap[kw] && !prioritizeFilenames) {
        for (const synonym of patternMap[kw]) {
          if (filename.includes(synonym) || fileStem.includes(synonym)) {
            score += 4;
          } else if (fileStem.length >= 4 && synonym.includes(fileStem)) {
            score += 4;
          }
          if (directory.includes(synonym)) {
            score += 2;
          }
        }
      }
    }

    // Prefer implementation files over tests/docs/error helpers when scores are otherwise close
    if (score > 0) {
      if (directory.includes('/test') || pathLower.startsWith('test/') || pathLower.includes('__tests__')) {
        score -= 3;
      }
      if (directory.includes('/errors') || fileStem.endsWith('error')) {
        score -= 2;
      }
      if (directory.includes('/middleware') || pathLower.includes('/lib/')) {
        score += 2;
      }
    }

    // Small boost for extension readability (prioritize code implementation over metadata format files)
    const preferredExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.java', '.cpp', '.h', '.cs', '.php', '.rs', '.kt', '.swift'];
    const hasPreferredExt = preferredExtensions.some(ext => filename.endsWith(ext));
    if (score > 0 && hasPreferredExt) {
      score += 2;
    }

    return {
      path: file.path,
      score
    };
  });

  // Sort: scores in descending order; fallback alphabetically on tie
  scoredFiles.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.path.localeCompare(b.path);
  });

  // Keep positive matching files up to max limit
  const topMatches = scoredFiles.filter(item => item.score > 0).slice(0, maxFiles);

  // No path matched the query keywords — still give the LLM something useful
  if (topMatches.length === 0) {
    return sampleRepresentativeFiles(fileTree, maxFiles);
  }

  return topMatches.map(item => item.path);
}

/**
 * Prefer exact path / filename tokens named in the query
 * (e.g. "explain handleSubmit in LoginForm.jsx" → LoginForm.jsx).
 */
function findByExactFilenames(fileTree, question, maxFiles) {
  const q = question.toLowerCase();
  const candidates = new Set();

  // Paths with slashes or dotted filenames (auth.js, src/main.jsx)
  const dotted = question.match(/[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/g) || [];
  const nested = question.match(/[A-Za-z0-9_./-]+\/[A-Za-z0-9_./-]+/g) || [];

  for (const token of [...dotted, ...nested]) {
    const cleaned = token.replace(/^[\s"'`(]+|[)\]"'`,.]+$/g, '').toLowerCase();
    if (cleaned) candidates.add(cleaned);
  }

  if (candidates.size === 0) return [];

  const scored = [];

  for (const file of fileTree) {
    const pathLower = file.path.toLowerCase();
    const filename = pathLower.split('/').pop();
    let score = 0;

    for (const candidate of candidates) {
      if (pathLower === candidate || pathLower.endsWith('/' + candidate)) {
        score += 100;
      } else if (filename === candidate) {
        score += 90;
      } else if (pathLower.includes(candidate)) {
        score += 60;
      } else if (filename.startsWith(candidate.split('.')[0] + '.') && candidate.includes('.')) {
        score += 70;
      }
    }

    // Soft mention without being a formal candidate token
    if (score === 0 && q.includes(filename)) {
      score += 80;
    }

    if (score > 0) {
      scored.push({ path: file.path, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return scored.slice(0, maxFiles).map((item) => item.path);
}

/**
 * Pick a small, diverse set of source / manifest files so broad questions
 * (language, stack, overview) still get real context.
 */
function sampleRepresentativeFiles(fileTree, maxFiles) {
  const preferredExtensions = [
    '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
    '.py', '.rb', '.go', '.java', '.kt', '.swift',
    '.cs', '.cpp', '.c', '.h', '.hpp', '.rs', '.php', '.scala'
  ];
  const manifestNames = new Set([
    'package.json', 'readme.md', 'requirements.txt', 'pyproject.toml',
    'cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'composer.json',
    'gemfile', 'cmakelists.txt', 'makefile'
  ]);

  const manifests = [];
  const byExt = new Map();

  for (const file of fileTree) {
    const pathLower = file.path.toLowerCase();
    const pathParts = pathLower.split('/');
    const filename = pathParts[pathParts.length - 1];
    const depth = pathParts.length;
    const ext = preferredExtensions.find(e => filename.endsWith(e));

    if (manifestNames.has(filename)) {
      // Prefer root manifests; skip nested per-folder READMEs in challenge repos
      if (filename === 'readme.md' && depth > 1) {
        // ignore nested readmes for overview sampling
      } else if (depth <= 2) {
        manifests.push(file.path);
        continue;
      }
    }

    // Skip obvious non-source noise for overview sampling
    if (
      pathLower.includes('/test/') ||
      pathLower.startsWith('test/') ||
      pathLower.includes('__tests__') ||
      filename.endsWith('.md')
    ) {
      continue;
    }

    if (ext) {
      if (!byExt.has(ext)) byExt.set(ext, []);
      byExt.get(ext).push(file.path);
    }
  }

  const selected = [];
  const seen = new Set();

  const pushUnique = (path) => {
    if (!path || seen.has(path) || selected.length >= maxFiles) return;
    seen.add(path);
    selected.push(path);
  };

  // Prefer manifests first (package.json / README quickly reveal language)
  for (const path of manifests) pushUnique(path);

  // Round-robin across extensions so mixed-language repos are represented
  const extBuckets = [...byExt.values()];
  let index = 0;
  while (selected.length < maxFiles && extBuckets.some(bucket => bucket.length > 0)) {
    const bucket = extBuckets[index % extBuckets.length];
    if (bucket.length > 0) {
      pushUnique(bucket.shift());
    }
    index += 1;
    // Safety: avoid infinite loop on empty remaining buckets
    if (index > fileTree.length * 2) break;
  }

  // Last resort: any remaining files from the tree
  if (selected.length === 0) {
    for (const file of fileTree) {
      pushUnique(file.path);
      if (selected.length >= maxFiles) break;
    }
  }

  return selected;
}

/** Shared leading characters between two lowercase strings. */
function sharedPrefixLength(a, b) {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  return i;
}
