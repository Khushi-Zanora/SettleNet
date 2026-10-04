// Generates postman/SettleNet.postman_collection.json
const fs = require('fs');
const path = require('path');

// ---------- small builders ----------

const bearer = (value) => ({ type: 'bearer', bearer: [{ key: 'token', value, type: 'string' }] });
const script = (listen, lines) => ({ listen, script: { type: 'text/javascript', exec: lines } });

const expectStatus = (...codes) =>
  codes.length === 1
    ? `pm.test('Status is ${codes[0]}', () => pm.response.to.have.status(${codes[0]}));`
    : `pm.test('Status is ${codes.join(' or ')}', () => pm.expect([${codes.join(', ')}]).to.include(pm.response.code));`;

/*
 * auth: 'default' inherits the collection Bearer {{token}};
 *       'none' sends no token; 'member' uses {{memberToken}}.
 */
function request({ name, method = 'GET', path: urlPath, body, auth = 'default', headers = [], description, tests = [], prerequest = [] }) {
  const header = [...headers];
  const req = { method, header, url: `{{baseUrl}}${urlPath}` };
  if (description) req.description = description;
  if (body !== undefined) {
    header.push({ key: 'Content-Type', value: 'application/json' });
    req.body = { mode: 'raw', raw: body, options: { raw: { language: 'json' } } };
  }
  if (auth === 'none') req.auth = { type: 'noauth' };
  if (auth === 'member') req.auth = bearer('{{memberToken}}');

  const event = [];
  if (prerequest.length) event.push(script('prerequest', prerequest));
  if (tests.length) event.push(script('test', tests));
  return { name, event, request: req };
}

const folder = (name, description, item) => ({ name, description, item });

// ---------- reusable script snippets ----------

const newKey = (variable) =>
  `pm.collectionVariables.set('${variable}', pm.variables.replaceIn('{{$guid}}'));`;

const saveLogin = (tokenVar, idVar) => [
  `if (pm.response.code === 200 || pm.response.code === 201) {`,
  `  const data = pm.response.json().data;`,
  `  pm.collectionVariables.set('${tokenVar}', data.token);`,
  `  pm.collectionVariables.set('${idVar}', data.user.id);`,
  `}`,
];

const saveExpenseId = [
  `const body = pm.response.json();`,
  `if (body.data && body.data.expense) pm.collectionVariables.set('expenseId', body.data.expense.id);`,
];

const expenseHeaders = (variable) => [{ key: 'Idempotency-Key', value: `{{${variable}}}` }];

// ---------- the requests ----------

const auth = folder('1. Auth', 'Register and log in. Run these first. Registering twice returns 409; just log in instead.', [
  request({
    name: 'Register (owner)', method: 'POST', path: '/api/auth/register', auth: 'none',
    body: '{\n  "name": "Khushi",\n  "email": "{{ownerEmail}}",\n  "password": "{{password}}"\n}',
    tests: [expectStatus(201, 409), ...saveLogin('token', 'userId')],
  }),
  request({
    name: 'Register (member)', method: 'POST', path: '/api/auth/register', auth: 'none',
    body: '{\n  "name": "Riya",\n  "email": "{{memberEmail}}",\n  "password": "{{password}}"\n}',
    tests: [expectStatus(201, 409), ...saveLogin('memberToken', 'memberId')],
  }),
  request({
    name: 'Login (owner)', method: 'POST', path: '/api/auth/login', auth: 'none',
    body: '{\n  "email": "{{ownerEmail}}",\n  "password": "{{password}}"\n}',
    tests: [expectStatus(200), ...saveLogin('token', 'userId')],
  }),
  request({
    name: 'Login (member)', method: 'POST', path: '/api/auth/login', auth: 'none',
    body: '{\n  "email": "{{memberEmail}}",\n  "password": "{{password}}"\n}',
    tests: [expectStatus(200), ...saveLogin('memberToken', 'memberId')],
  }),
]);

const users = folder('2. Users', null, [
  request({
    name: 'Get profile', path: '/api/users/me',
    tests: [expectStatus(200), `pm.test('No password in response', () => pm.expect(pm.response.text()).to.not.include('password'));`],
  }),
]);

