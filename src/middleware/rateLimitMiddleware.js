const { AppError } = require('../utils/errors');

/*
 * Fixed-window limiter kept in memory: each IP gets `max` requests per `windowMs`.
 * Limitations (acceptable here): counters reset when the server restarts, and
 * they are not shared between several server processes. Behind a reverse proxy,
 * set app.set('trust proxy', 1) so req.ip is the real client address.
 */
function rateLimit({ windowMs, max, message }) {
  const hits = new Map(); // ip -> { count, resetAt }

  return (req, res, next) => {
    const now = Date.now();

    // Forget expired entries so the map cannot grow forever.
    if (hits.size > 1000) {
      for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
    }

    let entry = hits.get(req.ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(req.ip, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return next(new AppError(429, message));
    }
    next();
  };
}

module.exports = { rateLimit };