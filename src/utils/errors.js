// An error we throw deliberately, with an HTTP status and a client-safe message.
class AppError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details; // optional, e.g. a list of field-level validation errors
  }
}

// Small factories so call sites read clearly: throw badRequest('...')
const badRequest = (message, details) => new AppError(400, message, details);
const unauthorized = (message = 'Authentication required') => new AppError(401, message);
const forbidden = (message = 'You do not have access to this resource') => new AppError(403, message);
const notFound = (message = 'Resource not found') => new AppError(404, message);
const conflict = (message) => new AppError(409, message);

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
};