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

  const session = utils.getAdminSession(req, secret);
  if (!session) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  if (!utils.kvConfigured()) {
    res.status(200).json({ ok: true, kvConfigured: false, leads: [], name: session.name, role: session.role, username: session.username });
    return;
  }

  try {
    const raw = await utils.kvCommand(['lrange', 'leads', '0', '199']);
    const statuses = await utils.getLeadStatuses();
    const leads = (raw || [])
      .map(function (s) {
        try { return JSON.parse(s); } catch (e) { return null; }
      })
      .filter(Boolean)
      .map(function (lead) {
        const st = statuses[lead.id];
        lead.status = st && utils.LEAD_STATUSES.indexOf(st.status) > -1 ? st.status : 'new';
        lead.statusUpdatedAt = st ? st.updatedAt : null;
        lead.statusUpdatedBy = st ? st.updatedBy : null;
        return lead;
      });
    res.status(200).json({ ok: true, kvConfigured: true, leads: leads, name: session.name, role: session.role, username: session.username });
  } catch (e) {
    console.error('leads: KV read failed:', e.message);
    res.status(500).json({ error: 'kv_read_failed' });
  }
};
