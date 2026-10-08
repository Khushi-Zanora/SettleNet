const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// settlementService imports the database module, so point it at a throwaway file first.
process.env.DB_PATH = path.join(os.tmpdir(), `settlenet-test-${process.pid}.db`);

const db = require('../src/config/db');
const money = require('../src/utils/money');
const { computeSplit } = require('../src/services/splitService');
const { computeSettlementPlan } = require('../src/services/settlementService');

after(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(process.env.DB_PATH + suffix, { force: true });
});

// ---------------- money ----------------

test('parseMoney converts decimal text to paise without floats', () => {
  assert.equal(money.parseMoney('1200.50'), 120050);
  assert.equal(money.parseMoney('1.15'), 115); // 1.15 * 100 would be 114.99999 with floats
  assert.equal(money.parseMoney('7'), 700);
  assert.equal(money.parseMoney(12.5), 1250);
});

test('parseMoney rejects invalid amounts', () => {
  for (const bad of ['10.999', '-5', '1e5', 'abc', '', '.5', null, undefined, NaN, {}]) {
    assert.equal(money.parseMoney(bad), null, `should reject ${String(bad)}`);
  }
});

test('formatMinor and formatINR', () => {
  assert.equal(money.formatMinor(120050), '1200.50');
  assert.equal(money.formatMinor(5), '0.05');
  assert.equal(money.formatINR(12345678), '\u20B91,23,456.78');
  assert.equal(money.formatINR(-100050), '-\u20B91,000.50');
});

test('allocateProportionally never loses a paisa', () => {
  assert.deepEqual(money.allocateProportionally(100000, [1, 1, 1]), [33334, 33333, 33333]);
  assert.deepEqual(money.allocateProportionally(99999, [5000, 3000, 2000]), [49999, 30000, 20000]);
  for (const total of [1, 2, 99, 100, 12345, 99999999]) {
    const parts = money.allocateProportionally(total, [3, 7, 11, 1]);
    assert.equal(parts.reduce((a, b) => a + b, 0), total);
  }
});

// ---------------- splits ----------------

const shares = (result) => result.map((r) => r.shareMinor);

test('equal split among all members', () => {
  const result = computeSplit({ method: 'equal', amountMinor: 100000, splits: undefined, activeMemberIds: [1, 2, 3] });
  assert.deepEqual(shares(result), [33334, 33333, 33333]);
});

test('exact split must add up to the total', () => {
  const ok = computeSplit({
    method: 'exact', amountMinor: 10000, activeMemberIds: [1, 2],
    splits: [{ user_id: 1, value: '60.00' }, { user_id: 2, value: '40.00' }],
  });
  assert.deepEqual(shares(ok), [6000, 4000]);

  assert.throws(
    () => computeSplit({
      method: 'exact', amountMinor: 10000, activeMemberIds: [1, 2],
      splits: [{ user_id: 1, value: '60.00' }, { user_id: 2, value: '30.00' }],
    }),
    (err) => err.statusCode === 400
  );
});

test('percentage split must total 100 and keeps shares exact', () => {
  const ok = computeSplit({
    method: 'percentage', amountMinor: 99999, activeMemberIds: [1, 2, 3],
    splits: [{ user_id: 1, value: '50' }, { user_id: 2, value: '30' }, { user_id: 3, value: '20' }],
  });
  assert.deepEqual(shares(ok), [49999, 30000, 20000]);

  assert.throws(
    () => computeSplit({
      method: 'percentage', amountMinor: 10000, activeMemberIds: [1, 2],
      splits: [{ user_id: 1, value: '60' }, { user_id: 2, value: '30' }],
    }),
    (err) => err.statusCode === 400
  );
});

test('custom split uses integer weights', () => {
  const result = computeSplit({
    method: 'custom', amountMinor: 90000, activeMemberIds: [1, 2, 3],
    splits: [{ user_id: 1, value: 2 }, { user_id: 2, value: 1 }, { user_id: 3, value: 1 }],
  });
  assert.deepEqual(shares(result), [45000, 22500, 22500]);
});

test('splits reject non-members and duplicates', () => {
  assert.throws(
    () => computeSplit({ method: 'equal', amountMinor: 1000, activeMemberIds: [1, 2], splits: [{ user_id: 9 }] }),
    (err) => err.statusCode === 400
  );
  assert.throws(
    () => computeSplit({ method: 'equal', amountMinor: 1000, activeMemberIds: [1, 2], splits: [{ user_id: 1 }, { user_id: 1 }] }),
    (err) => err.statusCode === 400
  );
});

// ---------------- settlement ----------------

test('spec example: A +800, B -500, C -300 needs two transfers', () => {
  const plan = computeSettlementPlan([
    { userId: 1, balanceMinor: 80000 },
    { userId: 2, balanceMinor: -50000 },
    { userId: 3, balanceMinor: -30000 },
  ]);
  assert.equal(plan.method, 'optimal');
  assert.deepEqual(
    plan.transfers.map((t) => [t.fromUser, t.toUser, t.amountMinor]),
    [[2, 1, 50000], [3, 1, 30000]]
  );
});

test('finds independent groups that plain greedy would merge', () => {
  // {A, C, D} and {B, E} each sum to zero, so 3 transfers is the minimum.
  const plan = computeSettlementPlan([
    { userId: 1, balanceMinor: 600 },
    { userId: 2, balanceMinor: 500 },
    { userId: 3, balanceMinor: -400 },
    { userId: 4, balanceMinor: -200 },
    { userId: 5, balanceMinor: -500 },
  ]);
  assert.equal(plan.transfers.length, 3);
});

test('settled groups produce no transfers, and unbalanced input is refused', () => {
  const plan = computeSettlementPlan([{ userId: 1, balanceMinor: 0 }, { userId: 2, balanceMinor: 0 }]);
  assert.equal(plan.transfers.length, 0);
  assert.throws(() => computeSettlementPlan([{ userId: 1, balanceMinor: 100 }]));
});

test('random balances: every plan zeroes everyone using at most n-1 transfers', () => {
  let seed = 12345; // fixed seed, so a failure can be reproduced
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let round = 0; round < 300; round += 1) {
    const n = 2 + Math.floor(rand() * 9); // 2 to 10 people
    const balances = [];
    let sum = 0;
    for (let i = 1; i < n; i += 1) {
      const value = Math.floor(rand() * 20001) - 10000;
      balances.push({ userId: i, balanceMinor: value });
      sum += value;
    }
    balances.push({ userId: n, balanceMinor: -sum });

    const plan = computeSettlementPlan(balances);

    const after = new Map(balances.map((b) => [b.userId, b.balanceMinor]));
    for (const t of plan.transfers) {
      assert.ok(t.amountMinor > 0);
      after.set(t.fromUser, after.get(t.fromUser) + t.amountMinor);
      after.set(t.toUser, after.get(t.toUser) - t.amountMinor);
    }
    for (const value of after.values()) assert.equal(value, 0);

    const nonZero = balances.filter((b) => b.balanceMinor !== 0).length;
    assert.ok(plan.transfers.length <= Math.max(nonZero - 1, 0));
  }
});