const utils = require('../lib/server-utils');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const MAX_FAILS = 5; // per username, then locked for LOCK_SECONDS
const MAX_IP_FAILS = 20; // per IP address
const LOCK_SECONDS = 15 * 60;
// Used when the username doesn't exist, so a wrong username takes as long as a wrong password.
const DUMMY_HASH = 's1$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';

async function failCount(key) {
  try { return parseInt(await utils.kvCommand(['get', key]), 10) || 0; } catch (e) { return 0; }
}
async function addFail(key) {
  try {
    const n = await utils.kvCommand(['incr', key]);
    if (n === 1) await utils.kvCommand(['expire', key, String(LOCK_SECONDS)]);
  } catch (e) {}
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const secret = process.env.ADMIN_SESSION_SECRET;
  const accounts = utils.loadAccounts();
  if (!secret || !accounts) {
    res.status(500).json({ error: 'not_configured' });
    return;
  }

  const body = utils.readBody(req);
  const username = String(body.username || '').trim().toLowerCase().slice(0, 40);
  const password = String(body.password || '');
  if (!username || !password) {
    res.status(400).json({ error: 'missing_fields' });
    return;
  }

  const client = utils.clientInfo(req);
  const userKey = 'login_fail:' + username.replace(/[^a-z0-9._-]/g, '');
  const ipKey = 'login_fail_ip:' + client.ip;
  if ((await failCount(userKey)) >= MAX_FAILS || (await failCount(ipKey)) >= MAX_IP_FAILS) {
    res.status(429).json({ error: 'locked', retryMinutes: LOCK_SECONDS / 60 });
    return;
  }

  const account = accounts[username];
  const ok = utils.verifyPassword(password, account ? account.hash : DUMMY_HASH) && !!account;
  if (!ok) {
    await addFail(userKey);
    await addFail(ipKey);
    await utils.logActivity({
      action: 'login_failed',
      user: account ? account.username : null,
      name: account ? account.name : null,
      attempted: account ? null : username.slice(0, 40),
      ip: client.ip,
      ua: client.ua,
    });
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  try { await utils.kvCommand(['del', userKey]); } catch (e) {}
  const now = new Date().toISOString();
  try {
    if (utils.kvConfigured()) {
      await utils.kvCommand(['hset', 'admin_last_login', account.username, now]);
      await utils.kvCommand(['hincrby', 'admin_login_count', account.username, '1']);
    }
  } catch (e) {
    console.error('admin-login: stats failed:', e.message);
  }
  await utils.logActivity({ action: 'login', user: account.username, name: account.name, role: account.role, ip: client.ip, ua: client.ua, at: now });

  const expiry = Date.now() + SESSION_TTL_MS;
  const cookieValue = utils.sign(expiry + '|' + account.username, secret);
  res.setHeader('Set-Cookie', 'admin_session=' + cookieValue + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=' + Math.floor(SESSION_TTL_MS / 1000));
  res.status(200).json({ ok: true, name: account.name, role: account.role, username: account.username });
};
