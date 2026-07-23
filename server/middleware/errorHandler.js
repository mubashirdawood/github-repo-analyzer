/**
 * Express error middleware — consistent { error: message } JSON responses.
 * Place after all routes.
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  // DB never connected (Atlas DNS / network) — clearer than generic 500
  const isDbBuffer =
    err?.name === 'MongooseError' &&
    typeof err.message === 'string' &&
    err.message.includes('buffering timed out');
  const isDbOffline =
    isDbBuffer ||
    err?.name === 'MongoServerSelectionError' ||
    err?.name === 'MongoNetworkError';

  const statusCode = isDbOffline ? 503 : err.statusCode || 500;
  const message = isDbOffline
    ? 'Database is unavailable. Check MongoDB connection and try again.'
    : err.isOperational
      ? err.message
      : 'Internal server error';

  console.error(`[error] ${statusCode} ${err.message}`);
  if (!err.isOperational && !isDbOffline && err.stack) {
    console.error(err.stack);
  }

  return res.status(statusCode).json({ error: message });
}

/**
 * Wrap async route handlers so rejections go to errorHandler.
 */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
