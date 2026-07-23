/**
 * Map call labels → execution node type + display label + edge relation.
 */

import { categorizeCall } from '../service/classifyCalls.js';
import type { ExecutionNodeType, ExecutionRelation } from './types.js';

const AUTH_ROOTS = /^(JWT|bcrypt|Passport|NextAuth|jose)$/i;

export interface CallNodeMeta {
  type: ExecutionNodeType;
  label: string;
  relation: ExecutionRelation;
}

/**
 * True when a call looks like a service invocation (UserService.login).
 */
export function isServiceCall(call: string): boolean {
  const root = call.split('.')[0] ?? call;
  return /Service$/i.test(root) || /^[a-z].*Service$/i.test(root);
}

/**
 * Format a controller/service reference as a call label: AuthController.login()
 */
export function formatCallLabel(reference: string): string {
  const parts = reference.split('.').filter(Boolean);
  if (parts.length >= 2) {
    const obj = capitalize(parts[0]!);
    const method = parts[parts.length - 1]!;
    return `${obj}.${method}()`;
  }
  return `${reference}()`;
}

function capitalize(name: string): string {
  if (!name) return name;
  if (/^[A-Z]/.test(name)) return name;
  // authController → AuthController
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Human label for a leaf call: User.findOne → UserModel.findOne()
 */
export function formatLeafLabel(call: string): string {
  const parts = call.split('.').filter(Boolean);
  const root = parts[0] ?? call;
  const method = parts.length >= 2 ? parts.slice(1).join('.') : null;

  if (/^[A-Z]/.test(root) && method && !/Service$|Controller$/i.test(root) && !AUTH_ROOTS.test(root)) {
    // User.findOne → UserModel.findOne()
    if (!/Model$/i.test(root) && !/^(JWT|Redis|Stripe|OpenAI|Prisma|Cloudinary)/i.test(root)) {
      return `${root}Model.${method}()`;
    }
  }

  if (method) return `${root}.${method}()`;
  return `${call}()`;
}

/**
 * Classify a leaf call into graph node metadata.
 */
export function callToNodeMeta(call: string): CallNodeMeta {
  if (AUTH_ROOTS.test(call.split('.')[0] ?? '')) {
    return {
      type: 'authentication',
      label: formatLeafLabel(call),
      relation: 'authenticates'
    };
  }

  const category = categorizeCall(call);
  switch (category) {
    case 'database':
      return { type: 'database', label: formatLeafLabel(call), relation: 'queries' };
    case 'externalApi':
      return { type: 'external_api', label: formatLeafLabel(call), relation: 'calls' };
    case 'fileUpload':
      return { type: 'file_upload', label: formatLeafLabel(call), relation: 'calls' };
    case 'email':
      return { type: 'email', label: formatLeafLabel(call), relation: 'calls' };
    case 'payment':
      return { type: 'payment', label: formatLeafLabel(call), relation: 'calls' };
    case 'queue':
      return { type: 'queue', label: formatLeafLabel(call), relation: 'calls' };
    case 'cache':
      return { type: 'cache', label: formatLeafLabel(call), relation: 'calls' };
    default:
      if (/Model$/i.test(call.split('.')[0] ?? '') || /^[A-Z]/.test(call.split('.')[0] ?? '')) {
        return { type: 'model', label: formatLeafLabel(call), relation: 'queries' };
      }
      return { type: 'call', label: formatLeafLabel(call), relation: 'calls' };
  }
}

export function slugId(parts: string[]): string {
  return parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}
