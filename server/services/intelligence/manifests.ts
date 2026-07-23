import type { FileContentMap, ManifestInfo } from './types.js';
import { getFileName, normalizePath } from './ignore.js';

const MANIFEST_PATTERNS: Array<{
  kind: ManifestInfo['kind'];
  match: (fileName: string, fullPath: string) => boolean;
}> = [
  {
    kind: 'package.json',
    match: (name) => name === 'package.json'
  },
  {
    kind: 'requirements.txt',
    match: (name) => name === 'requirements.txt' || /^requirements[-_.].+\.txt$/i.test(name)
  },
  {
    kind: 'Pipfile',
    match: (name) => name === 'Pipfile'
  },
  {
    kind: 'pyproject.toml',
    match: (name) => name === 'pyproject.toml'
  },
  {
    kind: 'pom.xml',
    match: (name) => name === 'pom.xml'
  },
  {
    kind: 'build.gradle',
    match: (name) => name === 'build.gradle' || name === 'build.gradle.kts'
  },
  {
    kind: 'composer.json',
    match: (name) => name === 'composer.json'
  },
  {
    kind: 'csproj',
    match: (name) => name.endsWith('.csproj')
  },
  {
    kind: 'go.mod',
    match: (name) => name === 'go.mod'
  },
  {
    kind: 'Gemfile',
    match: (name) => name === 'Gemfile'
  },
  {
    kind: 'Cargo.toml',
    match: (name) => name === 'Cargo.toml'
  }
];

export function findManifests(files: string[]): ManifestInfo[] {
  const manifests: ManifestInfo[] = [];

  for (const path of files) {
    const name = getFileName(path);
    for (const pattern of MANIFEST_PATTERNS) {
      if (pattern.match(name, path)) {
        manifests.push({ path, kind: pattern.kind });
        break;
      }
    }
  }

  // Prefer root-level manifests first
  return manifests.sort((a, b) => {
    const depthA = a.path.split('/').length;
    const depthB = b.path.split('/').length;
    if (depthA !== depthB) return depthA - depthB;
    return a.path.localeCompare(b.path);
  });
}

export interface ParsedPackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

export function parsePackageJson(raw: string | undefined): ParsedPackageJson | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as ParsedPackageJson;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function parseComposerJson(raw: string | undefined): {
  require?: Record<string, string>;
  'require-dev'?: Record<string, string>;
} | null {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as { require?: Record<string, string>; 'require-dev'?: Record<string, string> };
  } catch {
    return null;
  }
}

/** Flatten all dependency maps from package.json into a lowercase name → version map. */
export function collectNpmDeps(pkg: ParsedPackageJson | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!pkg) return map;

  const buckets = [
    pkg.dependencies,
    pkg.devDependencies,
    pkg.peerDependencies,
    pkg.optionalDependencies
  ];

  for (const bucket of buckets) {
    if (!bucket) continue;
    for (const [name, version] of Object.entries(bucket)) {
      map.set(name.toLowerCase(), version);
    }
  }

  return map;
}

export function hasNpmDep(deps: Map<string, string>, ...names: string[]): boolean {
  return names.some((n) => deps.has(n.toLowerCase()));
}

export function getManifestContent(
  manifests: ManifestInfo[],
  fileContents: FileContentMap | undefined,
  kind: ManifestInfo['kind']
): string | undefined {
  if (!fileContents) return undefined;
  const hit = manifests.find((m) => m.kind === kind);
  if (!hit) return undefined;
  return (
    fileContents[hit.path] ??
    fileContents[normalizePath(hit.path)] ??
    fileContents[hit.path.toLowerCase()]
  );
}

/** Case-insensitive path lookup for any provided content map. */
export function resolveContent(fileContents: FileContentMap | undefined, path: string): string | undefined {
  if (!fileContents) return undefined;
  if (fileContents[path] != null) return fileContents[path];
  const normalized = normalizePath(path);
  if (fileContents[normalized] != null) return fileContents[normalized];
  const lower = normalized.toLowerCase();
  for (const [key, value] of Object.entries(fileContents)) {
    if (normalizePath(key).toLowerCase() === lower) return value;
  }
  return undefined;
}

export function textIncludesAny(text: string | undefined, needles: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}
