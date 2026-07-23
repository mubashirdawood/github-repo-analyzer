/**
 * Operational HTTP errors — safe to expose message to the client.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

/** Generic client-safe message for LLM / analysis failures */
export const ANALYSIS_FAILED_MESSAGE = 'Analysis failed, please try again';
