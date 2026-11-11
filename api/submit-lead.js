const utils = require('../lib/server-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  }

  const name = body.name;
  const phone = body.phone;
  const email = body.email;
  const consent = body.consent;

  if (!name || !phone || !email || !consent) {
    res.status(400).json({ error: 'missing_fields' });
    return;
  }

  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    name: String(name).slice(0, 200),
    phone: String(phone).slice(0, 50),
    email: String(email).slice(0, 200),
    course: String(body.course || '').slice(0, 100),
    branch: String(body.branch || '').slice(0, 100),
    message: String(body.message || '').slice(0, 2000),
    createdAt: new Date().toISOString(),
  };

  const results = { stored: false, emailed: false, texted: false };

  try {
    if (utils.kvConfigured()) {
      await utils.kvCommand(['lpush', 'leads', JSON.stringify(record)]);
      await utils.kvCommand(['ltrim', 'leads', '0', '499']);
      results.stored = true;
    }
  } catch (e) {
    console.error('submit-lead: KV store failed:', e.message);
  }

  try {
    const notifyEmail = process.env.ADMIN_NOTIFY_EMAIL;
    if (notifyEmail) {
      const html = [
        '<h2>Yeni iletişim formu talebi</h2>',
        '<p><strong>Ad Soyad:</strong> ' + utils.escapeHtml(record.name) + '</p>',
        '<p><strong>Telefon:</strong> ' + utils.escapeHtml(record.phone) + '</p>',
        '<p><strong>E-posta:</strong> ' + utils.escapeHtml(record.email) + '</p>',
        '<p><strong>Kurs:</strong> ' + utils.escapeHtml(record.course || '-') + '</p>',
        '<p><strong>Şube:</strong> ' + utils.escapeHtml(record.branch || '-') + '</p>',
        '<p><strong>Mesaj:</strong> ' + (utils.escapeHtml(record.message) || '-') + '</p>',
      ].join('\n');
      const r = await utils.sendEmail({ to: notifyEmail, subject: 'Yeni talep: ' + record.name, html: html });
      results.emailed = !r.skipped;
    }
  } catch (e) {
    console.error('submit-lead: email failed:', e.message);
  }

  try {
    const smsText = ('Yeni form: ' + record.name + ' - ' + record.phone + ' - ' + (record.course || '')).slice(0, 160);
    const r = await utils.sendSms(smsText);
    results.texted = !r.skipped;
  } catch (e) {
    console.error('submit-lead: SMS failed:', e.message);
  }

  if (!results.stored && !results.emailed && !results.texted) {
    res.status(500).json({ error: 'all_failed' });
    return;
  }

  res.status(200).json({ ok: true, results: results });
};
