/* SNS service worker. Prefer revalidated network assets and keep an offline copy. */
const CACHE = 'sns-production-audit-v19';
const ASSETS = [
  '/',
  '/index.html',
  '/wholesale.js',
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

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map(path => new Request(path, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const oldCaches = keys.filter(key => key.startsWith('sns-') && key !== CACHE);
    await Promise.all(oldCaches.map(key => caches.delete(key)));
    await self.clients.claim();
    if (oldCaches.length) await notifyUpdate();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || !ASSETS.includes(url.pathname)) return;
  const shell = url.pathname === '/' || url.pathname === '/index.html';
  const key = shell ? '/index.html' : url.pathname;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE).catch(() => null);
    try {
      const response = await fetch(event.request, {cache: 'no-cache'});
      if (response.ok && cache) await cache.put(key, response.clone()).catch(() => {});
      if (response.status < 500) return response;
      const saved = await cache?.match(key).catch(() => null);
      return saved || response;
    } catch {
      const saved = await cache?.match(key).catch(() => null);
      return saved || (shell ? offlineResponse() : Response.error());
    }
  })());
});

// السماح للصفحة تطلب تفعيل النسخة الجديدة فورًا
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SNS_SKIP_WAITING') self.skipWaiting();
});
