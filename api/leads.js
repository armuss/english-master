const utils = require('../lib/server-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'not_configured' });
    return;
  }

  const cookies = utils.parseCookies(req.headers.cookie);
  const value = utils.verify(cookies.admin_session, secret);
  if (!value || parseInt(value, 10) < Date.now()) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  if (!utils.kvConfigured()) {
    res.status(200).json({ ok: true, kvConfigured: false, leads: [] });
    return;
  }

  try {
    const raw = await utils.kvCommand(['lrange', 'leads', '0', '199']);
    const leads = (raw || [])
      .map(function (s) {
        try { return JSON.parse(s); } catch (e) { return null; }
      })
      .filter(Boolean);
    res.status(200).json({ ok: true, kvConfigured: true, leads: leads });
  } catch (e) {
    console.error('leads: KV read failed:', e.message);
    res.status(500).json({ error: 'kv_read_failed' });
  }
};
