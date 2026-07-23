/**
 * ArchitectureContext — compact, metadata-only payload for LLM prompts.
 * Contains no source code.
 */

export interface FrontendArchitectureContext {
  framework: string | null;
  /** Human labels like "Login", "Dashboard" (not file paths). */
  pages: string[];
  /** Count of component files (not a path list — keeps payload small). */
  components: number;
  stateManagement?: string | null;
  uiLibrary?: string | null;
}

export interface BackendArchitectureContext {
  framework: string | null;
  /** Human labels like "Auth", "Users" (not file paths). */
  routes: string[];
  /** Human labels like "JWT", "ErrorHandler". */
  middleware: string[];
  /** Optional compact service names when present. */
  services?: string[];
}

/**
 * Structured architecture summary optimized for LLM consumption.
 * Metadata only — never includes source code.
 */
export interface ArchitectureContext {
  projectType: string;
  frontend: FrontendArchitectureContext | null;
  backend: BackendArchitectureContext | null;
  database: string | null;
  authentication: string | null;
  externalServices: string[];
  importantFiles: string[];
  /** Optional one-line extras that stay tiny. */
  testing?: string | null;
  realtime?: string | null;
  cache?: string | null;
  deployment?: string | null;
}

export interface BuildArchitectureContextOptions {
  /** Cap how many page / route / middleware labels are listed. */
  maxLabels?: number;
  /** Cap important entry file basenames. */
  maxImportantFiles?: number;
  /**
   * Optional extra external service names (e.g. from graph External API nodes).
   * Merged with signals already present in RepositoryAnalysis.
   */
  externalServices?: string[];
}
