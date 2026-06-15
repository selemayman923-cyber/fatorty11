/* فاتورتي — Service Worker v4.7 (Offline-First) */
const CACHE = 'fatorty-v4.7';
const ASSETS = ['/', '/index.html', '/manifest.json'];

// التثبيت: خزّن كل ملفات النظام
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())  // لو فشل تخزين أي ملف، كمّل عادي
  );
});

// التفعيل: امسح الكاش القديم
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
    // STALE-WHILE-REVALIDATE: افتح من الكاش فورًا (أوفلاين سريع)، وحدّث في الخلفية
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match('/index.html').then(cached => {
          // حدّث في الخلفية لو في نت
          const fetchPromise = fetch(e.request)
            .then(res => {
              if (res && res.status === 200) {
                cache.put('/index.html', res.clone());
                cache.put('/', res.clone());
              }
              return res;
            })
            .catch(() => null);  // مفيش نت؟ مفيش مشكلة
          // ارجع المخزّن فورًا لو موجود، وإلا استنى النت
          return cached || fetchPromise || caches.match('/index.html');
        })
      )
    );
    return;
  }

  // باقي الملفات: cache-first (أسرع للأوفلاين)
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached)  // لو فشل، ارجع المخزّن (لو موجود)
    )
  );
});

// رسالة للتطبيق: هل احنا أونلاين؟ (اختياري)
self.addEventListener('message', e => {
  if (e.data === 'CHECK_CACHE') {
    caches.open(CACHE).then(c => c.match('/index.html')).then(r => {
      e.source.postMessage({ cached: !!r });
    });
  }
});
