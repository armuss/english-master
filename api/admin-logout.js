const utils = require('../lib/server-utils');

module.exports = async function handler(req, res) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  const session = secret ? utils.getAdminSession(req, secret) : null;
  if (session) {
    const client = utils.clientInfo(req);
    await utils.logActivity({ action: 'logout', user: session.username, name: session.name, role: session.role, ip: client.ip, ua: client.ua });
  }
  res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  res.status(200).json({ ok: true });
};