const groups = folder('3. Groups', null, [
  request({
    name: 'Create group', method: 'POST', path: '/api/groups',
    description: 'Idempotent: a fresh Idempotency-Key is generated before each send.',
    headers: expenseHeaders('idempotencyKey'),
    prerequest: [newKey('idempotencyKey')],
    body: '{\n  "name": "Goa Trip",\n  "description": "Beach trip with friends"\n}',
    tests: [expectStatus(201), `pm.collectionVariables.set('groupId', pm.response.json().data.group.id);`],
  }),
  request({ name: 'Get my groups', path: '/api/groups', tests: [expectStatus(200)] }),
  request({ name: 'Get group', path: '/api/groups/{{groupId}}', tests: [expectStatus(200)] }),
  request({
    name: 'Add member', method: 'POST', path: '/api/groups/{{groupId}}/members',
    description: 'Admin only. The user must already be registered.',
    body: '{\n  "email": "{{memberEmail}}"\n}',
    tests: [expectStatus(201, 409)],
  }),
]);

const expenses = folder('4. Expenses', 'Run in order. The first two requests demonstrate idempotency.', [
  request({
    name: 'Create expense: equal split', method: 'POST', path: '/api/groups/{{groupId}}/expenses',
    description: 'Generates a new key and stores it as {{expenseKey}}. Equal split among all members when "splits" is omitted.',
    headers: expenseHeaders('expenseKey'),
    prerequest: [newKey('expenseKey')],
    body: '{\n  "description": "Dinner at the beach shack",\n  "category": "food",\n  "amount": "1000.00",\n  "paid_by": {{userId}},\n  "split_method": "equal",\n  "expense_date": "2026-10-03"\n}',
    tests: [expectStatus(201), ...saveExpenseId],
  }),
  request({
    name: 'Create expense: replay same key', method: 'POST', path: '/api/groups/{{groupId}}/expenses',
    description: 'Identical request and identical key. Expect 201, the SAME expense id, and the header Idempotent-Replay: true. No second expense is created.',
    headers: expenseHeaders('expenseKey'),
    body: '{\n  "description": "Dinner at the beach shack",\n  "category": "food",\n  "amount": "1000.00",\n  "paid_by": {{userId}},\n  "split_method": "equal",\n  "expense_date": "2026-10-03"\n}',
    tests: [
      expectStatus(201),
      `pm.test('Served as a replay', () => pm.response.to.have.header('Idempotent-Replay', 'true'));`,
    ],
  }),
  request({
    name: 'Create expense: exact split', method: 'POST', path: '/api/groups/{{groupId}}/expenses',
    headers: expenseHeaders('idempotencyKey'),
    prerequest: [newKey('idempotencyKey')],
    body: '{\n  "description": "Hotel",\n  "category": "stay",\n  "amount": "1200.50",\n  "paid_by": {{memberId}},\n  "split_method": "exact",\n  "splits": [\n    { "user_id": {{userId}}, "value": "500.25" },\n    { "user_id": {{memberId}}, "value": "700.25" }\n  ]\n}',
    tests: [expectStatus(201), ...saveExpenseId],
  }),
  request({
    name: 'Create expense: percentage split', method: 'POST', path: '/api/groups/{{groupId}}/expenses',
    headers: expenseHeaders('idempotencyKey'),
    prerequest: [newKey('idempotencyKey')],
    body: '{\n  "description": "Taxi to the airport",\n  "category": "transport",\n  "amount": "999.99",\n  "paid_by": {{userId}},\n  "split_method": "percentage",\n  "splits": [\n    { "user_id": {{userId}}, "value": "60" },\n    { "user_id": {{memberId}}, "value": "40" }\n  ]\n}',
    tests: [
      expectStatus(201),
      `const shares = pm.response.json().data.expense.splits.reduce((sum, s) => sum + s.share_minor, 0);`,
      `pm.test('Shares add up to the total exactly', () => pm.expect(shares).to.equal(99999));`,
      ...saveExpenseId,
    ],
  }),
  request({
    name: 'Create expense: custom split (weights)', method: 'POST', path: '/api/groups/{{groupId}}/expenses',
    description: 'Custom split uses integer weights: weight 2 pays double a weight of 1. This expense is edited and then deleted below.',
    headers: expenseHeaders('idempotencyKey'),
    prerequest: [newKey('idempotencyKey')],
    body: '{\n  "description": "Villa",\n  "category": "stay",\n  "amount": "900.00",\n  "paid_by": {{userId}},\n  "split_method": "custom",\n  "splits": [\n    { "user_id": {{userId}}, "value": 2 },\n    { "user_id": {{memberId}}, "value": 1 }\n  ]\n}',
    tests: [expectStatus(201), ...saveExpenseId],
  }),
  request({
    name: 'Get expenses (list)', path: '/api/groups/{{groupId}}/expenses?limit=20&offset=0',
    tests: [expectStatus(200)],
  }),
  request({ name: 'Get expense (details)', path: '/api/expenses/{{expenseId}}', tests: [expectStatus(200)] }),
  request({
    name: 'Edit expense', method: 'PUT', path: '/api/expenses/{{expenseId}}',
    description: 'PUT replaces the whole expense, including its split.',
    body: '{\n  "description": "Villa (corrected)",\n  "category": "stay",\n  "amount": "1000.00",\n  "paid_by": {{userId}},\n  "split_method": "equal"\n}',
    tests: [expectStatus(200)],
  }),
  request({
    name: 'Delete expense', method: 'DELETE', path: '/api/expenses/{{expenseId}}',
    tests: [expectStatus(200)],
  }),
]);

