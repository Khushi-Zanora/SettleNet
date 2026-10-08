# SettleNet

A group-expense settlement engine. Create a group, record shared expenses with different split methods, see who owes whom, and get a settlement plan that **minimizes the number of money transfers**.

## Features

- Registration, login, logout (real token revocation), JWT authentication, bcrypt password hashing
- Groups with admin/member roles and membership-based authorization
- Expenses with four split methods: equal, exact, percentage, custom (shares)
- Money-safe arithmetic: all amounts are integer paise, never floats
- Balance calculation per member
- Minimal-transfer settlement algorithm (exact for up to 20 people with non-zero balances)
- Recorded payments that feed back into balances
- Idempotent writes via the `Idempotency-Key` header
- Audit trail with human-readable group history
- CSV statement export
- Centralized error handling, input validation, login rate limiting
- Responsive React UI with light and dark themes

## Tech stack

Node.js, Express, SQLite (better-sqlite3), JWT (jsonwebtoken), bcrypt. Frontend: React, React Router, Tailwind CSS (built with Vite). Postman for API testing.

## Getting started

Requires Node.js 18 or later.

```powershell
npm install
npm run client:install
copy .env.example .env
```

Generate a secret and paste it into `.env` as `JWT_SECRET`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Development** (two terminals):

```powershell
npm run dev                  # API on http://localhost:3000
cd client; npm run dev       # React on http://localhost:5173 (proxies /api to the API)
```

**Production-style** (one process, one port):

```powershell
npm run build                # builds client/dist
npm start                    # serves the API and the built app on http://localhost:3000
```

Check `http://localhost:3000/api/health`.

### Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port | 3000 |
| `JWT_SECRET` | Signing secret, at least 32 characters (the server refuses to start otherwise) | none |
| `JWT_EXPIRES_IN` | Token lifetime | 2h |
| `DB_PATH` | SQLite file location | ./data/settlenet.db |
| `BCRYPT_ROUNDS` | bcrypt cost factor | 10 |

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Unit tests for money, splits and the settlement algorithm |
| `npm run build` | Builds the React app into `client/dist` |
| `npm run postman` | Regenerates `postman/SettleNet.postman_collection.json` |
| `node scripts/demo-settlement.js` | Shows the algorithm on fixed examples |
| `node scripts/audit.js [PREFIX]` | Prints audit rows, e.g. `node scripts/audit.js EXPENSE_` |
| `node scripts/check-invariants.js` | Checks every expense's shares add up to its total |

## Testing the API with Postman

1. Start the server.
2. In Postman choose Import and select `postman/SettleNet.postman_collection.json`.
3. Run the folders in order (or use the Collection Runner). Scripts save the token and ids automatically.

## API overview

All success responses are `{ "data": ... }`. Errors are `{ "error": { "message": "...", "details": [...] } }`.

| Method | Endpoint | Notes |
|---|---|---|
| POST | /api/auth/register | |
| POST | /api/auth/login | |
| POST | /api/auth/logout | revokes the token |
| GET | /api/users/me | profile |
| POST | /api/groups | idempotent |
| GET | /api/groups | my groups, with my balance in each |
| GET | /api/groups/:id | details and members |
| POST | /api/groups/:id/members | admin only, by email |
| DELETE | /api/groups/:id/members/:userId | admin, or the member leaving |
| POST | /api/groups/:id/expenses | idempotent |
| GET | /api/groups/:id/expenses | `limit`, `offset` |
| GET / PUT / DELETE | /api/expenses/:id | creator or admin for PUT and DELETE |
| GET | /api/groups/:id/balances | |
| GET | /api/groups/:id/settlement | minimal-transfer plan |
| POST | /api/groups/:id/settlements | record a real payment, idempotent |
| GET | /api/groups/:id/settlements | recorded payments |
| GET | /api/groups/:id/history | `limit`, `offset`, `action` |
| GET | /api/groups/:id/export | CSV, `section=all`, `expenses`, `balances`, `payments` or `plan` |

Status codes: 400 validation, 401 unauthenticated, 403 not allowed, 404 not found, 409 conflict, 429 too many attempts, 500 unexpected.

## Architecture

```
Route -> Middleware -> Controller -> Service -> Database
```

```
src/
  config/db.js            SQLite connection and schema
  routes/                 URL to controller mapping
  middleware/             auth, group access, validation, idempotency, rate limit, errors
  controllers/            thin HTTP layer
  services/               business logic (splits, balances, settlement, expenses, audit, history, export)
  utils/                  money, jwt, validators, csv, errors
```

```
client/src/
  api.js                  fetch wrapper: token, JSON envelopes, Idempotency-Key, 401 handling, CSV download
  context/                Auth, Theme, Toast, Groups (shared groups list)
  hooks/useFetch.js       small data-loading hook
  components/             Layout, Sidebar, Modal, Tabs, Button, Field, Icon (inline SVG), ...
  pages/                  Login, Register, Dashboard, CreateGroup, Group (+ tabs), ExpenseForm, Profile
  utils/                  money (display + integer paise helpers), split (live allocation), date
```

## Key design decisions

**Money.** Amounts are integers in paise. Text such as `"1200.50"` is parsed digit by digit into `120050`; there is no `* 100` on a float. Splits use the largest-remainder method (with `BigInt` arithmetic), so shares always add up exactly to the total. The code asserts this and fails loudly instead of saving wrong money.

**Balances.** `net = paid - own shares + payments made - payments received`. Positive means the group owes the person. Balances in a group always sum to zero, and this is checked.

**Settlement algorithm.** Transfers needed = people with a non-zero balance minus the number of independent zero-sum groups among them. So the algorithm finds the maximum number of zero-sum groups with a bitmask DP, then settles each group greedily (largest debtor pays largest creditor). This is optimal for up to 20 people. The general problem is NP-hard, so beyond 20 people it falls back to greedy (at most n-1 transfers) and the API reports which method ran. The plan is computed from live balances and never stored; only payments that really happened are stored.

**Idempotency.** With an `Idempotency-Key` header, the first successful response is stored per (user, key) together with a SHA-256 fingerprint of the request. A retry replays the stored response; the same key with a different request returns 409. Keys expire after 24 hours.

**Audit trail.** Every important action writes an audit row inside the same database transaction as the action itself, so one cannot exist without the other. Sensitive keys are stripped from metadata.

**Security.** bcrypt hashing, pinned JWT algorithm, token revocation on logout, no user enumeration on login, parameterized queries, authorization on every group resource, CSV formula-injection protection, rate-limited auth endpoints.

**Frontend.** Plain React hooks and one small `api.js` wrapper, with no state library. Amounts shown to the user are always the API's own strings. The only client-side money arithmetic is integer paise for the live "left to allocate" bar, using the same largest-remainder method as the server. Each create form keeps one `Idempotency-Key` while its request body is unchanged, so double taps and retries cannot duplicate data. The layout is mobile-first, with a drawer on phones and a fixed sidebar on desktop, and light and dark themes driven by CSS variables.

## Known limitations

- The settlement plan is only guaranteed minimal for up to 20 people with non-zero balances.
- The idempotency record is saved just after the business transaction, not inside it; a crash in that gap could allow one duplicate.
- The rate limiter is in memory and per process.
- There is no endpoint to delete a group or promote another admin.
- Idempotency-Key is optional on the server; the frontend always sends it.
- Editing or deleting an old expense changes balances retroactively.
- The JWT is stored in localStorage (simple, but readable by any script on the page). Mitigated by a 2-hour lifetime and server-side revocation on logout.
- Profile editing and password change are not implemented.
- There are no automated frontend tests; backend logic has unit tests and a Postman collection.