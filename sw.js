const CACHE='dmillion-crm-ios-20261103-2';
const SHELL=['./crm2.html','./crm2.css','./crm2.js','./pwa.js','./config.js','./supabase.js','./bridge.js','./crm2-demo.mjs','./crm2-agent.js','./crm2-agent-core.mjs','./crm2-core.mjs','./crm2-coverage.mjs','./crm2-intake.js','./crm2-intake-core.mjs','./crm2-timeline.mjs','./crm2-performance.mjs','./manifest.webmanifest','./icons/dmillion-app.svg','./icons/dmillion-app-180.png','./icons/dmillion-app-192.png','./icons/dmillion-app-512.png'];

self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&key.startsWith('dmillion-crm-')).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('./crm2.html',copy));return response;}).catch(()=>caches.match('./crm2.html')));
    return;
  }
  event.respondWith(caches.match(request,{ignoreSearch:true}).then(cached=>cached||fetch(request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(request,response.clone()));return response;})));
});