const settlement = folder('5. Balances and settlement', null, [
  request({
    name: 'Get balances', path: '/api/groups/{{groupId}}/balances',
    tests: [
      expectStatus(200),
      `const sum = pm.response.json().data.balances.reduce((s, b) => s + b.balance_minor, 0);`,
      `pm.test('Balances sum to zero', () => pm.expect(sum).to.equal(0));`,
    ],
  }),
  request({
    name: 'Generate settlement plan', path: '/api/groups/{{groupId}}/settlement',
    description: 'Computes the minimal-transfer plan from live balances. The first transfer is saved for the next request.',
    tests: [
      expectStatus(200),
      `const data = pm.response.json().data;`,
      `if (data.transfers.length > 0) {`,
      `  pm.collectionVariables.set('settleFrom', data.transfers[0].from.id);`,
      `  pm.collectionVariables.set('settleTo', data.transfers[0].to.id);`,
      `  pm.collectionVariables.set('settleAmount', data.transfers[0].amount);`,
      `}`,
    ],
  }),
  request({
    name: 'Record payment (first transfer of the plan)', method: 'POST', path: '/api/groups/{{groupId}}/settlements',
    description: 'Run "Generate settlement plan" first. Records that the payer really paid the receiver. Recording is allowed for the payer, the receiver, or a group admin.',
    headers: expenseHeaders('idempotencyKey'),
    prerequest: [newKey('idempotencyKey')],
    body: '{\n  "from_user": {{settleFrom}},\n  "to_user": {{settleTo}},\n  "amount": "{{settleAmount}}",\n  "note": "Paid via UPI"\n}',
    tests: [expectStatus(201)],
  }),
  request({ name: 'List recorded payments', path: '/api/groups/{{groupId}}/settlements', tests: [expectStatus(200)] }),
]);

const history = folder('6. History and export', null, [
  request({ name: 'Get history', path: '/api/groups/{{groupId}}/history?limit=20&offset=0', tests: [expectStatus(200)] }),
  request({
    name: 'Get history (filtered)', path: '/api/groups/{{groupId}}/history?action=EXPENSE_CREATED',
    tests: [expectStatus(200)],
  }),
  request({
    name: 'Export statement (CSV, everything)', path: '/api/groups/{{groupId}}/export',
    description: 'Use "Send and Download" in Postman to save the file.',
    tests: [
      expectStatus(200),
      `pm.test('Is a CSV', () => pm.expect(pm.response.headers.get('Content-Type')).to.include('text/csv'));`,
    ],
  }),
  request({
    name: 'Export statement (CSV, balances only)', path: '/api/groups/{{groupId}}/export?section=balances',
    description: 'section can be: all, expenses, balances, payments, plan.',
    tests: [expectStatus(200)],
  }),
]);

