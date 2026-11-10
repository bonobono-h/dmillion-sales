import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {readyReleaseWorker,CRM_RELEASE} from '../crm2-bootstrap.mjs';

const origin='https://example.test';
const base=origin+'/dmillion-sales/';
const workerURL=base+'sw.js?v='+CRM_RELEASE;
const currentCache='dmillion-crm-ios-'+CRM_RELEASE;
const swSource=await readFile(new URL('../sw.js',import.meta.url),'utf8');
const absolute=value=>new URL(typeof value==='string'?value:value.url,base).href;

function workerHarness(){
  const listeners=new Map(),stores=new Map(),requests=[],deleted=[];
  let online=true,body='fresh',status=200,claimed=0,skipped=0;
  const cacheFor=name=>{
    if(!stores.has(name))stores.set(name,new Map());
    const entries=stores.get(name);
    return {
      async put(request,response){entries.set(absolute(request),response.clone());},
      async match(request,options){
        assert.notEqual(options?.ignoreSearch,true,'query strings must remain part of the key');
        return entries.get(absolute(request))?.clone();
      },
      async addAll(urls){for(const request of urls)entries.set(absolute(request),new Response('shell: '+absolute(request)));}
    };
  };
  class WorkerRequest extends Request{
    constructor(input,options){super(absolute(input),options);}
  }
  const context={URL,Response,Request:WorkerRequest,Promise,
    self:{location:{origin,href:workerURL},
      addEventListener:(name,handler)=>listeners.set(name,handler),
      clients:{claim:async()=>{claimed++;}},
      skipWaiting:async()=>{skipped++;}},
    caches:{open:async name=>cacheFor(name),keys:async()=>[...stores.keys()],
      delete:async name=>{deleted.push(name);return stores.delete(name);},
      match:()=>{throw Error('Do not read across release caches');}},
    fetch:async (request,options)=>{
      assert.equal(options?.cache,'no-cache','release assets must revalidate the browser HTTP cache');
      requests.push(absolute(request));
      if(!online)throw Error('offline');
      return new Response(body,{status});
    }
  };
  vm.runInNewContext(swSource,context);
  return {
    stores,requests,deleted,
    setNetwork(options){({online=online,body=body,status=status}=options);},
    async put(cache,url,value){await cacheFor(cache).put(url,new Response(value));},
    async get(cache,url){return (await cacheFor(cache).match(url))?.text();},
    async lifecycle(name,data){
      const pending=[];
      listeners.get(name)({data,waitUntil:promise=>pending.push(promise)});
      await Promise.all(pending);
      return {claimed,skipped};
    },
    async request(path,{mode='cors',method='GET'}={}){
      const pending=[];let response;
      const request={url:absolute(path),mode,method};
      listeners.get('fetch')({request,respondWith:promise=>{response=promise;},waitUntil:promise=>pending.push(promise)});
      if(!response)return null;
      const result=await response;
      await Promise.all(pending);
      return result;
    }
  };
}

test('worker activation claims without deleting any old release/user cache',async()=>{
  const h=workerHarness();
  await h.put('dmillion-crm-ios-old','./crm2.js','old');
  await h.put('user-files','./notes','private');
  const installed=await h.lifecycle('install');
  assert.equal(installed.skipped,1);
  assert.equal(await h.get(currentCache,'./crm2-bootstrap.mjs'),'shell: '+base+'crm2-bootstrap.mjs');
  assert.equal((await h.lifecycle('activate')).claimed,1);
  assert.deepEqual(h.deleted,[]);
  assert.equal(await h.get('user-files','./notes'),'private');
});

test('versioned JS is fetched fresh and cannot read another release cache',async()=>{
  const h=workerHarness();
  await h.put('dmillion-crm-ios-old','./crm2.js?v='+CRM_RELEASE,'stale release');
  await h.put(currentCache,'./crm2.js','unversioned copy');
  const path='./crm2.js?v='+CRM_RELEASE;
  assert.equal(await (await h.request(path)).text(),'fresh');
  assert.equal(await h.get(currentCache,path),'fresh');
});

