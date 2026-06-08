const CACHE='fatorty-v1';
self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/']).catch(()=>{})));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;                      // never touch writes (Supabase POST/PATCH)
  let url;try{url=new URL(req.url);}catch(_){return;}
  if(/supabase\.(co|in|net)/.test(url.hostname))return; // let API/auth hit network directly
  if(req.mode==='navigate'){                          // HTML: network-first, fallback to cache
    e.respondWith(
      fetch(req).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(req,cp));return res;})
        .catch(()=>caches.match(req).then(r=>r||caches.match('/')))
    );
    return;
  }
  e.respondWith(                                      // assets/libs/fonts: stale-while-revalidate
    caches.match(req).then(cached=>{
      const net=fetch(req).then(res=>{
        if(res&&(res.ok||res.type==='opaque')){const cp=res.clone();caches.open(CACHE).then(c=>c.put(req,cp));}
        return res;
      }).catch(()=>cached);
      return cached||net;
    })
  );
});
