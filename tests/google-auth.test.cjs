const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createGoogleRoutes } = require('../google-auth.js');
async function request(route, url, { method = 'GET', headers = {}, body } = {}) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  req.method = method; req.headers = headers;
  const result = {};
  const res = { writeHead: (status, responseHeaders) => { result.status = status; result.headers = responseHeaders; }, end: value => { result.body = JSON.parse(value); } };
  result.handled = await route(req, res, url); return result;
}
async function challenge(route) {
  const config = await request(route, '/api/config');
  return { config: config.body, headers: { origin: 'http://localhost:4173', 'content-type': 'application/json', 'x-tempo-csrf': config.body.csrfToken, cookie: config.headers['Set-Cookie'].split(';')[0] } };
}
test('Google is clearly unavailable without configuration', async () => {
  const route = createGoogleRoutes();
  assert.equal((await request(route, '/api/config')).body.googleClientId, null);
  assert.equal((await request(route, '/api/auth/google', { method: 'POST' })).status, 503);
});
test('verified Google identity requires nonce, CSRF cookie and same-origin request', async () => {
  let claims; let verificationCount = 0;
  const route = createGoogleRoutes({ clientId: 'test-client', origins: ['http://localhost:4173'], verifyToken: async (token, audience) => { assert.equal(token, 'test-token'); assert.equal(audience, 'test-client'); verificationCount++; return claims; } });
  const { config, headers } = await challenge(route);
  claims = { sub: '12345', name: 'Test person', nonce: config.nonce };
  const accepted = await request(route, '/api/auth/google', { method: 'POST', headers, body: { credential: 'test-token' } });
  assert.equal(accepted.status, 200); assert.deepEqual(accepted.body, { sub: '12345', name: 'Test person' });
  const replay = await request(route, '/api/auth/google', { method: 'POST', headers, body: { credential: 'test-token' } });
  assert.equal(replay.status, 403); assert.equal(verificationCount, 1);
});
test('cross-origin requests are rejected before verification', async () => {
  const route = createGoogleRoutes({ clientId: 'test-client', origins: ['http://localhost:4173'], verifyToken: () => { throw new Error('must not be called'); } });
  const { headers } = await challenge(route);
  headers.origin = 'https://unrelated.example';
  assert.equal((await request(route, '/api/auth/google', { method: 'POST', headers, body: { credential: 'test-token' } })).status, 403);
});
test('missing CSRF cookie is rejected', async () => {
  const route = createGoogleRoutes({ clientId: 'test-client', origins: ['http://localhost:4173'], verifyToken: () => { throw new Error('must not be called'); } });
  const { headers } = await challenge(route); delete headers.cookie;
  assert.equal((await request(route, '/api/auth/google', { method: 'POST', headers, body: { credential: 'test-token' } })).status, 403);
});
test('nonce mismatch and invalid signatures never create a Google identity', async () => {
  for (const verifier of [async () => ({ sub: '123', nonce: 'wrong-nonce' }), async () => { throw new Error('invalid signature'); }]) {
    const route = createGoogleRoutes({ clientId: 'test-client', origins: ['http://localhost:4173'], verifyToken: verifier });
    const { headers } = await challenge(route);
    assert.equal((await request(route, '/api/auth/google', { method: 'POST', headers, body: { credential: 'invalid-token' } })).status, 401);
  }
});
test('expired challenges require starting sign-in again', async () => {
  let currentTime = 1000;
  const route = createGoogleRoutes({ clientId: 'test-client', origins: ['http://localhost:4173'], now: () => currentTime, verifyToken: () => { throw new Error('must not be called'); } });
  const { headers } = await challenge(route); currentTime += 600001;
  assert.equal((await request(route, '/api/auth/google', { method: 'POST', headers, body: { credential: 'test-token' } })).status, 403);
});