test('offline versioned CSS/JS only uses an exact URL in the current release',async()=>{
  const h=workerHarness();
  await h.put(currentCache,'./crm2-focus.css?v=old','old version');
  await h.put(currentCache,'./crm2-focus.css','unversioned');
  await h.put('dmillion-crm-ios-old','./crm2-focus.css?v=new','another release');
  h.setNetwork({online:false});
  await assert.rejects(()=>h.request('./crm2-focus.css?v=new'),/offline/);
  await h.put(currentCache,'./crm2-focus.css?v=new','exact current');
  assert.equal(await (await h.request('./crm2-focus.css?v=new')).text(),'exact current');
});

test('assets use the network before an exact cache hit',async()=>{
  const h=workerHarness();
  await h.put(currentCache,'./bridge.js','cached bridge');
  h.setNetwork({body:'new bridge'});
  assert.equal(await (await h.request('./bridge.js')).text(),'new bridge');
  assert.equal(await h.get(currentCache,'./bridge.js'),'new bridge');
});

test('navigation cache keys retain route and search, never overwrite the CRM shell',async()=>{
  const h=workerHarness();
  await h.put(currentCache,'./crm2.html','CRM shell');
  h.setNetwork({body:'legacy screen'});
  await h.request('./legacy.html?view=map',{mode:'navigate'});
  assert.equal(await h.get(currentCache,'./legacy.html?view=map'),'legacy screen');
  assert.equal(await h.get(currentCache,'./crm2.html'),'CRM shell');
  assert.equal(await h.get(currentCache,'./legacy.html'),undefined);
  h.setNetwork({body:'entry redirect'});
  await h.request('./index.html',{mode:'navigate'});
  assert.equal(await h.get(currentCache,'./crm2.html'),'CRM shell');
});

test('offline CRM queries may use the CRM shell, but unknown index/legacy routes may not',async()=>{
  const h=workerHarness();
  await h.put(currentCache,'./crm2.html','CRM shell');
  await h.put(currentCache,'./legacy.html?view=map','legacy cached');
  h.setNetwork({online:false});
  assert.equal(await (await h.request('./crm2.html?view=accounts&source=home',{mode:'navigate'})).text(),'CRM shell');
  assert.equal(await (await h.request('./legacy.html?view=map',{mode:'navigate'})).text(),'legacy cached');
  for(const route of ['./','./index.html','./legacy.html','./crm2.html.bak']){
    const response=await h.request(route,{mode:'navigate'});
    assert.equal(response.status,503,route);
    assert.doesNotMatch(await response.text(),/CRM shell/);
  }
});

test('failed HTTP responses never poison cached assets or navigation',async()=>{
  const h=workerHarness();
  await h.put(currentCache,'./crm2.html','saved shell');
  h.setNetwork({body:'server error',status:503});
  assert.equal((await h.request('./crm2.html',{mode:'navigate'})).status,503);
  assert.equal(await h.get(currentCache,'./crm2.html'),'saved shell');
});

test('worker ignores cross-origin, non-GET and non-shell data requests',async()=>{
  const h=workerHarness();
  assert.equal(await h.request('https://api.example.test/contacts'),null);
  assert.equal(await h.request('./crm2.js',{method:'POST'}),null);
  assert.equal(await h.request('./api/contacts.json'),null);
  assert.deepEqual(h.requests,[]);
});

