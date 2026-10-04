const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(process.env.DB_PATH || './data/settlenet.db');

// Make sure the folder for the database file exists (e.g. ./data)
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// SQLite does NOT enforce foreign keys unless this is switched on, per connection.
db.pragma('foreign_keys = ON');
// WAL gives better read/write behaviour for a web server.
db.pragma('journal_mode = WAL');

/*
 * MONEY RULE: every *_minor column stores an integer number of paise
 * (1 rupee = 100 paise). 100.50 rupees is stored as 10050. No floats anywhere.
 */
const schema = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS "groups" (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  description TEXT,
  created_by  INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- removed_at is NULL while the person is an active member. Removal is a soft
-- delete so past expenses and history that mention them stay valid.
CREATE TABLE IF NOT EXISTS group_members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id   INTEGER NOT NULL REFERENCES "groups"(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  role       TEXT    NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  removed_at TEXT,
  UNIQUE (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id     INTEGER NOT NULL REFERENCES "groups"(id) ON DELETE CASCADE,
  paid_by      INTEGER NOT NULL REFERENCES users(id),
  description  TEXT    NOT NULL,
  category     TEXT    NOT NULL DEFAULT 'general',
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  split_method TEXT    NOT NULL CHECK (split_method IN ('equal', 'exact', 'percentage', 'custom')),
  expense_date TEXT    NOT NULL,
  created_by   INTEGER NOT NULL REFERENCES users(id),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- One row per participant. share_minor is the final computed share in paise;
-- the shares of an expense always add up exactly to expenses.amount_minor.
-- split_value keeps what the user entered: basis points for percentage
-- (33.33% = 3333), a weight for custom, NULL for equal/exact.
CREATE TABLE IF NOT EXISTS expense_splits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id  INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  share_minor INTEGER NOT NULL CHECK (share_minor >= 0),
  split_value INTEGER,
  UNIQUE (expense_id, user_id)
);

-- A settlement row is a payment that really happened: from_user paid to_user.
-- Recorded payments are included when balances are calculated.
CREATE TABLE IF NOT EXISTS settlements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id     INTEGER NOT NULL REFERENCES "groups"(id) ON DELETE CASCADE,
  from_user    INTEGER NOT NULL REFERENCES users(id),
  to_user      INTEGER NOT NULL REFERENCES users(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  note         TEXT,
  created_by   INTEGER NOT NULL REFERENCES users(id),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (from_user <> to_user)
);

-- group_id is nullable because some events (e.g. registration) are not group-specific.
-- metadata is JSON text and must never contain passwords or tokens.
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id),
  group_id    INTEGER REFERENCES "groups"(id) ON DELETE CASCADE,
  action      TEXT    NOT NULL,
  entity_type TEXT    NOT NULL,
  entity_id   INTEGER,
  metadata    TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Stores the response of a completed write request so a retry with the same
-- Idempotency-Key returns the original response instead of repeating the work.
-- request_hash detects the same key being reused with a different body.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  key           TEXT    NOT NULL,
  method        TEXT    NOT NULL,
  path          TEXT    NOT NULL,
  request_hash  TEXT    NOT NULL,
  status_code   INTEGER NOT NULL,
  response_body TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, key)
);

-- JWTs are stateless, so logout works by remembering the token ID (jti)
-- of every token that was logged out until it would have expired anyway.
CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti        TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_group_members_user    ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group   ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_group_date   ON expenses(group_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expense_splits_expense ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_user   ON expense_splits(user_id);
CREATE INDEX IF NOT EXISTS idx_settlements_group     ON settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_audit_group_created   ON audit_logs(group_id, created_at);
CREATE INDEX IF NOT EXISTS idx_revoked_expires       ON revoked_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at);
`;

db.exec(schema);

module.exports = db;