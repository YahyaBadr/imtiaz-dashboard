'use strict';
 
/* ═══════════════════════════════════════════════════════════════════════════
   sw.js — Service Worker: makes the dashboard installable (PWA) + offline
   Bump CACHE_VERSION whenever you redeploy so clients get the new files.
   ═══════════════════════════════════════════════════════════════════════════ */

const CACHE_VERSION = 'imtiaz-v23';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=1022',
  './cairo.css?v=1022',
  './print.css?v=1022',
  './config.js?v=1022',
  './app.js?v=1022',
  './identity.js?v=1022',
  './icons.js?v=1022',
  './export-core.js?v=1022',
  './export.js?v=1022',
  './export-assets.js',
  './manifest.json',
  './pages/overview.js?v=1022',
  './pages/schedule.js?v=1022',
  './pages/rounds.js?v=1022',
  './pages/units.js?v=1022',
  './pages/not-registered.js?v=1022',
  './vendor/xlsx-js-style.min.js',
  './vendor/jszip.min.js',
  './vendor/xlsx.full.min.js',
  './vendor/pdfmake.min.js',
  './vendor/vfs_fonts.js',
  './vendor/docx.umd.js',
  './assets/university_logo.png',
  './assets/college_logo.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then((c) => c.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())          // never fail the install over one missing file
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // لا نخدم أي شيء داخل مجلد assets/fonts من الكاش القديم بعد تحديث؟ (نعم نخدمه — الملفات ثابتة)

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // 1) Google Apps Script data → network only (never cached: it is live data)
  if (url.hostname === 'script.google.com' || url.hostname === 'script.googleapis.com') return;

  const sameOrigin = url.origin === self.location.origin;

  // 2) Page navigation → network, fall back to cached index.html (works offline)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // 3) Static assets → cache-first with background refresh
  if (sameOrigin) {
    e.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => null);
        if (cached) return cached;
        const fresh = await network;
        if (fresh) return fresh;
        // لو الرابط فيه ?v=... غير موجود في الكاش، جرّب نفس الملف بدون الاستعلام (وضع عدم الاتصال)
        const loose = await cache.match(req, { ignoreSearch: true });
        if (loose) return loose;
        return req.destination === 'document' ? cache.match('./index.html') : Response.error();
      })
    );
  }
});
