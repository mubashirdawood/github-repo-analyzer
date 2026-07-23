import type {
  AnalyzeRepositoryOptions,
  FileTreeEntry,
  ManifestInfo,
  RepositoryAnalysis
} from './types.js';
import { filterFileTree } from './ignore.js';
import {
  findManifests,
  getManifestContent,
  parsePackageJson,
  resolveContent
} from './manifests.js';
import { detectProjectType, type ProjectTypeSignals } from './detectProjectType.js';
import { detectTechnologies } from './detectTechnologies.js';
import { detectEntryFiles } from './detectEntryFiles.js';
import { findStructure } from './findStructure.js';

function extractPaths(fileTree: FileTreeEntry[]): string[] {
  return (fileTree || [])
    .filter((entry) => {
      const t = entry.type;
      // Accept missing type, or explicit file/blob entries
      return !t || t === 'file' || t === 'blob';
    })
    .map((entry) => entry.path)
    .filter((p): p is string => typeof p === 'string' && p.length > 0);
}

function buildSignals(
  files: string[],
  manifests: ManifestInfo[],
  fileContents: AnalyzeRepositoryOptions['fileContents']
): ProjectTypeSignals {
  const packageRaw = getManifestContent(manifests, fileContents, 'package.json');
  // Also try any package.json path directly if getManifestContent missed casing
  const packageJson =
    parsePackageJson(packageRaw) ??
    (() => {
      const pkgPath = manifests.find((m) => m.kind === 'package.json')?.path;
      return pkgPath ? parsePackageJson(resolveContent(fileContents, pkgPath)) : null;
    })();

  return {
    packageJson,
    requirementsText: getManifestContent(manifests, fileContents, 'requirements.txt'),
    pyprojectText: getManifestContent(manifests, fileContents, 'pyproject.toml'),
    pomXml: getManifestContent(manifests, fileContents, 'pom.xml'),
    buildGradle: getManifestContent(manifests, fileContents, 'build.gradle'),
    composerJson: getManifestContent(manifests, fileContents, 'composer.json'),
    csprojText: (() => {
      const cs = manifests.find((m) => m.kind === 'csproj');
      return cs ? resolveContent(fileContents, cs.path) : undefined;
    })(),
    files
  };
}

function scoreConfidence(analysis: Omit<RepositoryAnalysis, 'confidence'>): RepositoryAnalysis['confidence'] {
  let score = 0;
  if (analysis.projectType !== 'Unknown') score += 2;
  if (analysis.manifests.length > 0) score += 2;
  if (analysis.entryFiles.length > 0) score += 1;
  const techHits = Object.values(analysis.technologies).filter(Boolean).length;
  if (techHits >= 4) score += 2;
  else if (techHits >= 2) score += 1;
  const structureHits = Object.values(analysis.structure).filter((arr) => arr.length > 0).length;
  if (structureHits >= 4) score += 1;

  if (score >= 6) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

/**
 * Repository Intelligence Engine entry point.
 *
 * Analyzes a repository file tree (and optional manifest contents)
 * BEFORE any LLM call. Returns a normalized {@link RepositoryAnalysis}.
 *
 * @example
 * ```ts
 * const analysis = analyzeRepository({
 *   fileTree,
 *   fileContents: { 'package.json': pkgJsonText }
 * });
 * ```
 */
export function analyzeRepository(options: AnalyzeRepositoryOptions): RepositoryAnalysis {
  const rawPaths = extractPaths(options.fileTree ?? []);
  const totalFileCount = rawPaths.length;
  const files = filterFileTree(rawPaths);
  const filteredFileCount = files.length;

  const manifests = findManifests(files);
  const signals = buildSignals(files, manifests, options.fileContents);

  const projectType = detectProjectType(signals);
  const technologies = detectTechnologies(signals, projectType);
  const entryFiles = detectEntryFiles(files);
  const structure = findStructure(files);

  const partial = {
    projectType,
    framework: projectType,
    technologies,
    entryFiles,
    structure,
    manifests,
    files,
    totalFileCount,
    filteredFileCount
  };

  return {
    ...partial,
    confidence: scoreConfidence(partial)
  };
}

/**
 * Convenience helper: analyze from a plain string path list.
 */
export function analyzeRepositoryFromPaths(
  paths: string[],
  fileContents?: AnalyzeRepositoryOptions['fileContents']
): RepositoryAnalysis {
  return analyzeRepository({
    fileTree: paths.map((path) => ({ path, type: 'file' as const })),
    fileContents
  });
}
