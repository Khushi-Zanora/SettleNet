const db = require('../config/db');
const audit = require('./auditService');
const groupService = require('./groupService');
const splitService = require('./splitService');
const money = require('../utils/money');
const { badRequest, forbidden, notFound } = require('../utils/errors');

const selectExpense = db.prepare(`
  SELECT e.*, u.name AS paid_by_name
  FROM expenses e JOIN users u ON u.id = e.paid_by
  WHERE e.id = ?
`);
const selectSplits = db.prepare(`
  SELECT es.user_id, u.name, es.share_minor, es.split_value
  FROM expense_splits es JOIN users u ON u.id = es.user_id
  WHERE es.expense_id = ?
  ORDER BY es.user_id
`);
const selectActiveMemberIds = db.prepare(
  'SELECT user_id FROM group_members WHERE group_id = ? AND removed_at IS NULL ORDER BY user_id'
);
const selectPageIds = db.prepare(`
  SELECT id FROM expenses WHERE group_id = ?
  ORDER BY expense_date DESC, id DESC
  LIMIT ? OFFSET ?
`);
const countForGroup = db.prepare('SELECT COUNT(*) AS n FROM expenses WHERE group_id = ?');

const insertExpense = db.prepare(`
  INSERT INTO expenses
    (group_id, paid_by, description, category, amount_minor, split_method, expense_date, created_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertSplit = db.prepare(
  'INSERT INTO expense_splits (expense_id, user_id, share_minor, split_value) VALUES (?, ?, ?, ?)'
);
const updateExpenseRow = db.prepare(`
  UPDATE expenses
  SET paid_by = ?, description = ?, category = ?, amount_minor = ?,
      split_method = ?, expense_date = ?, updated_at = datetime('now')
  WHERE id = ?
`);
const deleteSplits = db.prepare('DELETE FROM expense_splits WHERE expense_id = ?');
const deleteExpenseRow = db.prepare('DELETE FROM expenses WHERE id = ?');

// ---- Helpers ----

const todayString = () => new Date().toISOString().slice(0, 10);

// What the user originally typed, shown back in a readable form.
function inputValueFor(method, split) {
  if (method === 'percentage') return money.formatBasisPoints(split.split_value); // "33.33"
  if (method === 'custom') return split.split_value;                              // weight
  if (method === 'exact') return money.formatMinor(split.share_minor);
  return null; // equal
}

// Database row -> the JSON object returned by the API.
function present(row) {
  return {
    id: row.id,
    group_id: row.group_id,
    description: row.description,
    category: row.category,
    amount_minor: row.amount_minor,
    amount: money.formatMinor(row.amount_minor),
    paid_by: { id: row.paid_by, name: row.paid_by_name },
    split_method: row.split_method,
    expense_date: row.expense_date,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    splits: selectSplits.all(row.id).map((s) => ({
      user_id: s.user_id,
      name: s.name,
      share_minor: s.share_minor,
      share: money.formatMinor(s.share_minor),
      input_value: inputValueFor(row.split_method, s),
    })),
  };
}

// The small, non-sensitive facts stored in audit logs.
const summarize = (e) => ({
  description: e.description,
  category: e.category,
  amount_minor: e.amount_minor,
  paid_by: e.paid_by,
  split_method: e.split_method,
  expense_date: e.expense_date,
});

/*
 * Shared by create and edit. Checks the payer, then computes the shares.
 * The payer does not have to take part in the split (e.g. paying for others).
 */
function buildExpenseData(groupId, body) {
  const amountMinor = money.parseMoney(body.amount);
  const activeMemberIds = selectActiveMemberIds.all(groupId).map((r) => r.user_id);

  if (!activeMemberIds.includes(body.paid_by)) {
    throw badRequest('Validation failed', [
      { field: 'paid_by', message: 'The payer must be an active member of this group' },
    ]);
  }

  const shares = splitService.computeSplit({
    method: body.split_method,
    amountMinor,
    splits: body.splits,
    activeMemberIds,
  });

  return {
    description: body.description.trim(),
    category: typeof body.category === 'string' ? body.category.trim() : 'general',
    amount_minor: amountMinor,
    paid_by: body.paid_by,
    split_method: body.split_method,
    expense_date: body.expense_date || todayString(),
    shares,
  };
}

function writeSplits(expenseId, shares) {
  for (const s of shares) insertSplit.run(expenseId, s.userId, s.shareMinor, s.splitValue);
}

// Only the creator of an expense or a group admin may edit or delete it.
function assertCanModify(expense, userId) {
  const membership = groupService.assertMember(expense.group_id, userId);
  if (expense.created_by !== userId && membership.role !== 'admin') {
    throw forbidden('Only the person who created this expense or a group admin can change it');
  }
}

function loadExpenseOr404(expenseId) {
  const row = selectExpense.get(expenseId);
  if (!row) throw notFound('Expense not found');
  return row;
}

// ---- Use cases ----

// The caller (route middleware) has already confirmed the user is a group member.
function createExpense(groupId, userId, body) {
  const expenseId = db.transaction(() => {
    const data = buildExpenseData(groupId, body);

    const id = Number(
      insertExpense.run(
        groupId, data.paid_by, data.description, data.category,
        data.amount_minor, data.split_method, data.expense_date, userId
      ).lastInsertRowid
    );
    writeSplits(id, data.shares);

    audit.log({
      userId,
      groupId,
      action: audit.ACTIONS.EXPENSE_CREATED,
      entityType: 'expense',
      entityId: id,
      metadata: summarize(data),
    });
    return id;
  })();

  return present(selectExpense.get(expenseId));
}

function getExpense(expenseId, userId) {
  const row = loadExpenseOr404(expenseId);
  groupService.assertMember(row.group_id, userId);
  return present(row);
}

function listExpenses(groupId, { limit, offset }) {
  const ids = selectPageIds.all(groupId, limit, offset);
  return {
    expenses: ids.map((r) => present(selectExpense.get(r.id))),
    total: countForGroup.get(groupId).n,
    limit,
    offset,
  };
}

// PUT replaces the whole expense: the old split rows are removed and rebuilt.
function updateExpense(expenseId, userId, body) {
  const existing = loadExpenseOr404(expenseId);
  assertCanModify(existing, userId);

  db.transaction(() => {
    const data = buildExpenseData(existing.group_id, body);

    updateExpenseRow.run(
      data.paid_by, data.description, data.category, data.amount_minor,
      data.split_method, data.expense_date, expenseId
    );
    deleteSplits.run(expenseId);
    writeSplits(expenseId, data.shares);

    audit.log({
      userId,
      groupId: existing.group_id,
      action: audit.ACTIONS.EXPENSE_EDITED,
      entityType: 'expense',
      entityId: expenseId,
      metadata: { before: summarize(existing), after: summarize(data) },
    });
  })();

  return present(selectExpense.get(expenseId));
}

// Hard delete (splits go with it through ON DELETE CASCADE). The audit record
// keeps a snapshot, so the history still shows what was removed.
function deleteExpense(expenseId, userId) {
  const existing = loadExpenseOr404(expenseId);
  assertCanModify(existing, userId);

  db.transaction(() => {
    deleteExpenseRow.run(expenseId);
    audit.log({
      userId,
      groupId: existing.group_id,
      action: audit.ACTIONS.EXPENSE_DELETED,
      entityType: 'expense',
      entityId: expenseId,
      metadata: summarize(existing),
    });
  })();
}

module.exports = { createExpense, getExpense, listExpenses, updateExpense, deleteExpense };