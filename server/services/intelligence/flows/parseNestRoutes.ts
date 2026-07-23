import { normalizePath } from '../ignore.js';
import type { DetectedRoute, RequestMethod } from './types.js';

type ParsedMethod = RequestMethod | 'OPTIONS' | 'HEAD' | 'ALL';

/**
 * Parse NestJS @Controller / @Get / @Post decorated handlers.
 */
export function parseNestRoutes(filePath: string, source: string): DetectedRoute[] {
  const routes: DetectedRoute[] = [];
  const text = source
    .replace(/\/\*[\s\S]*?\*\//g, '\n')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  // @Controller('auth') or @Controller()
  const controllerMatch = text.match(/@Controller\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/);
  if (!controllerMatch && !/@Controller\b/.test(text)) {
    return [];
  }

  const base = controllerMatch?.[1] ? `/${controllerMatch[1].replace(/^\//, '')}` : '';

  // Find class name for handler labeling
  const classMatch = text.match(/export\s+class\s+([A-Za-z_$][\w$]*)/);
  const className = classMatch?.[1] ?? 'Controller';

  // @Get('login') / @Post() / @Put(':id')
  const methodRe =
    /@(Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/g;

  for (const m of text.matchAll(methodRe)) {
    const method = m[1].toUpperCase() as ParsedMethod;
    const sub = m[2] ?? '';
    const handlerName = m[3];
    const path = joinNestPath(base, sub);

    routes.push({
      method,
      path,
      handlers: [`${className}.${handlerName}`, handlerName],
      sourceFile: normalizePath(filePath),
      framework: 'NestJS'
    });
  }

  return routes;
}

function joinNestPath(base: string, sub: string): string {
  const a = base.replace(/\/+$/, '');
  const b = sub ? (sub.startsWith('/') ? sub : `/${sub}`) : '';
  let path = `${a}${b}` || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  return path.replace(/\/+/g, '/') || '/';
}

export function isNestControllerFile(source: string): boolean {
  return /@Controller\s*\(/.test(source) && /@(Get|Post|Put|Patch|Delete)\s*\(/.test(source);
}
