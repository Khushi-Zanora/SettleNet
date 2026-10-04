// dotenv must load before anything that reads process.env.
require('dotenv').config();

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32 || secret.startsWith('replace_with') || secret.startsWith('PASTE_')) {
  console.error('FATAL: JWT_SECRET is missing or too weak. Set a random value of at least 32 characters in .env');
  process.exit(1);
}

const app = require('./src/app');
const db = require('./src/config/db');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`SettleNet running on http://localhost:${PORT}`);
});

// Close the HTTP server and the database cleanly on Ctrl+C / process stop.
function shutdown() {
  console.log('Shutting down...');
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);