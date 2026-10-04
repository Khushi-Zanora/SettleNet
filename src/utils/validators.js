// Pragmatic email check: something@something.tld, no spaces, sane length.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isString = (v) => typeof v === 'string';
const isNonEmptyString = (v) => isString(v) && v.trim().length > 0;

function isValidEmail(v) {
  return isString(v) && v.trim().length <= 254 && EMAIL_REGEX.test(v.trim());
}

// Turns a URL param like "12" into the number 12. Returns null if it is not a
// positive integer, so "abc", "-1", "1.5" and "0" are all rejected.
function parseIdParam(value) {
  if (!isString(value) || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// bcrypt only uses the first 72 bytes of a password, so we cap the length there.
function passwordProblems(password) {
  if (!isString(password)) return ['Password is required'];
  const problems = [];
  if (password.length < 8) problems.push('Password must be at least 8 characters');
  if (Buffer.byteLength(password, 'utf8') > 72) problems.push('Password must be at most 72 bytes');
  if (!/[A-Za-z]/.test(password)) problems.push('Password must contain a letter');
  if (!/[0-9]/.test(password)) problems.push('Password must contain a number');
  return problems;
}

// ---- Rule sets: (req) => [{ field, message }, ...] ----

function registerRules(req) {
  const { name, email, password } = req.body || {};
  const errors = [];

  if (!isNonEmptyString(name) || name.trim().length > 100) {
    errors.push({ field: 'name', message: 'Name is required (max 100 characters)' });
  }
  if (!isValidEmail(email)) {
    errors.push({ field: 'email', message: 'A valid email is required' });
  }
  for (const message of passwordProblems(password)) {
    errors.push({ field: 'password', message });
  }
  return errors;
}

function loginRules(req) {
  const { email, password } = req.body || {};
  const errors = [];

  if (!isValidEmail(email)) errors.push({ field: 'email', message: 'A valid email is required' });
  if (!isNonEmptyString(password)) errors.push({ field: 'password', message: 'Password is required' });
  return errors;
}

module.exports = {
  isString,
  isNonEmptyString,
  isValidEmail,
  parseIdParam,
  passwordProblems,
  registerRules,
  loginRules,
};