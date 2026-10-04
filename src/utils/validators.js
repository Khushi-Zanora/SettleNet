const money = require('./money');

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

// Accepts only real calendar dates written as YYYY-MM-DD ("2026-02-30" is rejected).
function isValidDateString(v) {
  if (!isString(v)) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
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

function createGroupRules(req) {
  const { name, description } = req.body || {};
  const errors = [];

  if (!isNonEmptyString(name) || name.trim().length > 100) {
    errors.push({ field: 'name', message: 'Group name is required (max 100 characters)' });
  }
  // description is optional, but if it is sent it must be a short string
  if (description !== undefined && description !== null) {
    if (!isString(description) || description.length > 500) {
      errors.push({ field: 'description', message: 'Description must be text of at most 500 characters' });
    }
  }
  return errors;
}

function addMemberRules(req) {
  const { email } = req.body || {};
  if (!isValidEmail(email)) return [{ field: 'email', message: 'A valid email is required' }];
  return [];
}

// Used for both creating (POST) and editing (PUT) an expense.
function expenseRules(req) {
  const body = req.body || {};
  const errors = [];

  if (!isNonEmptyString(body.description) || body.description.trim().length > 200) {
    errors.push({ field: 'description', message: 'Description is required (max 200 characters)' });
  }

  if (body.category !== undefined && body.category !== null) {
    if (!isNonEmptyString(body.category) || body.category.trim().length > 50) {
      errors.push({ field: 'category', message: 'Category must be text of at most 50 characters' });
    }
  }

  const amountMinor = money.parseMoney(body.amount);
  if (amountMinor === null) {
    errors.push({ field: 'amount', message: 'Amount must be a number with at most 2 decimals, e.g. "1200.50"' });
  } else if (amountMinor <= 0) {
    errors.push({ field: 'amount', message: 'Amount must be greater than zero' });
  } else if (amountMinor > money.MAX_AMOUNT_MINOR) {
    errors.push({ field: 'amount', message: 'Amount is too large' });
  }

  if (!Number.isSafeInteger(body.paid_by) || body.paid_by <= 0) {
    errors.push({ field: 'paid_by', message: 'paid_by must be the numeric id of the payer' });
  }

  const methods = ['equal', 'exact', 'percentage', 'custom'];
  if (!methods.includes(body.split_method)) {
    errors.push({ field: 'split_method', message: `split_method must be one of: ${methods.join(', ')}` });
  }

  if (body.expense_date !== undefined && body.expense_date !== null && !isValidDateString(body.expense_date)) {
    errors.push({ field: 'expense_date', message: 'expense_date must be a real date in YYYY-MM-DD format' });
  }

  // Shape only here; membership and totals are checked by splitService.
  if (body.splits !== undefined && body.splits !== null) {
    if (!Array.isArray(body.splits) || body.splits.length === 0 || body.splits.length > 100) {
      errors.push({ field: 'splits', message: 'splits must be a list of 1 to 100 entries' });
    } else if (!body.splits.every((s) => s && typeof s === 'object' && !Array.isArray(s))) {
      errors.push({ field: 'splits', message: 'Each split must be an object like { "user_id": 1, "value": "100.00" }' });
    }
  } else if (body.split_method !== 'equal') {
    errors.push({ field: 'splits', message: 'splits are required unless split_method is "equal"' });
  }

  return errors;
}

// POST /groups/:id/settlements  -> records a payment that already happened
function recordSettlementRules(req) {
  const body = req.body || {};
  const errors = [];

  for (const field of ['from_user', 'to_user']) {
    if (!Number.isSafeInteger(body[field]) || body[field] <= 0) {
      errors.push({ field, message: `${field} must be the numeric id of a user` });
    }
  }
  if (errors.length === 0 && body.from_user === body.to_user) {
    errors.push({ field: 'to_user', message: 'A person cannot pay themselves' });
  }

  const amountMinor = money.parseMoney(body.amount);
  if (amountMinor === null) {
    errors.push({ field: 'amount', message: 'Amount must be a number with at most 2 decimals, e.g. "500.00"' });
  } else if (amountMinor <= 0) {
    errors.push({ field: 'amount', message: 'Amount must be greater than zero' });
  } else if (amountMinor > money.MAX_AMOUNT_MINOR) {
    errors.push({ field: 'amount', message: 'Amount is too large' });
  }

  if (body.note !== undefined && body.note !== null) {
    if (!isString(body.note) || body.note.length > 200) {
      errors.push({ field: 'note', message: 'Note must be text of at most 200 characters' });
    }
  }
  return errors;
}

// GET /groups/:id/expenses?limit=20&offset=0
function listExpensesQueryRules(req) {
  const { limit, offset } = req.query;
  const errors = [];

  if (limit !== undefined && !(/^\d+$/.test(String(limit)) && Number(limit) >= 1 && Number(limit) <= 100)) {
    errors.push({ field: 'limit', message: 'limit must be a whole number from 1 to 100' });
  }
  if (offset !== undefined && !/^\d+$/.test(String(offset))) {
    errors.push({ field: 'offset', message: 'offset must be a whole number of 0 or more' });
  }
  return errors;
}

module.exports = {
  isString,
  isNonEmptyString,
  isValidEmail,
  isValidDateString,
  parseIdParam,
  passwordProblems,
  registerRules,
  loginRules,
  createGroupRules,
  addMemberRules,
  expenseRules,
  listExpensesQueryRules,
  recordSettlementRules,
};