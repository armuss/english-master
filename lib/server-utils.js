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

// Reads and validates the admin_session cookie from a request. Returns
// { name } when the session is valid and not expired, or null otherwise.
// The cookie value is "<expiryMs>|<encodedName>", HMAC-signed by sign().
function getAdminSession(req, secret) {
  const cookies = parseCookies(req.headers.cookie);
  const value = verify(cookies.admin_session, secret);
  if (!value) return null;
  const sep = value.indexOf('|');
  if (sep < 0) return null;
  const expiry = parseInt(value.slice(0, sep), 10);
  if (!expiry || expiry < Date.now()) return null;
  const name = decodeURIComponent(value.slice(sep + 1));
  return { name: name };
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
  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;
  if (!KV_URL || !KV_TOKEN) return null;
  const url = KV_URL + '/' + parts.map(encodeURIComponent).join('/');
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + KV_TOKEN } });
  if (!r.ok) throw new Error('KV error ' + r.status);
  const data = await r.json();
  return data.result;
}

function kvConfigured() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
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
  escapeHtml: escapeHtml,
  kvCommand: kvCommand,
  kvConfigured: kvConfigured,
  sendEmail: sendEmail,
  sendSms: sendSms,
};
