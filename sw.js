/* فاتورتي — Service Worker v12.0
   التغيير الكبير: بدل ما ننزّل التطبيق كامل من النت في كل مرة،
   بنعرضه فورًا من الكاش وبنتأكد من التحديث في الخلفية.
   النتيجة: الفتح بقى لحظي، والتحديث بيوصل من غير ما تستنى.  */
const CACHE = 'sns-v13.0';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/vendor/jsbarcode.min.js',
  '/vendor/supabase.min.js',
  '/vendor/qrcode.min.js'
];
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

// بلّغ كل التابات المفتوحة إن فيه نسخة جديدة جاهزة
async function notifyUpdate() {
  const list = await self.clients.matchAll({ type: 'window' });
  list.forEach(c => { try { c.postMessage({ type: 'SNS_UPDATE_READY' }); } catch (e) {} });
}

// التثبيت: كل ملف لوحده — لو واحد فشل، الباقي بيتخزّن عادي
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(
        ASSETS.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null))
      ))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

// التفعيل: امسح الكاش القديم + تحكم في كل التابات فورًا
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
    /* STALE-WHILE-REVALIDATE
       ١) اعرض من الكاش فورًا (فتح لحظي)
       ٢) في نفس الوقت اسأل السيرفر: فيه جديد؟ الطلب ده شرطي —
          لو مفيش تغيير السيرفر بيرد 304 من غير ما ينزّل حاجة
       ٣) لو فيه جديد: خزّنه وبلّغ المستخدم */
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match('/index.html').then(cached => {
          const fresh = fetch(e.request)
            .then(res => {
              if (res && res.status === 200) {
                const oldTag = cached && (cached.headers.get('etag') || cached.headers.get('last-modified'));
                const newTag = res.headers.get('etag') || res.headers.get('last-modified');
                cache.put('/index.html', res.clone());
                if (cached && oldTag && newTag && oldTag !== newTag) notifyUpdate();
                else if (cached && !oldTag && !newTag) {
                  Promise.all([cached.clone().text(), res.clone().text()])
                    .then(([a, b]) => { if (a !== b) notifyUpdate(); })
                    .catch(() => {});
                }
              }
              return res;
            })
            .catch(() => null);

          // الكاش أولاً — لو مفيش، استنى الشبكة
          return cached || fresh.then(r => r || offlineResponse());
        })
      ).catch(() => offlineResponse())
    );
    return;
  }

  // باقي الملفات: من الكاش الأول مع fallback آمن
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() =>
        new Response('', { status: 504, statusText: 'Offline' })
      )
    )
  );
});

// السماح للصفحة تطلب تفعيل النسخة الجديدة فورًا
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SNS_SKIP_WAITING') self.skipWaiting();
});
