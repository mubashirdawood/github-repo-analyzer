/**
 * Repository Intelligence Engine — shared types.
 * Analyzes a repository structure BEFORE any LLM call.
 */

/** A single path entry from a GitHub tree (or local walk). */
export interface FileTreeEntry {
  path: string;
  type?: 'file' | 'blob' | 'dir' | 'tree';
  sizeBytes?: number;
}

/** Known project / stack identities we can classify. */
export type ProjectType =
  | 'React'
  | 'Next.js'
  | 'Express'
  | 'NestJS'
  | 'Vue'
  | 'Angular'
  | 'Django'
  | 'Flask'
  | 'Spring Boot'
  | 'Laravel'
  | 'ASP.NET'
  | 'MERN'
  | 'Unknown';

/**
 * Normalized technology signals extracted from manifests + paths.
 * Each field is a human-readable label or null when not detected.
 */
export interface TechnologyStack {
  framework: string | null;
  frontend: string | null;
  backend: string | null;
  database: string | null;
  authentication: string | null;
  stateManagement: string | null;
  uiLibrary: string | null;
  deployment: string | null;
  testing: string | null;
  realtime: string | null;
  cache: string | null;
}

/** Architectural folders / files grouped by role. */
export interface RepositoryStructure {
  controllers: string[];
  routes: string[];
  services: string[];
  models: string[];
  middleware: string[];
  hooks: string[];
  contexts: string[];
  api: string[];
  utils: string[];
  config: string[];
  components: string[];
  pages: string[];
}

/** Manifest files whose contents were used for tech detection. */
export interface ManifestInfo {
  path: string;
  kind:
    | 'package.json'
    | 'requirements.txt'
    | 'Pipfile'
    | 'pyproject.toml'
    | 'pom.xml'
    | 'build.gradle'
    | 'composer.json'
    | 'csproj'
    | 'go.mod'
    | 'Gemfile'
    | 'Cargo.toml'
    | 'other';
}

/**
 * Normalized output of the Repository Intelligence Engine.
 * Safe to pass into architecture / LLM context builders.
 */
export interface RepositoryAnalysis {
  projectType: ProjectType;
  /** Alias of projectType for callers that expect `framework` at top level. */
  framework: ProjectType;
  technologies: TechnologyStack;
  entryFiles: string[];
  structure: RepositoryStructure;
  manifests: ManifestInfo[];
  /** Paths kept after ignore filters. */
  files: string[];
  totalFileCount: number;
  filteredFileCount: number;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Optional map of path → file text for key manifests.
 * When omitted, detection falls back to path heuristics only.
 */
export type FileContentMap = Record<string, string>;

export interface AnalyzeRepositoryOptions {
  /** Raw GitHub / local file tree. */
  fileTree: FileTreeEntry[];
  /** Optional contents for package.json, requirements.txt, etc. */
  fileContents?: FileContentMap;
  owner?: string;
  repoName?: string;
}
