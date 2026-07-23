import { getFileName, normalizePath } from './ignore.js';

/** Common application entry filenames (basename match, case-insensitive). */
const ENTRY_BASENAMES = new Set([
  'server.js',
  'server.ts',
  'server.mjs',
  'server.cjs',
  'app.js',
  'app.ts',
  'app.mjs',
  'app.cjs',
  'index.js',
  'index.ts',
  'index.mjs',
  'index.cjs',
  'index.jsx',
  'index.tsx',
  'main.js',
  'main.ts',
  'main.jsx',
  'main.tsx',
  'main.py',
  'app.jsx',
  'app.tsx',
  'app.py',
  'manage.py',
  'wsgi.py',
  'asgi.py',
  'program.cs',
  'startup.cs',
  'artisan'
]);

/** Preferred shallow entry paths (higher score = more likely). */
const ENTRY_SCORE: Record<string, number> = {
  'server.js': 100,
  'server.ts': 100,
  'app.js': 95,
  'app.ts': 95,
  'main.tsx': 90,
  'main.jsx': 90,
  'main.ts': 88,
  'main.js': 88,
  'index.tsx': 85,
  'index.jsx': 85,
  'app.tsx': 84,
  'app.jsx': 84,
  'index.ts': 80,
  'index.js': 80,
  'manage.py': 92,
  'main.py': 85,
  'program.cs': 90,
  'startup.cs': 80,
  'artisan': 88
};

/**
 * Detect likely entry / bootstrap files from the filtered tree.
 * Prefers shallow paths and well-known names (server.js, main.tsx, App.tsx, …).
 */
export function detectEntryFiles(files: string[]): string[] {
  const candidates: Array<{ path: string; score: number }> = [];

  for (const raw of files) {
    const path = normalizePath(raw);
    const name = getFileName(path);
    const lowerName = name.toLowerCase();

    if (!ENTRY_BASENAMES.has(lowerName)) continue;

    // Skip nested test / story / mock entries
    const lowerPath = path.toLowerCase();
    if (
      /\/(test|tests|__tests__|spec|specs|stories|__mocks__|fixtures)\//i.test(lowerPath) ||
      /\.(test|spec)\./i.test(lowerName)
    ) {
      continue;
    }

    const depth = path.split('/').length;
    const baseScore = ENTRY_SCORE[lowerName] ?? 50;
    // Prefer root / src / app / client / server
    let locationBonus = 0;
    const first = path.split('/')[0]?.toLowerCase();
    if (depth === 1) locationBonus += 40;
    else if (['src', 'app', 'client', 'server', 'backend', 'frontend', 'web', 'api'].includes(first ?? '')) {
      locationBonus += 25;
    }
    locationBonus -= Math.max(0, depth - 2) * 8;

    candidates.push({ path, score: baseScore + locationBonus });
  }

  candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  // Deduplicate by basename preference — keep best few
  const seenNames = new Set<string>();
  const result: string[] = [];

  for (const c of candidates) {
    const name = getFileName(c.path).toLowerCase();
    // Allow same basename in different packages (client/server) but cap total
    const key = `${name}::${c.path.split('/')[0]?.toLowerCase() ?? ''}`;
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    result.push(c.path);
    if (result.length >= 12) break;
  }

  return result;
}
