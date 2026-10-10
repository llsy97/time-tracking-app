'use strict';
const CACHE = 'tempo-shell-v16';
const ASSETS = ['./', './productivity-ui.js', './native-tracker.js', './productivity.css', './index.html', './assets/auth.js', './cloud-auth-ui.js', './styles.css', './script.js', './time-utils.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './favicon-48.png', './assets/logo/moa-mark-ink.svg', './assets/logo/moa-mark-paper.svg'];
ASSETS.push('./workspace-backup.js', './workspace-backup-ui.js', './assets/tokens.css', './assets/fonts/BricolageGrotesque-Variable.ttf', './assets/fonts/Geist-Variable.ttf', './assets/fonts/GeistMono-Variable.ttf');
self.addEventListener('install', event => {
  // This build is a self-contained app shell. Activate once every asset is
  // cached, without waiting for every old browser tab to be closed.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('tempo-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname.includes('/api/')) return;
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Prefer the latest HTML/CSS/JS while online; keep the complete cached shell
  // available offline. Cache-only navigation could pin an obsolete native picker.
  const shellRequest = event.request.mode === 'navigate' || /\.(?:html|css|js)$/.test(url.pathname);
  if (!shellRequest) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    const controller = new AbortController();
    const timeout = cached ? setTimeout(() => controller.abort(), 4000) : null;
    try {
      const response = await fetch(event.request, { cache: 'no-cache', signal: controller.signal });
      if (response.ok) {
        event.waitUntil(cache.put(event.request, response.clone()));
        return response;
      }
      return cached || response;
    } catch (error) {
      if (cached) return cached;
      throw error;
    } finally { if (timeout) clearTimeout(timeout); }
  })());
});
