'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
let verifyToken;
if (googleClientId) {
  const { OAuth2Client } = require('google-auth-library');
  const googleClient = new OAuth2Client();
  verifyToken = async (credential, audience) => (await googleClient.verifyIdToken({ idToken: credential, audience })).getPayload();
}
const googleRoutes = require('./google-auth.js').createGoogleRoutes({
  clientId: googleClientId,
  origins: process.env.APP_ORIGIN ? [process.env.APP_ORIGIN] : [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`],
  verifyToken,
});
const PUBLIC_FILES = new Set(['index.html', 'styles.css', 'script.js', 'time-utils.js', 'manifest.webmanifest', 'sw.js', 'icon.svg', 'icon-192.png', 'icon-512.png']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  let filename;
  try { filename = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html'; }
  catch { res.writeHead(400); res.end('Bad request'); return; }
  if (await googleRoutes(req, res, '/' + filename)) return;
  if (!['GET', 'HEAD'].includes(req.method) || !PUBLIC_FILES.has(filename)) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(__dirname, filename), (error, data) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Open http://localhost:${PORT}, or choose a different PORT.` : error.message);
  process.exitCode = 1;
});
server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Tempo is ready at ${url}\nKeep this window open. Press Ctrl+C to stop.`);
  if (process.argv.includes('--open')) {
    if (process.platform === 'win32') spawn('explorer.exe', [url], { windowsHide: true, stdio: 'ignore' }).on('error', () => {});
    else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore' }).on('error', () => {});
  }
});
