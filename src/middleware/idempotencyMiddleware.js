const crypto = require('crypto');
const db = require('../config/db');
const { badRequest, conflict } = require('../utils/errors');

const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

const deleteExpired = db.prepare(
  "DELETE FROM idempotency_keys WHERE created_at < datetime('now', '-24 hours')"
);
const findSaved = db.prepare(
  'SELECT request_hash, status_code, response_body FROM idempotency_keys WHERE user_id = ? AND "key" = ?'
);
const saveResponse = db.prepare(`
  INSERT INTO idempotency_keys (user_id, "key", method, path, request_hash, status_code, response_body)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

// JSON with sorted keys, so {a:1,b:2} and {b:2,a:1} produce the same fingerprint.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/*
 * HOW IT WORKS
 *  1. No header: continue normally (or 400 if required).
 *  2. Header present and a saved response exists for (this user, this key):
 *       - same request fingerprint  -> replay the saved response, do NOT run the handler
 *       - different fingerprint     -> 409 (the key is being reused for something else)
 *  3. Otherwise run the handler. When it answers with a 2xx, store that response.
 *
 * The fingerprint is a SHA-256 of method + URL + body.
 *
 * Why this is safe from races: the whole chain from this middleware to the
 * controller is synchronous (better-sqlite3 blocks), so two requests can never
 * interleave between "check the key" and "store the response". The
 * UNIQUE (user_id, key) constraint is a second line of defence.
 * Limitation: the response is stored just after the business transaction commits,
 * not inside it, so a crash in that tiny gap would allow one duplicate.
 */
function idempotency({ required = false } = {}) {
  return (req, res, next) => {
    const key = req.get('Idempotency-Key');

    if (key === undefined) {
      if (!required) return next();
      return next(badRequest('Idempotency-Key header is required for this request', [
        { field: 'Idempotency-Key', message: 'Send a unique value, e.g. a UUID, with every create request' },
      ]));
    }
    if (!KEY_PATTERN.test(key)) {
      return next(badRequest('Invalid Idempotency-Key header', [
        { field: 'Idempotency-Key', message: 'Use 8 to 128 characters: letters, digits, dot, underscore, colon or hyphen' },
      ]));
    }

    const userId = req.user.id;
    const fingerprint = crypto
      .createHash('sha256')
      .update(`${req.method} ${req.originalUrl}\n${canonical(req.body)}`)
      .digest('hex');

    deleteExpired.run(); // keys older than 24 hours are forgotten
    const saved = findSaved.get(userId, key);

    if (saved) {
      if (saved.request_hash !== fingerprint) {
        return next(conflict('This Idempotency-Key was already used with a different request'));
      }
      res.setHeader('Idempotent-Replay', 'true');
      return res.status(saved.status_code).type('application/json').send(saved.response_body);
    }

    // First time we see this key: let the handler run, and capture its successful response.
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          saveResponse.run(userId, key, req.method, req.originalUrl, fingerprint, res.statusCode, JSON.stringify(body));
        } catch (err) {
          // The action already succeeded. Never turn that into an error response.
          console.error('Could not store idempotency record:', err.message);
        }
      }
      return originalJson(body);
    };
    next();
  };
}

module.exports = { idempotency };