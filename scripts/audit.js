// Prints audit log rows. Usage: node scripts/audit.js [ACTION_PREFIX]
const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'data', 'settlenet.db'), { readonly: true });
const prefix = process.argv[2] || '';

const rows = db
  .prepare(
    `SELECT id, user_id, group_id, action, entity_id, metadata, created_at
     FROM audit_logs WHERE action LIKE ? ORDER BY id`
  )
  .all(`${prefix}%`);

console.table(rows);
db.close();