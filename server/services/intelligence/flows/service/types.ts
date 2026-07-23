/**
 * Service Analyzer — structured metadata types.
 */

/** Categories of side effects / integrations detected in a service function. */
export interface ServiceAnalysis {
  /** Short service function name, e.g. "createUser". */
  service: string;
  /** Resolved source file (when found). */
  sourceFile?: string;
  /** How calls were extracted. */
  parser?: 'ast' | 'regex';

  /** All normalized call expressions (flat list). */
  calls: string[];

  /** Database operations: User.find, Prisma.user.create, … */
  database: string[];
  /** Model identifiers referenced: User, Post, … */
  models: string[];
  /** External HTTP / AI APIs: axios.post, fetch, OpenAI.create, … */
  externalApis: string[];
  /** File upload providers / helpers: Cloudinary.upload, s3.upload, … */
  fileUploads: string[];
  /** Email sending: nodemailer.sendMail, Resend, … */
  email: string[];
  /** Payment gateways: Stripe, PayPal, … */
  payments: string[];
  /** Job queues / messaging: Bull, SQS, Kafka, … */
  queues: string[];
  /** Cache: Redis.get, memcached, … */
  cache: string[];
}

export interface AnalyzeServiceOptions {
  /**
   * Service reference as detected from a controller/call site.
   * Examples: "userService.create", "UserService.findById", "createUser"
   */
  service: string;
  files: string[];
  fileContents?: Record<string, string>;
  /** Optional file that imported the service (helps resolution). */
  hintFile?: string;
  /** Precomputed localName → file map from the hint file. */
  importMap?: Map<string, string>;
}

export type ServiceCallCategory =
  | 'database'
  | 'model'
  | 'externalApi'
  | 'fileUpload'
  | 'email'
  | 'payment'
  | 'queue'
  | 'cache'
  | 'other';
