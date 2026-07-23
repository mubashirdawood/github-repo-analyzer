/**
 * Express route extraction via Babel AST (@babel/parser).
 * Handles JS / TS / JSX route files.
 */

import { parse, type ParserPlugin } from '@babel/parser';
import {
  cleanEndpoint,
  EXPRESS_METHODS,
  joinEndpoint,
  normalizeHandlerExpr,
  splitHandlers,
  toExpressMethod
} from './helpers.js';
import type { ExpressRouteDeclaration, ExpressRouterMount } from './types.js';

const METHOD_SET = new Set<string>(EXPRESS_METHODS);

interface AstNode {
  type: string;
  start?: number | null;
  end?: number | null;
  name?: string;
  value?: string;
  computed?: boolean;
  object?: AstNode;
  property?: AstNode;
  callee?: AstNode;
  arguments?: AstNode[];
  elements?: Array<AstNode | null>;
  expressions?: AstNode[];
  quasis?: Array<{ value: { cooked?: string | null } }>;
  [key: string]: unknown;
}

function tryParse(filePath: string, source: string): AstNode | null {
  const plugins: ParserPlugin[] = ['typescript', 'jsx', 'decorators-legacy'];

  const attempts: Array<{
    sourceType: 'module' | 'script' | 'unambiguous';
    plugins: ParserPlugin[];
  }> = [
    { sourceType: 'unambiguous', plugins },
    { sourceType: 'module', plugins },
    { sourceType: 'script', plugins: ['jsx'] }
  ];

  for (const attempt of attempts) {
    try {
      return parse(source, {
        sourceType: attempt.sourceType,
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
        errorRecovery: true,
        plugins: attempt.plugins
      }) as unknown as AstNode;
    } catch {
      // try next
    }
  }
  return null;
}

function isIdentifier(node: AstNode | null | undefined): boolean {
  return Boolean(node && node.type === 'Identifier');
}

function isMemberExpression(node: AstNode | null | undefined): boolean {
  return Boolean(node && node.type === 'MemberExpression');
}

function isCallExpression(node: AstNode | null | undefined): boolean {
  return Boolean(node && node.type === 'CallExpression');
}

function stringValue(node: AstNode | null | undefined): string | null {
  if (!node) return null;
  if (node.type === 'StringLiteral' && typeof node.value === 'string') return node.value;
  if (
    node.type === 'TemplateLiteral' &&
    Array.isArray(node.expressions) &&
    node.expressions.length === 0
  ) {
    return node.quasis?.[0]?.value.cooked ?? null;
  }
  return null;
}

function memberName(node: AstNode): string | null {
  if (!isMemberExpression(node) || node.computed) return null;
  if (isIdentifier(node.property ?? null) && node.property?.name) return node.property.name;
  return null;
}

function objectName(node: AstNode, source: string): string {
  if (isIdentifier(node) && node.name) return node.name;
  if (typeof node.start === 'number' && typeof node.end === 'number') {
    return source.slice(node.start, node.end);
  }
  return 'router';
}

function handlerFromExpr(node: AstNode, source: string): string | null {
  if (isIdentifier(node) && node.name) return node.name;

  if (isMemberExpression(node) && !node.computed) {
    if (typeof node.start === 'number' && typeof node.end === 'number') {
      return normalizeHandlerExpr(source.slice(node.start, node.end));
    }
  }

  // foo.bind(this)
  if (
    isCallExpression(node) &&
    node.callee &&
    isMemberExpression(node.callee) &&
    memberName(node.callee) === 'bind' &&
    node.callee.object
  ) {
    return handlerFromExpr(node.callee.object, source);
  }

  return null;
}

function collectHandlers(args: AstNode[], source: string, startIndex: number): string[] {
  const names: string[] = [];

  const push = (node: AstNode) => {
    if (node.type === 'ArrayExpression' && Array.isArray(node.elements)) {
      for (const el of node.elements) {
        if (el && el.type !== 'SpreadElement') push(el);
      }
      return;
    }
    const name = handlerFromExpr(node, source);
    if (name) names.push(name);
  };

  for (let i = startIndex; i < args.length; i += 1) {
    push(args[i]!);
  }
  return names;
}

