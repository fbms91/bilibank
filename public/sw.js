/* Guarda a casca do app para abrir rápido e sem internet. Os dados vêm sempre do Supabase. */
const VERSAO = 'bilibank-v2';
/* caminhos relativos: o app funciona tanto na raiz do site quanto numa subpasta */
const CASCA = ['./', 'index.html', 'bili-app.js', 'config.js', 'vendor/supabase-2.117.2.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSAO).then(c => c.addAll(CASCA)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/')) return;
  /* rede primeiro (pega a versão nova do painel); sem rede, usa a cópia guardada */
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSAO).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
