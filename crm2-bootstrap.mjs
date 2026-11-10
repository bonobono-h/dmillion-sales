export const CRM_RELEASE='20261110-conversation-1';
const WORKER_URL='./sw.js?v='+CRM_RELEASE;

function isReleaseWorker(worker,baseURL){
  try{
    const actual=new URL(worker?.scriptURL,baseURL);
    const expected=new URL(WORKER_URL,baseURL);
    return actual.href===expected.href;
  }catch{return false;}
}

function refreshStyles(document,baseURL){
  if(!document?.querySelectorAll)return;
  const origin=new URL(baseURL).origin;
  for(const link of document.querySelectorAll('link[rel="stylesheet"]')){
    const url=new URL(link.href,baseURL);
    if(url.origin!==origin)continue;
    // The parser may have fetched CSS through the previous worker already.
    url.searchParams.set('release',CRM_RELEASE);
    link.href=url.href;
  }
}

// Call before loading the app or starting editable forms. Never reload the page.
// Unsupported/offline/failed updates must not leave the loading screen stuck.
export function readyReleaseWorker({
  navigator=globalThis.navigator,
  document=globalThis.document,
  baseURL=globalThis.location?.href,
  timeoutMs=5000
}={}){
  const workers=navigator?.serviceWorker;
  if(!workers?.register||!baseURL)return Promise.resolve({status:'unsupported'});
  const previous=workers.controller;
  return new Promise(resolve=>{
    let finished=false,registration;
    const cleanups=[];
    const finish=status=>{
      if(finished)return;
      finished=true;
      clearTimeout(timer);
      for(const cleanup of cleanups)cleanup();
      if(status==='ready'&&previous!==workers.controller){
        try{refreshStyles(document,baseURL);}catch{}
      }
      resolve({status});
    };
    const listen=(target,type,handler)=>{
      target?.addEventListener(type,handler);
      cleanups.push(()=>target?.removeEventListener(type,handler));
    };
    const controlled=()=>{
      if(isReleaseWorker(workers.controller,baseURL))finish('ready');
    };
    const watch=worker=>{
      if(!worker||!isReleaseWorker(worker,baseURL))return;
      const stateChanged=()=>{
        if(finished)return;
        if(worker.state==='installed')worker.postMessage({type:'SKIP_WAITING'});
        if(worker.state==='redundant')finish('unavailable');
        controlled();
      };
      listen(worker,'statechange',stateChanged);
      stateChanged();
    };
    const timer=setTimeout(()=>finish('timeout'),Math.max(0,timeoutMs));
    listen(workers,'controllerchange',controlled);
    controlled();
    if(finished)return;
    Promise.resolve().then(()=>workers.register(WORKER_URL,{
      scope:'./',updateViaCache:'none'
    })).then(result=>{
      if(finished)return;
      registration=result;
      listen(registration,'updatefound',()=>watch(registration.installing));
      watch(registration.waiting);
      watch(registration.installing);
      watch(registration.active);
      controlled();
    }).catch(()=>finish('unavailable'));
  });
}
