// Synthetic browser checks only. All non-local requests are blocked.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {demoData} from '../crm2-demo.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const source=await fs.readFile(new URL('../crm2.js',import.meta.url),'utf8');
const base=process.env.CRM_TEST_URL||'http://127.0.0.1:8765';
try {
  for(const width of [1440,768,390]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin!==base)return route.abort();
      if(['/config.js','/supabase.js','/bridge.js'].includes(url.pathname))return route.fulfill({contentType:'text/javascript',body:''});
      if(url.pathname==='/crm2.js')return route.fulfill({contentType:'text/javascript',body:source+'\nwindow.__crmTest={state,meetingModal,closeModal,render,selectCompany,refresh,startLiveUpdates};'});
      return route.continue();
    });
    await page.addInitScript(data=>{
      const records={companies:data.companies,activities:data.activities,projects:data.projects,crm2Profiles:Object.entries(data.profiles).map(([id,row])=>({_id:id,...row})),opportunities:data.opportunities,tasks:data.tasks,targets:data.goals||[],crm2Owners:[],crm2Categories:[],calendar:[],'data/contacts/items':[]};
      const callbacks={};
      const snapshot=rows=>({docs:rows.map(row=>({id:row._id,version:row.version||1,updatedAt:row.updatedAt||null,data:()=>({...row})}))});
      window.__writes=0;
      const db={collection:path=>({get:async()=>snapshot(records[path]||[]),onSnapshot:callback=>{(callbacks[path]||=new Set()).add(callback);callback(snapshot(records[path]||[]));return()=>callbacks[path].delete(callback);}}),doc:()=>({get:async()=>({exists:false}),set:async()=>{window.__writes++;}})};
      window.claude={use:async name=>name==='db'?db:{can:async()=>true,isOwner:async()=>true,id:async()=>'synthetic-user'}};
      window.dmSync={whoami:()=>({role:'admin'})};
      window.__emit=(collection,row)=>{records[collection].push(row);callbacks[collection]?.forEach(fn=>fn(snapshot(records[collection])));};
      window.__subscriptionCount=()=>Object.values(callbacks).reduce((n,s)=>n+s.size,0);
    },demoData);
    await page.goto(base+'/crm2.html');await page.waitForSelector('#loadingScreen.hidden');
    await page.waitForTimeout(550);
    const baseline=await page.evaluate(()=>window.__crmTest.state.activities.length);
    await page.evaluate(()=>window.__emit('activities',{_id:'synthetic-live-1',companyId:'demo-c1',title:'외부 변경 테스트',date:'2026-11-10T01:00:00Z',type:'전화',status:'완료'}));
    await page.waitForFunction(count=>window.__crmTest.state.activities.length===count+1,baseline);
    await page.evaluate(()=>{window.__crmTest.selectCompany('demo-c1');window.__crmTest.meetingModal();});
    await page.locator('[name=meetingTitle]').fill('입력 유지 테스트');
    await page.evaluate(()=>window.__emit('activities',{_id:'synthetic-live-2',companyId:'demo-c1',title:'편집 중 외부 변경',date:'2026-11-10T02:00:00Z',type:'전화',status:'완료'}));
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(()=>window.__crmTest.state.activities.length),baseline+1);
    assert.equal(await page.locator('[name=meetingTitle]').inputValue(),'입력 유지 테스트');
    await page.evaluate(()=>window.__crmTest.closeModal());
    await page.waitForFunction(count=>window.__crmTest.state.activities.length===count+2,baseline);
    await page.evaluate(()=>{window.__crmTest.state.accountView='list';window.__crmTest.state.detailOpen=false;window.__crmTest.render();});
    await page.locator('#f-q').fill('');await page.locator('#f-q').focus();
    await page.evaluate(()=>window.__emit('activities',{_id:'synthetic-live-3',companyId:'demo-c1',title:'검색 중 외부 변경',date:'2026-11-10T03:00:00Z',type:'전화',status:'완료'}));
    await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>window.__crmTest.state.activities.length),baseline+2);
    await page.locator('#refreshBtn').focus();
    await page.waitForFunction(count=>window.__crmTest.state.activities.length===count+3,baseline);
    const count=await page.evaluate(()=>window.__subscriptionCount());await page.evaluate(()=>{window.__crmTest.startLiveUpdates();window.__crmTest.startLiveUpdates();});
    assert.equal(await page.evaluate(()=>window.__subscriptionCount()),count);
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>window.__writes),0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
    assert.deepEqual(errors,[]);
    await page.screenshot({path:'/tmp/crm-live-'+width+'.png',fullPage:true});
    console.log(`PASS ${width}px: external update, form/search protection, deferred update, one subscription set, no writes, no overflow/errors`);
    await page.close();
  }
} finally {await browser.close();}
