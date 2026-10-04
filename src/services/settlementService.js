const db = require('../config/db');
const audit = require('./auditService');
const balanceService = require('./balanceService');
const money = require('../utils/money');
const { badRequest, conflict, forbidden } = require('../utils/errors');

// The exact search looks at 2^n subsets, so it is capped (2^20 is about 1M, which is fast).
const MAX_EXACT_PEOPLE = 20;

/* =====================================================================
 * MINIMAL-TRANSFER SETTLEMENT
 *
 * Input: balances in paise that sum to 0 (positive = is owed, negative = owes).
 *
 * Key idea: a set of people whose balances sum to 0 can settle among
 * themselves. A zero-sum group of k people needs at most k-1 transfers
 * (greedy below), and exactly k-1 if no smaller zero-sum subset exists inside.
 * So   total transfers = n - (number of independent zero-sum groups).
 * Fewer transfers therefore means MORE groups, so we split the people into the
 * maximum number of zero-sum groups, then settle each group greedily.
 *
 * This is optimal: any settlement splits people into connected components, each
 * of which is zero-sum and needs at least (size - 1) transfers.
 * Finding the maximum number of groups is NP-hard in general, so the exact
 * search is used for up to MAX_EXACT_PEOPLE people and plain greedy beyond that.
 * ===================================================================== */

// Settles ONE group: biggest debtor pays biggest creditor, repeat.
// Every step fully clears at least one person, and the last step clears two,
// so a group of k people needs at most k-1 transfers.
function greedySettle(members) {
  const byLargest = (a, b) => b.left - a.left || a.userId - b.userId; // tie -> lower id
  const debtors = members
    .filter((m) => m.balanceMinor < 0)
    .map((m) => ({ userId: m.userId, left: -m.balanceMinor }))
    .sort(byLargest);
  const creditors = members
    .filter((m) => m.balanceMinor > 0)
    .map((m) => ({ userId: m.userId, left: m.balanceMinor }))
    .sort(byLargest);

  const transfers = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const pay = Math.min(debtors[d].left, creditors[c].left);
    transfers.push({ fromUser: debtors[d].userId, toUser: creditors[c].userId, amountMinor: pay });
    debtors[d].left -= pay;
    creditors[c].left -= pay;
    if (debtors[d].left === 0) d += 1;
    if (creditors[c].left === 0) c += 1;
  }
  return transfers;
}

/*
 * Splits people into the maximum number of zero-sum groups (bitmask DP).
 *
 * Imagine lining everybody up in some order. Every time the running total of
 * balances returns to 0, one group is complete. best[mask] is the largest number
 * of such returns-to-zero over all orderings of the people in `mask`:
 *     best[mask] = max over i in mask of best[mask without i]
 *                  + 1 if the total balance of `mask` is 0
 * last[mask] remembers which person went last, so the best ordering can be
 * rebuilt afterwards and cut at every point where the running total hits 0.
 * (Balances are integers well below 2^53, so Float64Array holds them exactly.)
 */
function partitionIntoZeroSumGroups(people) {
  const n = people.length;
  const size = 1 << n;
  const sum = new Float64Array(size);
  const best = new Uint8Array(size);
  const last = new Uint8Array(size);

  for (let mask = 1; mask < size; mask += 1) {
    const lowestBit = mask & -mask;
    sum[mask] = sum[mask ^ lowestBit] + people[31 - Math.clz32(lowestBit)].balanceMinor;

    let bestCount = -1;
    let bestLast = 0;
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) {
        const count = best[mask ^ (1 << i)];
        if (count > bestCount) {
          bestCount = count;
          bestLast = i;
        }
      }
    }
    best[mask] = bestCount + (sum[mask] === 0 ? 1 : 0);
    last[mask] = bestLast;
  }

  // Rebuild the best ordering, then cut it wherever the running total is 0.
  const order = [];
  for (let mask = size - 1; mask > 0; mask ^= 1 << last[mask]) order.push(last[mask]);
  order.reverse();

  const groups = [];
  let current = [];
  let running = 0;
  for (const index of order) {
    current.push(people[index]);
    running += people[index].balanceMinor;
    if (running === 0) {
      groups.push(current);
      current = [];
    }
  }
  return groups;
}

/*
 * balances: [{ userId, balanceMinor }] summing to 0.
 * Returns { transfers: [{ fromUser, toUser, amountMinor }], method, peopleInvolved }
 */
function computeSettlementPlan(balances) {
  const total = balances.reduce((sum, b) => sum + b.balanceMinor, 0);
  if (total !== 0) throw new Error(`Cannot settle: balances sum to ${total}, not 0`);

  // Zero balances never take part; sort by id so the result is deterministic.
  const people = balances.filter((b) => b.balanceMinor !== 0).sort((a, b) => a.userId - b.userId);

  let groups;
  let method;
  if (people.length === 0) {
    groups = [];
    method = 'none';
  } else if (people.length <= MAX_EXACT_PEOPLE) {
    groups = partitionIntoZeroSumGroups(people);
    method = 'optimal';
  } else {
    groups = [people];
    method = 'greedy';
  }

  const transfers = groups
    .flatMap(greedySettle)
    .sort((a, b) => b.amountMinor - a.amountMinor || a.fromUser - b.fromUser || a.toUser - b.toUser);

  return { transfers, method, peopleInvolved: people.length };
}

