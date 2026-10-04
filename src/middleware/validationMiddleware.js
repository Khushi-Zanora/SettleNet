const { badRequest } = require('../utils/errors');
const { parseIdParam } = require('../utils/validators');

// Usage in a route: validate(registerRules)
function validate(rulesFn) {
  return (req, res, next) => {
    const errors = rulesFn(req);
    if (errors.length > 0) return next(badRequest('Validation failed', errors));
    next();
  };
}

// Usage: validateIdParams('id', 'userId')
// Rejects non-numeric IDs with 400 and converts valid ones to numbers, so
// controllers can use req.params.id directly as a number.
function validateIdParams(...names) {
  return (req, res, next) => {
    const errors = [];
    for (const name of names) {
      const id = parseIdParam(req.params[name]);
      if (id === null) {
        errors.push({ field: name, message: `${name} must be a positive integer` });
      } else {
        req.params[name] = id;
      }
    }
    if (errors.length > 0) return next(badRequest('Invalid identifier in URL', errors));
    next();
  };
}

module.exports = { validate, validateIdParams };