const db = require('../config/db');
const { verifyToken } = require('../utils/jwt');
const { unauthorized } = require('../utils/errors');

const isRevoked = db.prepare('SELECT 1 FROM revoked_tokens WHERE jti = ?');
const findUser = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?');

function authenticate(req, res, next) {
  // Expected header:  Authorization: Bearer <token>
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(unauthorized('Missing or malformed Authorization header'));
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    return next(unauthorized(err.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid token'));
  }

  if (isRevoked.get(payload.jti)) {
    return next(unauthorized('Token has been revoked'));
  }

  // Check the user still exists rather than trusting the token alone.
  const user = findUser.get(payload.userId);
  if (!user) return next(unauthorized('User no longer exists'));

  req.user = user;                                   // { id, name, email, created_at }
  req.auth = { jti: payload.jti, exp: payload.exp }; // needed by logout
  next();
}

module.exports = { authenticate };