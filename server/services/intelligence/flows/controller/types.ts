/**
 * Controller Analyzer — types.
 */

/** Structured analysis of a controller function. */
export interface ControllerAnalysis {
  /** Short controller function name, e.g. "login". */
  controller: string;
  /**
   * Normalized call expressions found in the body.
   * Examples: "UserService.login", "JWT.sign", "User.findOne", "bcrypt.compare"
   */
  calls: string[];
  /** Resolved source file (when found). */
  sourceFile?: string;
  /** How calls were extracted. */
  parser?: 'ast' | 'regex';
}

export interface AnalyzeControllerOptions {
  /**
   * Controller reference as detected on a route.
   * Examples: "authController.login", "login", "AuthController.login"
   */
  controller: string;
  files: string[];
  fileContents?: Record<string, string>;
  /** Optional route/file that imported the controller (helps resolution). */
  hintFile?: string;
  /** Precomputed localName → file map from the hint file. */
  importMap?: Map<string, string>;
}

/** Located implementation before call extraction. */
export interface ResolvedController {
  /** Short name: login */
  name: string;
  /** Original reference: authController.login */
  reference: string;
  file: string;
  source: string;
  /** Function body source (without surrounding braces) when known. */
  body: string | null;
  /** Absolute start/end of the function node in `source` (for AST slicing). */
  bodyStart?: number;
  bodyEnd?: number;
}
