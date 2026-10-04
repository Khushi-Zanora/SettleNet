const db = require('../config/db');
const money = require('../utils/money');
const { ACTIONS } = require('./auditService');

const selectPage = db.prepare(`
  SELECT a.id, a.user_id, u.name AS user_name, a.action, a.entity_type, a.entity_id,
         a.metadata, a.created_at
  FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
  WHERE a.group_id = @groupId AND (@action IS NULL OR a.action = @action)
  ORDER BY a.id DESC
  LIMIT @limit OFFSET @offset
`);
const countRows = db.prepare(`
  SELECT COUNT(*) AS n FROM audit_logs
  WHERE group_id = @groupId AND (@action IS NULL OR action = @action)
`);
const selectUserName = db.prepare('SELECT name FROM users WHERE id = ?');

const inr = (minor) => (Number.isInteger(minor) ? money.formatINR(minor) : 'an unknown amount');

function parseMetadata(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    return {};
  }
}

// One readable sentence per audit record.
function describe(row, meta, nameOf) {
  const actor = row.user_name || 'Someone';

  switch (row.action) {
    case ACTIONS.GROUP_CREATED:
      return `${actor} created the group "${meta.name}"`;
    case ACTIONS.MEMBER_ADDED:
      return meta.reactivated
        ? `${actor} added ${meta.memberName} back to the group`
        : `${actor} added ${meta.memberName} to the group`;
    case ACTIONS.MEMBER_REMOVED:
      return meta.selfRemoved
        ? `${actor} left the group`
        : `${actor} removed ${nameOf(meta.memberUserId)} from the group`;
    case ACTIONS.EXPENSE_CREATED:
      return `${actor} added expense "${meta.description}" of ${inr(meta.amount_minor)} (${meta.split_method} split)`;
    case ACTIONS.EXPENSE_EDITED: {
      const before = meta.before || {};
      const after = meta.after || {};
      let text = `${actor} edited expense "${after.description}"`;
      if (before.amount_minor !== after.amount_minor) {
        text += `, changing the amount from ${inr(before.amount_minor)} to ${inr(after.amount_minor)}`;
      }
      return text;
    }
    case ACTIONS.EXPENSE_DELETED:
      return `${actor} deleted expense "${meta.description}" of ${inr(meta.amount_minor)}`;
    case ACTIONS.SETTLEMENT_GENERATED:
      return `${actor} generated a settlement plan with ${meta.transfer_count} transfer${meta.transfer_count === 1 ? '' : 's'}`;
    case ACTIONS.SETTLEMENT_RECORDED:
      return `${actor} recorded a payment: ${nameOf(meta.from_user)} paid ${nameOf(meta.to_user)} ${inr(meta.amount_minor)}`;
    case ACTIONS.STATEMENT_EXPORTED:
      return `${actor} exported a statement`;
    default:
      return `${actor} performed ${row.action}`;
  }
}

function getHistory(groupId, { limit, offset, action }) {
  const params = { groupId, action: action || null };

  // Look each user id up once per request.
  const names = new Map();
  const nameOf = (id) => {
    if (!names.has(id)) {
      const row = Number.isInteger(id) ? selectUserName.get(id) : null;
      names.set(id, row ? row.name : 'a former user');
    }
    return names.get(id);
  };

  const history = selectPage.all({ ...params, limit, offset }).map((row) => {
    const metadata = parseMetadata(row.metadata);
    return {
      id: row.id,
      action: row.action,
      description: describe(row, metadata, nameOf),
      user: { id: row.user_id, name: row.user_name },
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      metadata,
      created_at: row.created_at,
    };
  });

  return { history, total: countRows.get(params).n, limit, offset };
}

module.exports = { getHistory };