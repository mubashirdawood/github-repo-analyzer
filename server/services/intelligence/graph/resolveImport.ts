import { getExtension, getFileName, normalizePath } from '../ignore.js';

const RESOLVE_EXTENSIONS = [
  '',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.json',
  '.vue',
  '/index.js',
  '/index.jsx',
  '/index.ts',
  '/index.tsx',
  '/index.mjs'
];

/**
 * Build a lookup of normalized path → canonical path, plus basename index.
 */
export function buildPathIndex(files: string[]): {
  byPath: Map<string, string>;
  byDirIndex: Map<string, string[]>;
} {
  const byPath = new Map<string, string>();
  const byDirIndex = new Map<string, string[]>();

  for (const raw of files) {
    const path = normalizePath(raw);
    byPath.set(path, path);
    byPath.set(path.toLowerCase(), path);

    const withoutExt = path.replace(/\.[^.]+$/, '');
    byPath.set(withoutExt, path);
    byPath.set(withoutExt.toLowerCase(), path);

    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const list = byDirIndex.get(dir) ?? [];
    list.push(path);
    byDirIndex.set(dir, list);
  }

  return { byPath, byDirIndex };
}

function joinPath(fromDir: string, relative: string): string {
  const parts = [...fromDir.split('/').filter(Boolean), ...relative.split('/')];
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join('/');
}

/**
 * Resolve a relative or alias import specifier to a file in the repo tree.
 * Returns null when the target is external / unresolved.
 */
export function resolveImportPath(
  fromFile: string,
  specifier: string,
  index: ReturnType<typeof buildPathIndex>
): string | null {
  const from = normalizePath(fromFile);
  const fromDir = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '';

  let candidateBase: string | null = null;

  if (specifier.startsWith('.')) {
    candidateBase = joinPath(fromDir, specifier);
  } else if (specifier.startsWith('@/') || specifier.startsWith('~/') || specifier.startsWith('#/')) {
    const rest = specifier.replace(/^(@\/|~\/|#\/)/, '');
    // Try common roots
    for (const root of ['src', 'client/src', 'app', 'client', '']) {
      const base = root ? `${root}/${rest}` : rest;
      const hit = tryResolve(base, index);
      if (hit) return hit;
    }
    return null;
  } else if (specifier.startsWith('/')) {
    candidateBase = specifier.replace(/^\//, '');
  } else {
    // Bare package — not a local file
    return null;
  }

  if (!candidateBase) return null;
  return tryResolve(candidateBase, index);
}

function tryResolve(
  base: string,
  index: ReturnType<typeof buildPathIndex>
): string | null {
  const normalized = normalizePath(base);
  for (const ext of RESOLVE_EXTENSIONS) {
    const probe = normalized + ext;
    const hit = index.byPath.get(probe) ?? index.byPath.get(probe.toLowerCase());
    if (hit) return hit;
  }

  // Basename fallback within same folder name match
  const fileName = getFileName(normalized);
  const lowerName = fileName.toLowerCase();
  for (const [key, canonical] of index.byPath) {
    if (key.includes('/')) continue; // only exact path keys with ext already handled
  }

  // Search by filename when unique enough
  const matches: string[] = [];
  for (const [, canonical] of index.byPath) {
    const n = getFileName(canonical).replace(/\.[^.]+$/, '').toLowerCase();
    const full = getFileName(canonical).toLowerCase();
    if (n === lowerName || full === lowerName || full.startsWith(lowerName + '.')) {
      if (!matches.includes(canonical)) matches.push(canonical);
    }
  }
  if (matches.length === 1) return matches[0];

  return null;
}

/** Package name without subpath: @scope/pkg/foo → @scope/pkg */
export function packageRoot(specifier: string): string {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  return specifier.split('/')[0] ?? specifier;
}

export function isSourceFile(path: string): boolean {
  const ext = getExtension(path);
  return ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.vue'].includes(ext);
}
