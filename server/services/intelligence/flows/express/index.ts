/**
 * Express Route Parser
 * ====================
 * AST-first (TypeScript compiler API) with regex fallback.
 * Supports nested routers.
 */

export type {
  ExpressHttpMethod,
  ExpressRouteDeclaration,
  ExpressRouterMount,
  ParseExpressRouteFileOptions,
  ScanExpressRoutesOptions
} from './types.js';

export {
  parseExpressRouteFile,
  parseExpressMounts,
  scanExpressRoutes,
  toDetectedHandlers
} from './parseExpressRouteFile.js';

export { parseExpressRoutesWithAst, parseExpressMountsWithAst } from './parseWithAst.js';
export {
  parseExpressRoutesWithRegex,
  parseExpressMountsWithRegex
} from './parseWithRegex.js';