const errors = folder('7. Error examples', 'Each request is expected to fail on purpose. A passing test means the API rejected it correctly.', [
  request({
    name: '401: no token', path: '/api/users/me', auth: 'none',
    tests: [expectStatus(401)],
  }),
  request({
    name: '404: group that does not exist', path: '/api/groups/999999',
    tests: [expectStatus(404)],
  }),
  request({
    name: '400: negative amount', method: 'POST', path: '/api/groups/{{groupId}}/expenses',
    body: '{\n  "description": "Bad",\n  "amount": "-50.00",\n  "paid_by": {{userId}},\n  "split_method": "equal"\n}',
    tests: [expectStatus(400)],
  }),
  request({
    name: '400: exact split does not add up', method: 'POST', path: '/api/groups/{{groupId}}/expenses',
    body: '{\n  "description": "Bad",\n  "amount": "100.00",\n  "paid_by": {{userId}},\n  "split_method": "exact",\n  "splits": [\n    { "user_id": {{userId}}, "value": "60.00" },\n    { "user_id": {{memberId}}, "value": "30.00" }\n  ]\n}',
    tests: [expectStatus(400)],
  }),
  request({
    name: '400: percentages do not total 100', method: 'POST', path: '/api/groups/{{groupId}}/expenses',
    body: '{\n  "description": "Bad",\n  "amount": "100.00",\n  "paid_by": {{userId}},\n  "split_method": "percentage",\n  "splits": [\n    { "user_id": {{userId}}, "value": "60" },\n    { "user_id": {{memberId}}, "value": "30" }\n  ]\n}',
    tests: [expectStatus(400)],
  }),
  request({
    name: '409: idempotency key reused with a different request', method: 'POST', path: '/api/groups/{{groupId}}/expenses',
    description: 'Reuses {{expenseKey}} from the first expense, but with a different amount.',
    headers: expenseHeaders('expenseKey'),
    body: '{\n  "description": "Dinner at the beach shack",\n  "category": "food",\n  "amount": "5555.00",\n  "paid_by": {{userId}},\n  "split_method": "equal",\n  "expense_date": "2026-10-03"\n}',
    tests: [expectStatus(409)],
  }),
]);

const cleanup = folder('8. Membership and logout', 'Run last.', [
  request({
    name: 'Remove member', method: 'DELETE', path: '/api/groups/{{groupId}}/members/{{memberId}}',
    description: 'Returns 409 while the member still has an unsettled balance (settle up first), and 200 once they are at zero.',
    tests: [expectStatus(200, 409)],
  }),
  request({
    name: 'Logout', method: 'POST', path: '/api/auth/logout',
    description: 'Revokes the current token. Run "Login (owner)" again afterwards.',
    tests: [expectStatus(200)],
  }),
]);

// ---------- the collection ----------

const collection = {
  info: {
    name: 'SettleNet API',
    description:
      'REST API tests for SettleNet. Start the server (npm run dev), then run the folders in order. ' +
      'Scripts save the token and ids as collection variables, so requests chain automatically.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: bearer('{{token}}'),
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000' },
    { key: 'ownerEmail', value: 'khushi.postman@example.com' },
    { key: 'memberEmail', value: 'riya.postman@example.com' },
    { key: 'password', value: 'Secret123' },
    ...['token', 'userId', 'memberToken', 'memberId', 'groupId', 'expenseId', 'expenseKey',
      'idempotencyKey', 'settleFrom', 'settleTo', 'settleAmount'].map((key) => ({ key, value: '' })),
  ],
  item: [auth, users, groups, expenses, settlement, history, errors, cleanup],
};

const outDir = path.join(__dirname, '..', 'postman');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'SettleNet.postman_collection.json');
fs.writeFileSync(outFile, JSON.stringify(collection, null, 2));
console.log(`Wrote ${outFile}`);