/* =====================================================================
 * Use cases
 * ===================================================================== */

const insertSettlement = db.prepare(
  'INSERT INTO settlements (group_id, from_user, to_user, amount_minor, note, created_by) VALUES (?, ?, ?, ?, ?, ?)'
);
const selectSettlement = db.prepare(`
  SELECT s.id, s.group_id, s.from_user, fu.name AS from_name, s.to_user, tu.name AS to_name,
         s.amount_minor, s.note, s.created_by, s.created_at
  FROM settlements s
  JOIN users fu ON fu.id = s.from_user
  JOIN users tu ON tu.id = s.to_user
  WHERE s.id = ?
`);
const selectSettlementIds = db.prepare(
  'SELECT id FROM settlements WHERE group_id = ? ORDER BY created_at DESC, id DESC'
);

function presentSettlement(row) {
  return {
    id: row.id,
    group_id: row.group_id,
    from: { id: row.from_user, name: row.from_name },
    to: { id: row.to_user, name: row.to_name },
    amount_minor: row.amount_minor,
    amount: money.formatMinor(row.amount_minor),
    note: row.note,
    created_by: row.created_by,
    created_at: row.created_at,
  };
}

// Computes the current plan from live balances and writes an audit record.
function generatePlan(groupId, actorId) {
  const { balances } = balanceService.getGroupBalances(groupId);
  const plan = computeSettlementPlan(
    balances.map((b) => ({ userId: b.user_id, balanceMinor: b.balance_minor }))
  );
  const nameOf = new Map(balances.map((b) => [b.user_id, b.name]));

  const transfers = plan.transfers.map((t) => ({
    from: { id: t.fromUser, name: nameOf.get(t.fromUser) },
    to: { id: t.toUser, name: nameOf.get(t.toUser) },
    amount_minor: t.amountMinor,
    amount: money.formatMinor(t.amountMinor),
  }));

  audit.log({
    userId: actorId,
    groupId,
    action: audit.ACTIONS.SETTLEMENT_GENERATED,
    entityType: 'group',
    entityId: groupId,
    metadata: { transfer_count: transfers.length, method: plan.method, people_involved: plan.peopleInvolved },
  });

  return {
    settled: transfers.length === 0,
    transfers,
    stats: {
      people_involved: plan.peopleInvolved,
      transfer_count: transfers.length,
      worst_case_transfers: Math.max(plan.peopleInvolved - 1, 0), // what naive chaining could need
      method: plan.method, // 'optimal' (exact) | 'greedy' (very large groups) | 'none'
    },
  };
}

/*
 * Records a payment that really happened: from_user paid to_user.
 * actor = { id, role } of the logged-in user.
 * Rules: the actor must be the payer, the receiver, or a group admin; the payer
 * must currently owe money; the receiver must currently be owed money; and the
 * amount cannot exceed what either side's balance allows.
 */
function recordSettlement(groupId, actor, body) {
  const amountMinor = money.parseMoney(body.amount);

  if (actor.id !== body.from_user && actor.id !== body.to_user && actor.role !== 'admin') {
    throw forbidden('Only the payer, the receiver, or a group admin can record this payment');
  }

  const id = db.transaction(() => {
    const { balances } = balanceService.getGroupBalances(groupId);
    const byId = new Map(balances.map((b) => [b.user_id, b]));
    const from = byId.get(body.from_user);
    const to = byId.get(body.to_user);

    const errors = [];
    if (!from) errors.push({ field: 'from_user', message: 'The payer is not part of this group' });
    if (!to) errors.push({ field: 'to_user', message: 'The receiver is not part of this group' });
    if (errors.length > 0) throw badRequest('Validation failed', errors);

    if (from.balance_minor >= 0) throw conflict(`${from.name} does not owe anything in this group`);
    if (to.balance_minor <= 0) throw conflict(`${to.name} is not owed anything in this group`);

    const maxMinor = Math.min(-from.balance_minor, to.balance_minor);
    if (amountMinor > maxMinor) {
      throw conflict(`Amount is too high. The most that can be recorded between them is ${money.formatMinor(maxMinor)}`);
    }

    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
    const newId = Number(
      insertSettlement.run(groupId, body.from_user, body.to_user, amountMinor, note, actor.id).lastInsertRowid
    );

    audit.log({
      userId: actor.id,
      groupId,
      action: audit.ACTIONS.SETTLEMENT_RECORDED,
      entityType: 'settlement',
      entityId: newId,
      metadata: { from_user: body.from_user, to_user: body.to_user, amount_minor: amountMinor, note },
    });
    return newId;
  })();

  return presentSettlement(selectSettlement.get(id));
}

function listSettlements(groupId) {
  return selectSettlementIds.all(groupId).map((r) => presentSettlement(selectSettlement.get(r.id)));
}

module.exports = {
  computeSettlementPlan,
  greedySettle, // exported only so the demo script can compare it with the optimal plan
  generatePlan,
  recordSettlement,
  listSettlements,
};
