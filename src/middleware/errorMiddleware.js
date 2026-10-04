const { AppError } = require('../utils/errors');

// Runs when no route matched the request.
function notFoundHandler(req, res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// Express recognises a function with 4 arguments as the error handler.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // 1. Errors we threw on purpose: safe to show the message.
  if (err instanceof AppError) {
    const body = { error: { message: err.message } };
    if (err.details) body.error.details = err.details;
    return res.status(err.statusCode).json(body);
  }

  // 2. Malformed JSON in the request body (thrown by express.json()).
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { message: 'Request body is not valid JSON' } });
  }

  // 3. Request body larger than the configured limit.
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { message: 'Request body is too large' } });
  }

  // 4. A database constraint we did not check for in code: report a conflict,
  //    but do not leak SQL or table names.
  if (typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
    console.error('Database constraint error:', err.message);
    return res.status(409).json({ error: { message: 'The request conflicts with existing data' } });
  }

  // 5. Anything else is a bug: log it fully, tell the client nothing specific.
  console.error('Unexpected error:', err);
  return res.status(500).json({ error: { message: 'Internal server error' } });
}

module.exports = { notFoundHandler, errorHandler };