const db = require('../config/db');

// One place for action names so they are never mistyped across the codebase.
const ACTIONS = {
  USER_REGISTERED: 'USER_REGISTERED',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  GROUP_CREATED: 'GROUP_CREATED',
  MEMBER_ADDED: 'MEMBER_ADDED',
  MEMBER_REMOVED: 'MEMBER_REMOVED',
  EXPENSE_CREATED: 'EXPENSE_CREATED',
  EXPENSE_EDITED: 'EXPENSE_EDITED',
  EXPENSE_DELETED: 'EXPENSE_DELETED',
  SETTLEMENT_GENERATED: 'SETTLEMENT_GENERATED',
  SETTLEMENT_RECORDED: 'SETTLEMENT_RECORDED',
  STATEMENT_EXPORTED: 'STATEMENT_EXPORTED',
};

const insertLog = db.prepare(`
  INSERT INTO audit_logs (user_id, group_id, action, entity_type, entity_id, metadata)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// Defensive: never let anything sensitive reach the audit table, even by mistake.
const SENSITIVE_KEY = /pass|token|secret|hash|authorization/i;

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const clean = {};
    for (const [key, val] of Object.entries(value)) {
      if (!SENSITIVE_KEY.test(key)) clean[key] = sanitize(val);
    }
    return clean;
  }
  return value;
}

/*
 * Writes one audit record. This is a plain synchronous insert on the shared
 * connection, so when it is called inside db.transaction(...) it commits or
 * rolls back together with the action it describes. An action can therefore
 * never succeed without its audit record, or the other way around.
 */
function log({ userId = null, groupId = null, action, entityType, entityId = null, metadata = null }) {
  insertLog.run(
    userId,
    groupId,
    action,
    entityType,
    entityId,
    metadata ? JSON.stringify(sanitize(metadata)) : null
  );
}

module.exports = { ACTIONS, log };