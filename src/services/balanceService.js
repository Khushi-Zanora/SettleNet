const db = require('../config/db');
const money = require('../utils/money');

/*
 * BALANCE CALCULATION
 * Every money movement in a group is turned into a signed row for one person:
 *   + amount of an expense they paid           (they fronted money for the group)
 *   - their share of an expense                (what they actually consumed)
 *   + a settlement payment they made           (reduces what they owe)
 *   - a settlement payment they received       (reduces what they are owed)
 * Summing per person gives the net balance in paise:
 *   positive -> the group owes them     negative -> they owe the group
 * Because each rupee paid is also a rupee of shares, and each payment is added
 * to one person and subtracted from another, all balances in a group sum to 0.
 */
const netByUser = db.prepare(`
  SELECT user_id, SUM(delta) AS net FROM (
    SELECT paid_by AS user_id, amount_minor AS delta
      FROM expenses WHERE group_id = @g
    UNION ALL
    SELECT es.user_id, -es.share_minor
      FROM expense_splits es JOIN expenses e ON e.id = es.expense_id
     WHERE e.group_id = @g
    UNION ALL
    SELECT from_user, amount_minor FROM settlements WHERE group_id = @g
    UNION ALL
    SELECT to_user, -amount_minor FROM settlements WHERE group_id = @g
  )
  GROUP BY user_id
`);

const selectMembers = db.prepare(`
  SELECT u.id, u.name, (gm.removed_at IS NULL) AS is_active
  FROM group_members gm JOIN users u ON u.id = gm.user_id
  WHERE gm.group_id = ?
`);

const expenseTotals = db.prepare(
  'SELECT COALESCE(SUM(amount_minor), 0) AS total, COUNT(*) AS n FROM expenses WHERE group_id = ?'
);

function loadNets(groupId) {
  const nets = new Map();
  for (const row of netByUser.all({ g: groupId })) nets.set(row.user_id, row.net);
  return nets;
}

function statusOf(balanceMinor) {
  if (balanceMinor > 0) return 'is_owed';
  if (balanceMinor < 0) return 'owes';
  return 'settled';
}

// Returns every relevant member's balance plus a small spending summary.
function getGroupBalances(groupId) {
  const nets = loadNets(groupId);

  const balances = selectMembers
    .all(groupId)
    .map((m) => ({
      user_id: m.id,
      name: m.name,
      is_active: m.is_active === 1,
      balance_minor: nets.get(m.id) || 0,
    }))
    // Former members only matter while they still have a non-zero balance.
    .filter((b) => b.is_active || b.balance_minor !== 0)
    .map((b) => ({ ...b, balance: money.formatMinor(b.balance_minor), status: statusOf(b.balance_minor) }))
    .sort((a, b) => b.balance_minor - a.balance_minor || a.user_id - b.user_id);

  // Safety net: if this ever fails, there is a bug and we must not show wrong money.
  const total = [...nets.values()].reduce((sum, n) => sum + n, 0);
  if (total !== 0) throw new Error(`Balance invariant broken for group ${groupId}: sum is ${total}`);

  const totals = expenseTotals.get(groupId);
  return {
    balances,
    summary: {
      expense_count: totals.n,
      total_spent_minor: totals.total,
      total_spent: money.formatMinor(totals.total),
    },
  };
}

function getNetBalanceMinor(groupId, userId) {
  return loadNets(groupId).get(userId) || 0;
}

module.exports = { getGroupBalances, getNetBalanceMinor };