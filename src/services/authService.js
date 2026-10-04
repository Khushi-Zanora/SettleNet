const bcrypt = require('bcrypt');
const db = require('../config/db');
const { signToken } = require('../utils/jwt');
const { conflict, unauthorized } = require('../utils/errors');
const audit = require('./auditService');

const ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10;

// Used to burn the same CPU time when the email does not exist (see login()).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-0', ROUNDS);

const findIdByEmail = db.prepare('SELECT id FROM users WHERE email = ?');
const findForLogin = db.prepare('SELECT id, name, email, password_hash, created_at FROM users WHERE email = ?');
const findPublicById = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?');
const insertUser = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
const insertRevoked = db.prepare('INSERT OR IGNORE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)');
// Once a token is past its expiry it is invalid anyway, so its revocation row can go.
const deleteExpiredRevoked = db.prepare('DELETE FROM revoked_tokens WHERE expires_at < ?');

const normalizeEmail = (email) => email.trim().toLowerCase();

async function register({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email);

  if (findIdByEmail.get(normalizedEmail)) {
    throw conflict('An account with this email already exists');
  }

  // Hashing is slow on purpose (that is what makes brute force expensive),
  // so it happens before the DB transaction to keep the transaction short.
  const passwordHash = await bcrypt.hash(password, ROUNDS);

  const createUser = db.transaction(() => {
    const info = insertUser.run(name.trim(), normalizedEmail, passwordHash);
    const userId = Number(info.lastInsertRowid);
    audit.log({
      userId,
      action: audit.ACTIONS.USER_REGISTERED,
      entityType: 'user',
      entityId: userId,
    });
    return userId;
  });

  let userId;
  try {
    userId = createUser();
  } catch (err) {
    // Two simultaneous registrations with the same email: the UNIQUE constraint wins.
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw conflict('An account with this email already exists');
    }
    throw err;
  }

  const user = findPublicById.get(userId);
  return { user, token: signToken(user) };
}

async function login({ email, password }) {
  const row = findForLogin.get(normalizeEmail(email));

  // Always run one bcrypt comparison, even if the user does not exist, so an
  // attacker cannot tell valid emails from invalid ones by response time.
  const passwordOk = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);

  if (!row || !passwordOk) {
    throw unauthorized('Invalid email or password');
  }

  audit.log({
    userId: row.id,
    action: audit.ACTIONS.USER_LOGIN,
    entityType: 'user',
    entityId: row.id,
  });

  const user = { id: row.id, name: row.name, email: row.email, created_at: row.created_at };
  return { user, token: signToken(user) };
}

// `auth` comes from authMiddleware: { jti, exp } of the token being logged out.
function logout(userId, auth) {
  const expiresAt = new Date(auth.exp * 1000).toISOString();

  db.transaction(() => {
    insertRevoked.run(auth.jti, expiresAt);
    deleteExpiredRevoked.run(new Date().toISOString());
    audit.log({
      userId,
      action: audit.ACTIONS.USER_LOGOUT,
      entityType: 'user',
      entityId: userId,
    });
  })();
}

module.exports = { register, login, logout };