'use strict';
const CACHE = 'tempo-shell-v6';
const ASSETS = ['./', './index.html', './styles.css', './script.js', './time-utils.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
ASSETS.push('./assets/tokens.css', './assets/fonts/BricolageGrotesque-Variable.ttf', './assets/fonts/Geist-Variable.ttf', './assets/fonts/GeistMono-Variable.ttf');
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('tempo-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname.includes('/api/')) return;
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
