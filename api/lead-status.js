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

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  }

  const id = String(body.id || '');
  const status = String(body.status || '');
  if (!/^[a-z0-9]{1,40}$/.test(id) || utils.LEAD_STATUSES.indexOf(status) < 0) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const entry = { status: status, updatedAt: new Date().toISOString(), updatedBy: session.name };
  try {
    await utils.kvCommand(['hset', 'lead_status', id, JSON.stringify(entry)]);
    res.status(200).json({ ok: true, entry: entry });
  } catch (e) {
    console.error('lead-status: KV write failed:', e.message);
    res.status(500).json({ error: 'kv_write_failed' });
  }
};
