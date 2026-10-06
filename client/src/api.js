const BASE = '/api';
const TOKEN_KEY = 'settlenet_token';

// ---- token storage ----
export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (token) => {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* storage unavailable */ }
};
export const clearToken = () => {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
};

// AuthContext registers a callback here, called when the server says 401 for a logged-in user.
let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export class ApiError extends Error {
  constructor(status, message, details = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details; // [{ field, message }] for validation errors
  }
}

// { field: 'message' } for showing errors under inputs. Several messages for one field are joined.
export function fieldErrorsFrom(err) {
  const out = {};
  for (const d of (err && err.details) || []) {
    if (!d.field) continue;
    out[d.field] = out[d.field] ? `${out[d.field]}. ${d.message}` : d.message;
  }
  return out;
}

// A fresh key per form submission. crypto.randomUUID only exists on https or localhost,
// so fall back to random hex (still matches the server's allowed key pattern) for phone testing over http.
export function newIdempotencyKey() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

const NETWORK_MESSAGE = 'Cannot reach the server. Check your connection and try again.';

async function toApiError(res, hadToken, useAuth) {
  let payload = null;
  try { payload = await res.json(); } catch { /* empty or non-JSON body */ }
  if (res.status === 401 && useAuth && hadToken) {
    clearToken();
    if (onUnauthorized) onUnauthorized();
  }
  const message = (payload && payload.error && payload.error.message) || 'Something went wrong. Please try again.';
  return new ApiError(res.status, message, (payload && payload.error && payload.error.details) || []);
}

async function request(method, path, { body, idempotencyKey, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, NETWORK_MESSAGE);
  }

  if (!res.ok) throw await toApiError(res, Boolean(token), auth);

  try {
    const payload = await res.json();
    return payload.data;
  } catch {
    return null;
  }
}

// Downloads a file (the CSV statement) with the auth header, then saves it via a temporary link.
async function download(path, fallbackName) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError(0, NETWORK_MESSAGE);
  }
  if (!res.ok) throw await toApiError(res, Boolean(token), true);

  const blob = await res.blob();
  const match = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = match ? match[1] : fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body, options) => request('POST', path, { body, ...options }),
  put: (path, body, options) => request('PUT', path, { body, ...options }),
  del: (path) => request('DELETE', path),
  download,
};