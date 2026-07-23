/**
 * Paths and file types the intelligence engine should ignore.
 */

export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.cache',
  '.git',
  'vendor',
  '.turbo',
  '.nuxt',
  '.output',
  'out',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  'target',
  'bin',
  'obj',
  '.idea',
  '.vscode',
  '.gradle'
]);

export const IGNORED_LOCK_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'npm-shrinkwrap.json',
  'composer.lock',
  'poetry.lock',
  'Pipfile.lock',
  'Gemfile.lock',
  'Cargo.lock',
  'bun.lockb',
  'bun.lock'
]);

/** Extensions treated as binary / non-source (case-insensitive). */
export const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.webp',
  '.bmp',
  '.tiff',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',
  '.mp3',
  '.mp4',
  '.webm',
  '.avi',
  '.mov',
  '.wasm',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.class',
  '.jar',
  '.war',
  '.pyc',
  '.pyo',
  '.o',
  '.a',
  '.lock',
  '.map',
  '.min.js',
  '.min.css'
]);

export function getExtension(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath;
  const lower = base.toLowerCase();
  if (lower.endsWith('.min.js')) return '.min.js';
  if (lower.endsWith('.min.css')) return '.min.css';
  const idx = lower.lastIndexOf('.');
  return idx >= 0 ? lower.slice(idx) : '';
}

export function getFileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? filePath;
}

export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Returns true when a path should be excluded from intelligence analysis.
 */
export function shouldIgnorePath(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  if (!normalized) return true;

  const segments = normalized.split('/').filter(Boolean);
  if (segments.some((seg) => IGNORED_DIRECTORIES.has(seg))) return true;

  const name = getFileName(normalized);
  if (IGNORED_LOCK_FILES.has(name)) return true;
  if (name.endsWith('.lock')) return true;

  const ext = getExtension(normalized);
  if (BINARY_EXTENSIONS.has(ext)) return true;

  return false;
}

/**
 * Filter a raw file tree down to analyzable source / config paths.
 */
export function filterFileTree(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of paths) {
    const path = normalizePath(raw);
    if (!path || shouldIgnorePath(path) || seen.has(path)) continue;
    seen.add(path);
    result.push(path);
  }

  return result.sort((a, b) => a.localeCompare(b));
}
