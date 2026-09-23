'use strict';
const { randomBytes } = require('node:crypto');

// Only identity is verified on the server. Time records remain in local device storage.
function createGoogleRoutes({ clientId = '', origins = [], verifyToken, now = Date.now } = {}) {
  const challenges = new Map();
  const json = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
    res.end(JSON.stringify(body));
  };
  return async function googleRoutes(req, res, pathname) {
    if (!['/api/config', '/api/auth/google'].includes(pathname)) return false;
    if (pathname === '/api/config') {
      if (req.method !== 'GET') { json(res, 405, { error: 'Method not allowed.' }); return true; }
      if (!clientId) { json(res, 200, { googleClientId: null }); return true; }
      for (const [key, value] of challenges) if (value.expires <= now()) challenges.delete(key);
      if (challenges.size >= 1000) { json(res, 429, { error: 'Please try again in a few minutes.' }); return true; }
      const csrfToken = randomBytes(32).toString('hex');
      const nonce = randomBytes(32).toString('hex');
      challenges.set(csrfToken, { nonce, expires: now() + 600000 });
      const secure = origins.some(origin => origin.startsWith('https:')) ? '; Secure' : '';
      json(res, 200, { googleClientId: clientId, csrfToken, nonce }, { 'Set-Cookie': `tempo_google_challenge=${csrfToken}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=600${secure}` });
      return true;
    }
    if (req.method !== 'POST') { json(res, 405, { error: 'Method not allowed.' }); return true; }
    if (!clientId || !verifyToken) { json(res, 503, { error: 'Google sign-in is not configured.' }); return true; }
    if (!origins.includes(req.headers.origin) || !req.headers['content-type']?.startsWith('application/json')) { json(res, 403, { error: 'Request origin is not allowed.' }); return true; }
    const csrfToken = req.headers['x-tempo-csrf'];
    const cookie = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('tempo_google_challenge='))?.slice('tempo_google_challenge='.length);
    const challenge = challenges.get(csrfToken);
    if (!csrfToken || csrfToken !== cookie || !challenge || challenge.expires <= now()) { json(res, 403, { error: 'Sign-in expired. Close this panel and try again.' }); return true; }
    let body = '';
    let tooLarge = false;
    try {
      for await (const chunk of req) {
        if (Buffer.byteLength(body) + chunk.length > 16384) { tooLarge = true; break; }
        body += chunk;
      }
      if (tooLarge) { json(res, 413, { error: 'Request is too large.' }); return true; }
      const { credential } = JSON.parse(body);
      if (typeof credential !== 'string' || !credential) { json(res, 400, { error: 'A Google credential is required.' }); return true; }
      // Consume the challenge before verification, preventing concurrent replay.
      challenges.delete(csrfToken);
      const identity = await verifyToken(credential, clientId);
      if (!identity?.sub || identity.nonce !== challenge.nonce) throw new Error('Invalid identity or nonce');
      json(res, 200, { sub: identity.sub, name: identity.name || 'Google user' }, { 'Set-Cookie': `tempo_google_challenge=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0` });
    } catch { json(res, 401, { error: 'Google sign-in could not be verified. Close this panel and try again.' }); }
    return true;
  };
}
module.exports = { createGoogleRoutes };
