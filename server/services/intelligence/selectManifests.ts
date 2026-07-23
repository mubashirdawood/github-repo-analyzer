/**
 * Paths of manifests the engine prefers to load before analysis.
 * Use with githubService.getFileContent to populate fileContents.
 */
export const PRIORITY_MANIFEST_NAMES = [
  'package.json',
  'requirements.txt',
  'Pipfile',
  'pyproject.toml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'composer.json',
  'go.mod',
  'Gemfile',
  'Cargo.toml'
] as const;

/**
 * From a filtered file list, pick manifest paths worth fetching (capped).
 */
export function selectManifestsToFetch(files: string[], limit = 8): string[] {
  const lowerIndex = new Map(files.map((p) => [p.toLowerCase(), p]));
  const picked: string[] = [];
  const seen = new Set<string>();

  const tryAdd = (path: string) => {
    const key = path.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    picked.push(path);
  };

  // Root-level known names first
  for (const name of PRIORITY_MANIFEST_NAMES) {
    if (picked.length >= limit) break;
    const hit = lowerIndex.get(name.toLowerCase());
    if (hit) tryAdd(hit);
  }

  // Nested package.json / csproj / pom
  for (const path of files) {
    if (picked.length >= limit) break;
    const base = path.split('/').pop()?.toLowerCase() ?? '';
    if (
      base === 'package.json' ||
      base === 'pom.xml' ||
      base === 'composer.json' ||
      base.endsWith('.csproj') ||
      base === 'requirements.txt'
    ) {
      tryAdd(path);
    }
  }

  return picked;
}
