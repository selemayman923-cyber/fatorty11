/* فاتورتي — Service Worker v7.4 (Network-First for app, Offline fallback) */
const CACHE = 'fatorty-v7.4';
const ASSETS = ['/', '/index.html', '/manifest.json'];

// التثبيت: خزّن الملفات الأساسية
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

// التفعيل: امسح كل الكاش القديم
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  const isAppShell = url.pathname === '/' || url.pathname === '/index.html';

  if (isAppShell) {
    // NETWORK-FIRST: جيب أحدث نسخة من النت دايمًا (لو في نت)
    // ولو مفيش نت، ارجع للنسخة المحفوظة (أوفلاين)
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(cache => cache.put('/index.html', clone));
          }
          return res;
        })
        .catch(() => 
          // مفيش نت → ارجع للكاش
          caches.open(CACHE).then(cache => cache.match('/index.html'))
        )
    );
    return;
  }

  // باقي الملفات: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => 
      cached || fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => cached)
    )
  );
});