function parseCallee(
  callee: AstNode,
  source: string
): { objectName: string; method: string; routePathFromChain?: string } | null {
  if (!isMemberExpression(callee)) return null;
  const method = memberName(callee)?.toLowerCase();
  if (!method || !METHOD_SET.has(method)) return null;

  // Walk call chains: router.route('/x').get(...).put(...)
  let cursor: AstNode | undefined = callee.object;
  let routePathFromChain: string | undefined;
  let objectRoot: AstNode | undefined;

  while (cursor) {
    if (isCallExpression(cursor) && cursor.callee && isMemberExpression(cursor.callee)) {
      const innerMethod = memberName(cursor.callee)?.toLowerCase();
      if (innerMethod === 'route' && Array.isArray(cursor.arguments) && cursor.arguments.length >= 1) {
        const path = stringValue(cursor.arguments[0]);
        if (path != null) routePathFromChain = path;
        objectRoot = cursor.callee.object;
        break;
      }
      // Continue through .get().put() chain
      if (innerMethod && METHOD_SET.has(innerMethod)) {
        cursor = cursor.callee.object;
        continue;
      }
      break;
    }
    objectRoot = cursor;
    break;
  }

  if (routePathFromChain != null && objectRoot) {
    return {
      objectName: objectName(objectRoot, source),
      method,
      routePathFromChain
    };
  }

  // Direct: router.post('/login', ...)
  if (!callee.object) return null;
  // If object is a call chain without route(), skip (handled above or invalid)
  if (isCallExpression(callee.object)) return null;

  return {
    objectName: objectName(callee.object, source),
    method
  };
}

function buildDeclaration(
  methodRaw: string,
  endpoint: string,
  handlers: string[],
  routerName: string,
  sourceFile: string,
  mountPrefix?: string
): ExpressRouteDeclaration | null {
  const method = toExpressMethod(methodRaw);
  if (!method) return null;
  const { middleware, controller } = splitHandlers(handlers);
  return {
    method,
    endpoint: joinEndpoint(mountPrefix, endpoint),
    middleware,
    controller,
    sourceFile,
    routerName,
    parser: 'ast'
  };
}

function walk(node: AstNode, visit: (n: AstNode) => void): void {
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') {
      continue;
    }
    const child = node[key];
    if (!child) continue;
    if (Array.isArray(child)) {
      for (const c of child) {
        if (c && typeof c === 'object' && 'type' in c) walk(c as AstNode, visit);
      }
    } else if (typeof child === 'object' && child !== null && 'type' in (child as object)) {
      walk(child as AstNode, visit);
    }
  }
}

/**
 * Parse Express route registrations from a single file using Babel AST.
 * Returns null if the source cannot be parsed.
 */
export function parseExpressRoutesWithAst(
  filePath: string,
  source: string,
  mountPrefix?: string
): ExpressRouteDeclaration[] | null {
  const ast = tryParse(filePath, source);
  if (!ast) return null;

  const routes: ExpressRouteDeclaration[] = [];

  walk(ast, (node) => {
    if (!isCallExpression(node) || !node.callee || !node.arguments) return;
    const calleeInfo = parseCallee(node.callee, source);
    if (!calleeInfo) return;

    let endpoint: string | null = calleeInfo.routePathFromChain ?? null;
    let handlerStart = 0;

    if (endpoint == null) {
      if (node.arguments.length < 1) return;
      endpoint = stringValue(node.arguments[0]);
      handlerStart = 1;
    }
    if (endpoint == null) return;

    const handlers = collectHandlers(node.arguments, source, handlerStart);
    const decl = buildDeclaration(
      calleeInfo.method,
      endpoint,
      handlers,
      calleeInfo.objectName,
      filePath,
      mountPrefix
    );
    if (decl) routes.push(decl);
  });

  return routes;
}

/**
 * Detect nested router mounts: app.use('/api', authRouter)
 */
export function parseExpressMountsWithAst(
  filePath: string,
  source: string
): ExpressRouterMount[] | null {
  const ast = tryParse(filePath, source);
  if (!ast) return null;

  const mounts: ExpressRouterMount[] = [];

  walk(ast, (node) => {
    if (!isCallExpression(node) || !node.callee || !node.arguments) return;
    if (!isMemberExpression(node.callee)) return;
    if (memberName(node.callee) !== 'use') return;
    if (node.arguments.length < 2 || !node.callee.object) return;

    const objName = objectName(node.callee.object, source);
    if (!/router|app|server/i.test(objName)) return;

    const prefix = stringValue(node.arguments[0]);
    if (prefix == null) return;

    const second = node.arguments[1]!;
    let routerName: string | null = null;

    if (isIdentifier(second) && second.name) {
      routerName = second.name;
    } else if (
      isCallExpression(second) &&
      second.callee &&
      isIdentifier(second.callee) &&
      second.callee.name === 'require' &&
      Array.isArray(second.arguments) &&
      second.arguments.length >= 1
    ) {
      routerName = stringValue(second.arguments[0]);
    }

    if (routerName) {
      mounts.push({
        prefix: cleanEndpoint(prefix),
        routerName,
        sourceFile: filePath
      });
    }
  });

  return mounts;
}
