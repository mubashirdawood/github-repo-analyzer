/**
 * Lightweight import / require / from-import extraction.
 * Intentionally regex-based (no full AST) for speed across many files.
 */

export interface ParsedImport {
  /** Raw specifier as written in source. */
  specifier: string;
  /** true when specifier looks like a package (not relative / alias path). */
  isPackage: boolean;
}

const SOURCE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.py',
  '.vue'
]);

export function isParsableSource(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  const idx = lower.lastIndexOf('.');
  if (idx < 0) return false;
  return SOURCE_EXTENSIONS.has(lower.slice(idx));
}

function stripComments(source: string): string {
  // Remove block comments then line comments (good enough for import lines)
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '\n')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/^\s*#.*$/gm, '');
}

function isPackageSpecifier(specifier: string): boolean {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return false;
  // Path aliases commonly used in frontends
  if (specifier.startsWith('@/') || specifier.startsWith('~/') || specifier.startsWith('#/')) {
    return false;
  }
  return true;
}

function pushUnique(out: ParsedImport[], specifier: string) {
  const cleaned = specifier.trim().replace(/^["']|["']$/g, '');
  if (!cleaned || cleaned.startsWith('node:')) {
    // Keep node: builtins as packages for External API / runtime hints
  }
  if (!cleaned) return;
  if (out.some((p) => p.specifier === cleaned)) return;
  out.push({
    specifier: cleaned.startsWith('node:') ? cleaned.slice(5) : cleaned,
    isPackage: isPackageSpecifier(cleaned.startsWith('node:') ? cleaned.slice(5) : cleaned)
  });
}

/**
 * Parse import-like dependencies from a source file.
 */
export function parseImports(filePath: string, source: string): ParsedImport[] {
  const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
  const text = stripComments(source);
  const out: ParsedImport[] = [];

  if (ext === '.py') {
    // import foo, bar
    for (const m of text.matchAll(/^\s*import\s+([a-zA-Z0-9_.,\s]+)/gm)) {
      for (const part of m[1].split(',')) {
        const mod = part.trim().split(/\s+as\s+/)[0]?.trim().split('.')[0];
        if (mod) pushUnique(out, mod);
      }
    }
    // from foo.bar import baz
    for (const m of text.matchAll(/^\s*from\s+([.\w]+)\s+import\s+/gm)) {
      const mod = m[1];
      if (mod.startsWith('.')) {
        pushUnique(out, mod); // relative — limited resolution later
      } else {
        pushUnique(out, mod.split('.')[0] ?? mod);
      }
    }
    return out;
  }

  // ES static imports / exports
  // import x from 'y'
  // import 'y'
  // export { x } from 'y'
  // export * from 'y'
  const fromRe =
    /(?:import|export)\s+(?:type\s+)?(?:[\s\w{},*]+\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const m of text.matchAll(fromRe)) {
    pushUnique(out, m[1]);
  }

  // Side-effect: import 'y' already covered; dynamic import()
  for (const m of text.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    pushUnique(out, m[1]);
  }

  // require('y') / require("y")
  for (const m of text.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    pushUnique(out, m[1]);
  }

  // export = require (already via require)

  return out;
}
