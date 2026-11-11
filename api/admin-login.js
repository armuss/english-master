const crypto = require('crypto');
const utils = require('../lib/server-utils');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!adminPassword || !secret) {
    res.status(500).json({ error: 'not_configured' });
    return;
  }

  const given = Buffer.from(String(body.password || ''));
  const expected = Buffer.from(adminPassword);
  const matches = given.length === expected.length && crypto.timingSafeEqual(given, expected);
  if (!matches) {
    res.status(401).json({ error: 'invalid_password' });
    return;
  }

  const expiry = String(Date.now() + SESSION_TTL_MS);
  const cookieValue = utils.sign(expiry, secret);
  res.setHeader('Set-Cookie', 'admin_session=' + cookieValue + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=' + Math.floor(SESSION_TTL_MS / 1000));
  res.status(200).json({ ok: true });
};
