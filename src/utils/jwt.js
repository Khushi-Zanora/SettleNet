const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Pin the algorithm on both sign and verify so a token can't pick its own.
const ALGORITHM = 'HS256';

function signToken(user) {
  return jwt.sign({}, process.env.JWT_SECRET, {
    algorithm: ALGORITHM,
    subject: String(user.id),
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
    jwtid: crypto.randomUUID(), // unique per token; used for logout revocation
  });
}

// Throws JsonWebTokenError / TokenExpiredError if the token is bad.
function verifyToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALGORITHM] });
  return { userId: Number(payload.sub), jti: payload.jti, exp: payload.exp };
}

module.exports = { signToken, verifyToken };