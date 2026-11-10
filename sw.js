const RELEASE='20261110-conversation-1';
const CACHE='dmillion-crm-ios-'+RELEASE;
const SHELL=['./crm2.html','./crm2.css','./crm2.js','./crm2-bootstrap.mjs','./crm2-workflow.css','./crm2-review.mjs','./crm2-live.mjs','./crm2-focus.mjs','./crm2-board.mjs','./crm2-identity.mjs','./crm2-focus.css','./crm2-search.mjs','./crm2-calendar.mjs','./crm2-calendar.css','./crm2-updates.mjs','./crm2-updates.css','./pwa.js','./config.js','./supabase.js','./bridge.js','./crm2-demo.mjs','./crm2-agent.js','./crm2-agent-core.mjs','./crm2-core.mjs','./crm2-coverage.mjs','./crm2-intake.js','./crm2-intake-core.mjs','./crm2-timeline.mjs','./crm2-records.mjs','./crm2-performance.mjs','./manifest.webmanifest','./icons/dmillion-app.svg','./icons/dmillion-app-180.png','./icons/dmillion-app-192.png','./icons/dmillion-app-512.png'];
const shellPaths=new Set(SHELL.map(path=>new URL(path,self.location.href).pathname));
const crmURL=new URL('./crm2.html',self.location.href);

self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(url=>new Request(url,{cache:'reload'}))))
    .then(()=>self.skipWaiting())
));
// Release caches are isolated. Do not clear storage or disturb a running page.
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')event.waitUntil(self.skipWaiting());
});

async function remember(request,response){
  if(!response.ok)return;
  const cache=await caches.open(CACHE);
  await cache.put(request,response);
}

async function networkFirst(event,url){
  const request=event.request;
  try{
    const response=await fetch(request,{cache:'no-cache'});
    if(response.ok)event.waitUntil(remember(request,response.clone()).catch(()=>{}));
    return response;
  }catch(error){
    const cache=await caches.open(CACHE);
    // Query strings identify versions. Never search other releases or ignore them.
    const exact=await cache.match(request);
    if(exact)return exact;
    // Only CRM 2 navigations may use its shell. Index/legacy pages stay distinct.
    if(request.mode==='navigate'&&url.pathname===crmURL.pathname){
      const shell=await cache.match(crmURL.href);
      if(shell)return shell;
    }
    if(request.mode==='navigate')return new Response('오프라인 상태에서는 아직 저장하지 않은 화면을 열 수 없습니다.',{
      status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}
    });
    throw error;
  }
}

self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  // Keep API responses and other same-origin data out of the app-shell cache.
  if(request.mode!=='navigate'&&!shellPaths.has(url.pathname))return;
  event.respondWith(networkFirst(event,url));
});
