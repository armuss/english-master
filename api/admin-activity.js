const utils = require('../lib/server-utils');

// GET  (owners only): team accounts with login stats + the activity log.
// POST (any signed-in user): record that they opened a lead's details.
module.exports = async function handler(req, res) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'not_configured' });
    return;
  }
  const session = utils.getAdminSession(req, secret);
  if (!session) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  if (req.method === 'POST') {
    const body = utils.readBody(req);
    const id = String(body.leadId || '');
    if (!/^[a-z0-9]{1,40}$/.test(id)) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const client = utils.clientInfo(req);
    await utils.logActivity({
      action: 'lead_view', user: session.username, name: session.name, role: session.role,
      leadId: id, leadName: String(body.leadName || '').slice(0, 120) || null, ip: client.ip, ua: client.ua,
    });
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (session.role !== 'owner') {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  const accounts = utils.loadAccounts() || {};
  if (!utils.kvConfigured()) {
    res.status(200).json({ ok: true, kvConfigured: false, accounts: [], log: [] });
    return;
  }
  try {
    const lastLogin = utils.hgetallToObject(await utils.kvCommand(['hgetall', 'admin_last_login']));
    const loginCount = utils.hgetallToObject(await utils.kvCommand(['hgetall', 'admin_login_count']));
    const raw = await utils.kvCommand(['lrange', 'admin_log', '0', '999']);
    const log = (raw || []).map(function (s) { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
    const list = Object.keys(accounts).map(function (u) {
      const a = accounts[u];
      return { username: a.username, name: a.name, role: a.role, lastLogin: lastLogin[u] || null, loginCount: parseInt(loginCount[u], 10) || 0 };
    });
    res.status(200).json({ ok: true, kvConfigured: true, accounts: list, log: log });
  } catch (e) {
    console.error('admin-activity: KV read failed:', e.message);
    res.status(500).json({ error: 'kv_read_failed' });
  }
};
