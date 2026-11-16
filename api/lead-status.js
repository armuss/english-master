const utils = require('../lib/server-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

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

  if (!utils.kvConfigured()) {
    res.status(503).json({ error: 'kv_not_configured' });
    return;
  }

  const body = utils.readBody(req);
  const id = String(body.id || '');
  const status = String(body.status || '');
  if (!/^[a-z0-9]{1,40}$/.test(id) || utils.LEAD_STATUSES.indexOf(status) < 0) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const entry = { status: status, updatedAt: new Date().toISOString(), updatedBy: session.name, updatedByUser: session.username };
  try {
    let previous = 'new';
    try {
      const prev = JSON.parse(await utils.kvCommand(['hget', 'lead_status', id]) || 'null');
      if (prev && prev.status) previous = prev.status;
    } catch (e) {}
    let leadName = null;
    try {
      const raw = await utils.kvCommand(['lrange', 'leads', '0', '499']);
      (raw || []).some(function (s) {
        try { const l = JSON.parse(s); if (l.id === id) { leadName = l.name; return true; } } catch (e) {}
        return false;
      });
    } catch (e) {}

    await utils.kvCommand(['hset', 'lead_status', id, JSON.stringify(entry)]);
    const client = utils.clientInfo(req);
    await utils.logActivity({
      action: 'status_change', user: session.username, name: session.name, role: session.role,
      leadId: id, leadName: leadName, from: previous, to: status, ip: client.ip, ua: client.ua, at: entry.updatedAt,
    });
    res.status(200).json({ ok: true, entry: entry });
  } catch (e) {
    console.error('lead-status: KV write failed:', e.message);
    res.status(500).json({ error: 'kv_write_failed' });
  }
};
