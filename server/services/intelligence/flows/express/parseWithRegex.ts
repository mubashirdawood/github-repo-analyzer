/**
 * Express route extraction via regex (fallback when AST fails).
 */

import {
  cleanEndpoint,
  EXPRESS_METHODS,
  flattenHandlerTokens,
  joinEndpoint,
  splitHandlers,
  splitTopLevelCommas,
  toExpressMethod
} from './helpers.js';
import type { ExpressRouteDeclaration, ExpressRouterMount } from './types.js';

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '\n')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Regex fallback for router.get/post/put/patch/delete(...)
 */
export function parseExpressRoutesWithRegex(
  filePath: string,
  source: string,
  mountPrefix?: string
): ExpressRouteDeclaration[] {
  const text = stripComments(source);
  const routes: ExpressRouteDeclaration[] = [];
  const methods = EXPRESS_METHODS.join('|');

  // router.post('/login', validate, authController.login)
  const routeRe = new RegExp(
    `\\b([A-Za-z_$][\\w$]*)\\.(${methods})\\s*\\(\\s*['\`"]([^'\`"]+)['\`"]\\s*(?:,([\\s\\S]*?))?\\)`,
    'gi'
  );

  for (const m of text.matchAll(routeRe)) {
    const method = toExpressMethod(m[2]);
    if (!method) continue;

    const endpoint = m[3];
    const argsBlob = (m[4] ?? '').trim();
    const tokens = flattenHandlerTokens(splitTopLevelCommas(argsBlob));
    const { middleware, controller } = splitHandlers(tokens);

    routes.push({
      method,
      endpoint: joinEndpoint(mountPrefix, endpoint),
      middleware,
      controller,
      sourceFile: filePath,
      routerName: m[1],
      parser: 'regex'
    });
  }

  // router.route('/login').post(...)  and  .route().get().put(...)
  const chainRe = new RegExp(
    `\\b([A-Za-z_$][\\w$]*)\\.route\\s*\\(\\s*['\`]([^'\`]*)['\`]\\s*\\)((?:\\s*\\.\\s*(?:${methods})\\s*\\(\\s*[\\s\\S]*?\\))+)`,
    'gi'
  );

  for (const m of text.matchAll(chainRe)) {
    const routerName = m[1]!;
    const basePath = m[2]!;
    const chainBlob = m[3]!;
    const methodCallRe = new RegExp(
      `\\.\\s*(${methods})\\s*\\(\\s*([\\s\\S]*?)\\)`,
      'gi'
    );
    for (const cm of chainBlob.matchAll(methodCallRe)) {
      const method = toExpressMethod(cm[1]);
      if (!method) continue;
      const tokens = flattenHandlerTokens(splitTopLevelCommas(cm[2] ?? ''));
      const { middleware, controller } = splitHandlers(tokens);
      routes.push({
        method,
        endpoint: joinEndpoint(mountPrefix, basePath),
        middleware,
        controller,
        sourceFile: filePath,
        routerName,
        parser: 'regex'
      });
    }
  }

  return routes;
}

/**
 * Regex fallback for nested mounts: app.use('/api', authRouter)
 */
export function parseExpressMountsWithRegex(
  filePath: string,
  source: string
): ExpressRouterMount[] {
  const text = stripComments(source);
  const mounts: ExpressRouterMount[] = [];

  const useRe =
    /\b([A-Za-z_$][\w$]*)\.use\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([A-Za-z_$][\w$]*|require\s*\(\s*['"][^'"]+['"]\s*\))\s*\)/g;

  for (const m of text.matchAll(useRe)) {
    const objName = m[1];
    if (!/router|app|server/i.test(objName)) continue;

    let routerName = m[3].trim();
    const req = routerName.match(/^require\s*\(\s*['"]([^'"]+)['"]\s*\)$/);
    if (req) routerName = req[1]!;

    mounts.push({
      prefix: cleanEndpoint(m[2]),
      routerName,
      sourceFile: filePath
    });
  }

  return mounts;
}
