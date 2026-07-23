/**
 * Request flow ranking — prioritize important routes, drop noise.
 */

/** Priority categories (highest → lowest among kept routes). */
export type FlowImportanceCategory =
  | 'Authentication'
  | 'Registration'
  | 'Payment'
  | 'CRUD'
  | 'File Upload'
  | 'Chat'
  | 'Admin'
  | 'Search'
  | 'Health'
  | 'Other';

export interface ImportancePattern {
  category: FlowImportanceCategory;
  /** Match against method + endpoint + file + middleware/controller blobs. */
  patterns: RegExp[];
  /** Base weight (higher = more important). */
  weight: number;
}

/**
 * Ordered priority table. First match wins as primary category.
 * Registration is matched before Authentication so /auth/register → Registration.
 */
export const FLOW_IMPORTANCE_PATTERNS: ImportancePattern[] = [
  {
    category: 'Registration',
    patterns: [
      /register/i,
      /sign[-_]?up/i,
      /signup/i,
      /create[-_]?account/i,
      /onboard/i
    ],
    weight: 95
  },
  {
    category: 'Authentication',
    patterns: [
      /login/i,
      /sign[-_]?in/i,
      /logout/i,
      /sign[-_]?out/i,
      /auth(?!or)/i,
      /session/i,
      /token/i,
      /refresh[-_]?token/i,
      /password[-_]?reset/i,
      /forgot[-_]?password/i,
      /verify[-_]?email/i,
      /oauth/i,
      /2fa|mfa|otp/i
    ],
    weight: 100
  },
  {
    category: 'Payment',
    patterns: [
      /pay(ment)?/i,
      /checkout/i,
      /stripe/i,
      /billing/i,
      /invoice/i,
      /subscription/i,
      /order/i,
      /paypal/i,
      /razorpay/i,
      /refund/i
    ],
    weight: 90
  },
  {
    category: 'File Upload',
    patterns: [
      /upload/i,
      /cloudinary/i,
      /avatar/i,
      /media/i,
      /attachment/i,
      /multipart/i,
      /s3/i,
      /file/i
    ],
    weight: 75
  },
  {
    category: 'Chat',
    patterns: [
      /chat/i,
      /message/i,
      /conversation/i,
      /socket/i,
      /\bdm\b/i,
      /inbox/i,
      /thread/i
    ],
    weight: 70
  },
  {
    category: 'Admin',
    patterns: [/admin/i, /dashboard/i, /moderat/i, /superuser/i, /staff/i],
    weight: 65
  },
  {
    category: 'Search',
    patterns: [/search/i, /query/i, /suggest/i, /autocomplete/i, /find/i],
    weight: 55
  },
  {
    category: 'Health',
    patterns: [/health/i, /ready/i, /live(ness)?/i, /ping/i, /status/i, /heartbeat/i],
    weight: 40
  },
  {
    category: 'CRUD',
    patterns: [
      /\/(users?|posts?|products?|items?|comments?|reviews?|profiles?|articles?|books?|orders?)\b/i,
      /create/i,
      /update/i,
      /delete/i,
      /:id\b/i
    ],
    weight: 80
  }
];

/** Routes matching these are dropped entirely. */
export const FLOW_IGNORE_PATTERNS: RegExp[] = [
  /\bdebug\b/i,
  /\btest\b/i,
  /\binternal\b/i,
  /__test__/i,
  /\.test\./i,
  /\.spec\./i,
  /\/mock\b/i,
  /\/fixture/i,
  /\/dev\b/i,
  /\/sandbox\b/i,
  /\/private\/internal/i
];

export const DEFAULT_TOP_FLOWS = 10;

/** Minimal route-like input for ranking (Express routes, graphs, flows). */
export interface RankableRoute {
  method: string;
  endpoint: string;
  sourceFile?: string;
  /** Extra text: middleware names, controller, node labels, … */
  blob?: string;
}

export interface RankedRouteResult<T extends RankableRoute = RankableRoute> {
  rank: number;
  category: FlowImportanceCategory;
  score: number;
  item: T;
}
