/* فاتورتي — Service Worker v10.0 (Network-First + تحديث تلقائي فوري) */
const CACHE = 'fatorty-v10.0';
const RUNTIME = 'fatorty-runtime-v1';
const ASSETS = ['/', '/index.html', '/manifest.json'];

/* صفحة أوفلاين نظيفة — تظهر فقط لو مفيش نت ومفيش نسخة محفوظة */
const OFFLINE_HTML = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>فاتورتي — غير متصل</title>
<style>body{font-family:Tahoma,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f4f7f6;color:#123}
.box{text-align:center;padding:32px;background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.08);max-width:340px}
h1{font-size:20px;color:#0f6b5c;margin:0 0 10px}p{font-size:14px;color:#567;line-height:1.7;margin:0 0 18px}
button{background:#0f6b5c;color:#fff;border:none;border-radius:10px;padding:12px 26px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}</style></head>
<body><div class="box"><div style="font-size:44px;margin-bottom:10px">📡</div>
<h1>لا يوجد اتصال بالإنترنت</h1>
<p>لم نتمكن من تحميل فاتورتي، ولا توجد نسخة محفوظة على هذا الجهاز بعد.<br>افتح التطبيق مرة واحدة مع الإنترنت وسيعمل بعدها بدون نت.</p>
<button onclick="location.reload()">🔄 إعادة المحاولة</button></div></body></html>`;

const offlineResponse = () =>
  new Response(OFFLINE_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

// التثبيت: خزّن الملفات الأساسية + فعّل نفسك فورًا (متستناش التاب يتقفل)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

// التفعيل: امسح كل الكاش القديم + تحكم في كل التابات المفتوحة فورًا
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
    // NETWORK-FIRST بدون أي كاش HTTP وسيط — دايمًا يجيب أحدث نسخة فعليًا من السيرفر
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(cache => cache.put('/index.html', clone));
          }
          return res;
        })
        .catch(() =>
          caches.open(CACHE)
            .then(cache => cache.match('/index.html'))
            .then(cached => cached || offlineResponse())
            .catch(() => offlineResponse())
        )
    );
    return;
  }

  // باقي الملفات: stale-while-revalidate مع حد لحجم الـ runtime cache
  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(RUNTIME).then(cache => {
            cache.put(e.request, clone).then(() => trimCache(RUNTIME, 60));
          });
        }
        return res;
      }).catch(() => null);

      // Return cached if available immediately, otherwise wait for network
      return cached || networkFetch.then(r => r || cached || new Response('', { status: 504, statusText: 'Offline' }));
    })
  );
});

// Trim runtime cache to max entries (simple LRU by deleting oldest keys)
function trimCache(cacheName, maxItems){
  caches.open(cacheName).then(async cache => {
    const keys = await cache.keys();
    if(keys.length <= maxItems) return;
    for(let i=0;i<keys.length - maxItems;i++){
      cache.delete(keys[i]);
    }
  }).catch(()=>{});
}
