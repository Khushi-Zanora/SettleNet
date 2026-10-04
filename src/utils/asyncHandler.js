// Express 4 does not catch rejected promises from async route handlers.
// This wrapper passes any error to next(), which reaches the error middleware.
module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};