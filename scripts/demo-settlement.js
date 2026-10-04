const { computeSettlementPlan, greedySettle } = require('../src/services/settlementService');
const money = require('../src/utils/money');

// Each case is { person: balance in paise }. Positive = is owed, negative = owes.
const cases = {
  'Spec example (A +800, B -500, C -300)': { A: 80000, B: -50000, C: -30000 },
  'Two hidden groups where plain greedy needs an extra transfer': {
    A: 600, B: 500, C: -400, D: -200, E: -500,
  },
  'Already settled': { A: 0, B: 0 },
};

// 25 people: more than the exact search allows, so the greedy fallback is used.
const big = {};
let running = 0;
for (let i = 1; i <= 24; i += 1) {
  big[`P${i}`] = (((i * 37) % 200) - 100) * 100;
  running += big[`P${i}`];
}
big.P25 = -running;
cases['25 people (greedy fallback)'] = big;

for (const [title, people] of Object.entries(cases)) {
  const names = Object.keys(people);
  const list = names.map((name, i) => ({ userId: i + 1, balanceMinor: people[name] }));
  const nameOf = (id) => names[id - 1];

  const plan = computeSettlementPlan(list);
  const greedyOnly = greedySettle(list.filter((p) => p.balanceMinor !== 0));

  // Apply the transfers and make sure everybody ends at exactly zero.
  const after = Object.fromEntries(list.map((p) => [p.userId, p.balanceMinor]));
  for (const t of plan.transfers) {
    after[t.fromUser] += t.amountMinor;
    after[t.toUser] -= t.amountMinor;
  }
  const allZero = Object.values(after).every((v) => v === 0);

  console.log(`\n${title}`);
  console.log(`  method: ${plan.method}, transfers: ${plan.transfers.length}, plain greedy would use: ${greedyOnly.length}, all balances zero afterwards: ${allZero}`);
  if (plan.transfers.length <= 6) {
    for (const t of plan.transfers) {
      console.log(`  ${nameOf(t.fromUser)} -> ${nameOf(t.toUser)} : ${money.formatINR(t.amountMinor)}`);
    }
  }
}