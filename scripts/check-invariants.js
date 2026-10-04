// Verifies that money invariants hold in the database.
const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'data', 'settlenet.db'), { readonly: true });

const badExpenses = db.prepare(`
  SELECT e.id, e.amount_minor, SUM(s.share_minor) AS total_shares
  FROM expenses e JOIN expense_splits s ON s.expense_id = e.id
  GROUP BY e.id
  HAVING e.amount_minor <> SUM(s.share_minor)
`).all();

console.log(badExpenses.length === 0
  ? 'OK: every expense splits to exactly its total.'
  : 'PROBLEM: these expenses do not add up:', badExpenses);

db.close();