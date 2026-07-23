/**
 * Shared lightweight Babel AST helpers for the Controller Analyzer.
 */

import { parse, type ParserPlugin } from '@babel/parser';

export interface AstNode {
  type: string;
  start?: number | null;
  end?: number | null;
  name?: string;
  value?: string;
  key?: AstNode;
  id?: AstNode;
  init?: AstNode | null;
  body?: AstNode | AstNode[] | null;
  expression?: AstNode;
  left?: AstNode;
  right?: AstNode;
  object?: AstNode;
  property?: AstNode;
  computed?: boolean;
  callee?: AstNode;
  arguments?: AstNode[];
  params?: AstNode[];
  async?: boolean;
  generator?: boolean;
  declarations?: AstNode[];
  elements?: Array<AstNode | null>;
  properties?: AstNode[];
  [key: string]: unknown;
}

export function parseSource(filePath: string, source: string): AstNode | null {
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

export function walk(node: AstNode, visit: (n: AstNode) => void | boolean): void {
  const stop = visit(node);
  if (stop === false) return;

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

export function isIdentifier(node: AstNode | null | undefined): boolean {
  return Boolean(node && node.type === 'Identifier');
}

export function isMemberExpression(node: AstNode | null | undefined): boolean {
  return Boolean(node && (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression'));
}

export function isCallExpression(node: AstNode | null | undefined): boolean {
  return Boolean(node && (node.type === 'CallExpression' || node.type === 'OptionalCallExpression'));
}

export function memberName(node: AstNode): string | null {
  if (!isMemberExpression(node) || node.computed) return null;
  if (isIdentifier(node.property ?? null) && node.property?.name) return node.property.name;
  return null;
}

export function calleeToString(node: AstNode, source: string): string | null {
  if (isIdentifier(node) && node.name) return node.name;

  if (isMemberExpression(node)) {
    const parts: string[] = [];
    let cursor: AstNode | undefined = node;
    while (cursor && isMemberExpression(cursor)) {
      if (cursor.computed) {
        // Skip deeply computed calls
        if (typeof cursor.start === 'number' && typeof cursor.end === 'number') {
          return source.slice(cursor.start, cursor.end).replace(/\s+/g, '');
        }
        return null;
      }
      const prop = memberName(cursor);
      if (!prop) return null;
      parts.unshift(prop);
      cursor = cursor.object;
    }
    if (cursor && isIdentifier(cursor) && cursor.name) {
      parts.unshift(cursor.name);
      return parts.join('.');
    }
    if (cursor && typeof cursor.start === 'number' && typeof cursor.end === 'number') {
      parts.unshift(source.slice(cursor.start, cursor.end));
      return parts.join('.');
    }
  }

  if (typeof node.start === 'number' && typeof node.end === 'number') {
    const text = source.slice(node.start, node.end).replace(/\s+/g, '');
    if (/^[A-Za-z_$][\w$.]*$/.test(text)) return text;
  }
  return null;
}
