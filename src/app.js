const path = require('path');
const express = require('express');
const db = require('./config/db');
const { notFoundHandler, errorHandler } = require('./middleware/errorMiddleware');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const groupRoutes = require('./routes/groupRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const settlementRoutes = require('./routes/settlementRoutes');
const historyRoutes = require('./routes/historyRoutes');

const app = express();

// Parse JSON bodies; the limit protects against oversized payloads.
app.use(express.json({ limit: '100kb' }));

// Basic security headers (small, so no extra library is needed).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.removeHeader('X-Powered-By');
  next();
});

// // Serve the frontend (added in the final phase) from /public.
// app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve the built React app (client/dist) when it exists.
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));


// Health check: also proves the database connection works.
app.get('/api/health', (req, res) => {
  const row = db.prepare('SELECT 1 AS ok').get();
  res.json({ status: 'ok', database: row.ok === 1 ? 'connected' : 'error' });
});

// ---- API routes ----
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api', expenseRoutes);
app.use('/api', settlementRoutes);
app.use('/api', historyRoutes);

// React Router fallback: any non-API GET returns index.html so deep links and refreshes work.
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next(); // dist not built yet: fall through to normal 404 handling
  });
});

// These two MUST stay last: unmatched routes -> 404, then every error -> JSON.
app.use('/api', notFoundHandler);
app.use(errorHandler);

module.exports = app;