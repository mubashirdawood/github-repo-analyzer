/**
 * Express Route Parser — structured route declarations.
 */

export type ExpressHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * One Express route registration after parsing.
 *
 * Example:
 *   router.post("/login", validate, authController.login)
 * →
 *   { method: "POST", endpoint: "/login", middleware: ["validate"], controller: "authController.login" }
 */
export interface ExpressRouteDeclaration {
  method: ExpressHttpMethod;
  endpoint: string;
  middleware: string[];
  /** Final handler (controller method / function). Null when only inline handlers. */
  controller: string | null;
  /** Source file path (when known). */
  sourceFile?: string;
  /** Router / app variable name (router, app, …). */
  routerName?: string;
  /** How the declaration was extracted. */
  parser?: 'ast' | 'regex';
}

/** Nested mount: router.use('/api', authRouter) */
export interface ExpressRouterMount {
  prefix: string;
  /** Local variable name of the nested router. */
  routerName: string;
  /** Resolved file path of the nested router module (when known). */
  routerFile?: string;
  sourceFile: string;
}

export interface ParseExpressRouteFileOptions {
  /** Mount prefix already known for this file (from parent app.use). */
  mountPrefix?: string;
  /** Prefer AST; fall back to regex on failure. Default true. */
  preferAst?: boolean;
}

export interface ScanExpressRoutesOptions {
  files: string[];
  fileContents?: Record<string, string>;
  /** Cap routes returned. */
  maxRoutes?: number;
}
