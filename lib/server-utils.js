// Shared helpers for the API routes under /api. This file lives outside /api
// on purpose: Vercel turns every file directly inside /api into its own
// serverless function route, so shared code has to live elsewhere.

const crypto = require('crypto');

function sign(value, secret) {
  const h = crypto.createHmac('sha256', secret).update(value).digest('hex');
  return value + '.' + h;
}

function verify(signed, secret) {
  if (!signed) return null;
  const idx = signed.lastIndexOf('.');
  if (idx < 0) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto.createHmac('sha256', secret).update(value).digest('hex');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  return value;
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach(function (part) {
    const idx = part.indexOf('=');
    if (idx > -1) {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  });
  return out;
}

// ---- Admin accounts -------------------------------------------------------
// Accounts live in the ADMIN_ACCOUNTS environment variable (set in Vercel, never
// committed): a JSON array of { "u": username, "n": display name,
// "r": "owner" | "admin", "h": "s1$<saltHex>$<scryptHashHex>" }.
// Passwords are only ever stored as scrypt hashes.

const ROLES = ['owner', 'admin'];

function loadAccounts() {
  const raw = process.env.ADMIN_ACCOUNTS;
  if (!raw) return null;
  let list;
  try { list = JSON.parse(raw); } catch (e) { console.error('ADMIN_ACCOUNTS is not valid JSON'); return null; }
  if (!Array.isArray(list)) return null;
  const map = {};
  list.forEach(function (a) {
    if (!a || typeof a.u !== 'string' || typeof a.h !== 'string') return;
    const username = a.u.trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,40}$/.test(username)) return;
    map[username] = {
      username: username,
      name: String(a.n || username).slice(0, 60),
      role: ROLES.indexOf(a.r) > -1 ? a.r : 'admin',
      hash: a.h,
    };
  });
  return Object.keys(map).length ? map : null;
}

function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 32);
  return 's1$' + salt.toString('hex') + '$' + hash.toString('hex');
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 's1') return false;
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(String(password), Buffer.from(parts[1], 'hex'), expected.length || 32);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// Reads and validates the admin_session cookie from a request. Returns
// { username, name, role } when the session is valid, not expired and the
// account still exists in ADMIN_ACCOUNTS; null otherwise.
// The cookie value is "<expiryMs>|<username>", HMAC-signed by sign().
function getAdminSession(req, secret) {
  const cookies = parseCookies(req.headers.cookie);
  const value = verify(cookies.admin_session, secret);
  if (!value) return null;
  const sep = value.indexOf('|');
  if (sep < 0) return null;
  const expiry = parseInt(value.slice(0, sep), 10);
  if (!expiry || expiry < Date.now()) return null;
  const accounts = loadAccounts();
  const account = accounts && accounts[value.slice(sep + 1)];
  if (!account) return null;
  return { username: account.username, name: account.name, role: account.role };
}

function clientInfo(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '');
  return {
    ip: (fwd.split(',')[0] || req.headers['x-real-ip'] || '').trim().slice(0, 64),
    ua: String(req.headers['user-agent'] || '').slice(0, 220),
  };
}

// Activity log: newest first in the "admin_log" list, capped at 3000 entries.
async function logActivity(entry) {
  try {
    if (!kvConfigured()) return;
    entry.at = entry.at || new Date().toISOString();
    await kvCommand(['lpush', 'admin_log', JSON.stringify(entry)]);
    await kvCommand(['ltrim', 'admin_log', '0', '2999']);
  } catch (e) {
    console.error('logActivity failed:', e.message);
  }
}

function readBody(req) {
  let body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  }
  return body;
}

function hgetallToObject(raw) {
  const out = {};
  if (Array.isArray(raw)) {
    for (let i = 0; i + 1 < raw.length; i += 2) out[raw[i]] = raw[i + 1];
  } else if (raw && typeof raw === 'object') {
    Object.keys(raw).forEach(function (k) { out[k] = raw[k]; });
  }
  return out;
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// Vercel KV / Upstash Redis REST API. Set via the "Storage" tab on the
// Vercel project (add a KV / Upstash Redis database) — it injects
// KV_REST_API_URL and KV_REST_API_TOKEN automatically.
async function kvCommand(parts) {
  const KV_URL = kvUrl();
  const KV_TOKEN = kvToken();
  if (!KV_URL || !KV_TOKEN) return null;
  // Command sent as a JSON array body, so long values (messages) never hit URL length limits.
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(parts.map(String)),
  });
  if (!r.ok) throw new Error('KV error ' + r.status);
  const data = await r.json();
  return data.result;
}

// The Vercel Storage (Upstash) integration names these KV_* or UPSTASH_REDIS_* depending on setup.
function kvUrl() { return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL; }
function kvToken() { return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN; }

function kvConfigured() {
  return !!(kvUrl() && kvToken());
}

const LEAD_STATUSES = ['new', 'called', 'placement', 'enrolled', 'declined'];

// Statuses live in the "lead_status" hash (field = lead id, value = JSON
// {status, updatedAt, updatedBy}); a lead with no entry is still "new".
async function getLeadStatuses() {
  const raw = hgetallToObject(await kvCommand(['hgetall', 'lead_status']));
  const out = {};
  Object.keys(raw).forEach(function (k) { try { out[k] = JSON.parse(raw[k]); } catch (e) {} });
  return out;
}

// Resend (resend.com) transactional email API.
async function sendEmail(opts) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) return { skipped: true };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: from, to: opts.to, subject: opts.subject, html: opts.html }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Resend error ' + res.status + ': ' + text);
  }
  return { ok: true };
}

// Netgsm (netgsm.com.tr) SMS "send/get" REST API. msgheader must match an
// approved sender title in the Netgsm panel.
async function sendSms(message) {
  const usercode = process.env.NETGSM_USERCODE;
  const password = process.env.NETGSM_PASSWORD;
  const msgheader = process.env.NETGSM_MSGHEADER;
  const phone = process.env.NETGSM_NOTIFY_PHONE;
  if (!usercode || !password || !msgheader || !phone) return { skipped: true };
  const params = new URLSearchParams({ usercode: usercode, password: password, gsmno: phone, message: message, msgheader: msgheader });
  const res = await fetch('https://api.netgsm.com.tr/sms/send/get?' + params.toString());
  const text = (await res.text()).trim();
  if (!text.startsWith('00')) throw new Error('Netgsm error: ' + text);
  return { ok: true, raw: text };
}

module.exports = {
  sign: sign,
  verify: verify,
  parseCookies: parseCookies,
  getAdminSession: getAdminSession,
  loadAccounts: loadAccounts,
  hashPassword: hashPassword,
  verifyPassword: verifyPassword,
  clientInfo: clientInfo,
  logActivity: logActivity,
  readBody: readBody,
  hgetallToObject: hgetallToObject,
  escapeHtml: escapeHtml,
  kvCommand: kvCommand,
  kvConfigured: kvConfigured,
  LEAD_STATUSES: LEAD_STATUSES,
  getLeadStatuses: getLeadStatuses,
  sendEmail: sendEmail,
  sendSms: sendSms,
};