class Events{
  listeners=new Map();
  addEventListener(type,handler){
    if(!this.listeners.has(type))this.listeners.set(type,new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type,handler){this.listeners.get(type)?.delete(handler);}
  emit(type){for(const handler of [...(this.listeners.get(type)||[])])handler();}
  count(){return [...this.listeners.values()].reduce((n,set)=>n+set.size,0);}
}
function browserHarness(){
  const sw=new Events(),registration=new Events(),calls=[];
  sw.controller={scriptURL:base+'sw.js?v=old'};
  const worker=new Events();
  Object.assign(worker,{scriptURL:workerURL,state:'installing',messages:[],postMessage(message){this.messages.push(message);}});
  registration.installing=worker;
  sw.register=async(...args)=>{calls.push(args);return registration;};
  const local={href:base+'crm2-focus.css?v=old'};
  const external={href:'https://fonts.example.test/font.css'};
  const doc={querySelectorAll:()=>[local,external]};
  return {sw,registration,worker,calls,local,external,
    options:{navigator:{serviceWorker:sw},document:doc,baseURL:base+'crm2.html?demo=1',timeoutMs:150},
    activate(){worker.state='activated';sw.controller=worker;worker.emit('statechange');sw.emit('controllerchange');}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('bootstrap awaits release takeover before app startup and refreshes only local CSS',async()=>{
  const h=browserHarness();
  let appStarted=false;
  const ready=readyReleaseWorker(h.options).then(result=>{appStarted=true;return result;});
  await tick();
  assert.equal(appStarted,false);
  assert.deepEqual(h.calls,[['./sw.js?v='+CRM_RELEASE,{scope:'./',updateViaCache:'none'}]]);
  h.worker.state='installed';h.worker.emit('statechange');
  assert.deepEqual(h.worker.messages,[{type:'SKIP_WAITING'}]);
  h.activate();
  assert.deepEqual(await ready,{status:'ready'});
  assert.equal(appStarted,true);
  assert.equal(new URL(h.local.href).searchParams.get('release'),CRM_RELEASE);
  assert.equal(h.external.href,'https://fonts.example.test/font.css');
  assert.equal(h.sw.count()+h.worker.count()+h.registration.count(),0);
});

test('bootstrap immediately accepts the current controller without CSS churn',async()=>{
  const h=browserHarness();h.sw.controller=h.worker;
  const original=h.local.href;
  assert.deepEqual(await readyReleaseWorker(h.options),{status:'ready'});
  assert.equal(h.local.href,original);
  assert.deepEqual(h.calls,[]);
  assert.equal(h.sw.count(),0);
});

test('bootstrap handles waiting workers and updatefound lifecycle',async()=>{
  const h=browserHarness();
  h.registration.installing=null;
  const ready=readyReleaseWorker(h.options);
  await tick();
  h.registration.installing=h.worker;
  h.registration.emit('updatefound');
  h.worker.state='installed';h.worker.emit('statechange');
  assert.equal(h.worker.messages.length,1);
  h.activate();
  assert.equal((await ready).status,'ready');
  const waiting=browserHarness();
  waiting.registration.installing=null;
  waiting.registration.waiting=waiting.worker;
  waiting.worker.state='installed';
  const waitingReady=readyReleaseWorker(waiting.options);
  await tick();
  assert.equal(waiting.worker.messages.length,1);
  waiting.activate();
  assert.equal((await waitingReady).status,'ready');
});

test('unsupported, rejected and failed worker installation all unblock startup',async()=>{
  assert.deepEqual(await readyReleaseWorker({navigator:{},baseURL:base}),{status:'unsupported'});
  const rejected=browserHarness();
  rejected.sw.register=async()=>{throw Error('registration denied');};
  assert.deepEqual(await readyReleaseWorker(rejected.options),{status:'unavailable'});
  assert.equal(rejected.sw.count(),0);
  const failed=browserHarness();
  const ready=readyReleaseWorker(failed.options);
  await tick();
  failed.worker.state='redundant';failed.worker.emit('statechange');
  assert.deepEqual(await ready,{status:'unavailable'});
  assert.equal(failed.sw.count()+failed.worker.count()+failed.registration.count(),0);
});

test('timeout is bounded, removes listeners, and cannot change a page after editing starts',async()=>{
  const h=browserHarness();
  const original=h.local.href;
  const result=await readyReleaseWorker({...h.options,timeoutMs:10});
  assert.deepEqual(result,{status:'timeout'});
  assert.equal(h.sw.count()+h.worker.count()+h.registration.count(),0);
  h.activate();
  assert.equal(h.local.href,original);
  // A stalled register promise must also time out, rather than blocking app startup.
  const stalled=browserHarness();stalled.sw.register=()=>new Promise(()=>{});
  assert.deepEqual(await readyReleaseWorker({...stalled.options,timeoutMs:10}),{status:'timeout'});
});

test('PWA registration and bootstrap ship the same release without browser HTTP caching',async()=>{
  const pwa=await readFile(new URL('../pwa.js',import.meta.url),'utf8');
  assert.ok(pwa.includes('sw.js?v='+CRM_RELEASE));
  assert.match(pwa,/updateViaCache:'none'/);
  assert.ok(swSource.includes("const RELEASE='"+CRM_RELEASE+"'"));
  assert.doesNotMatch(await readFile(new URL('../crm2-bootstrap.mjs',import.meta.url),'utf8'),/location\.reload|localStorage|sessionStorage|\.unregister\(/);
});
