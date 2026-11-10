import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {demoData} from '../crm2-demo.mjs';
const intervals=[];const originalInterval=globalThis.setInterval;globalThis.setInterval=(...args)=>{const timer=originalInterval(...args);intervals.push(timer);return timer;};
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
const root=new URL('../',import.meta.url),html=await fs.readFile(new URL('crm2.html',root),'utf8');
const dom=new JSDOM(html,{url:'http://localhost/crm2.html',pretendToBeVisual:true}),{window}=dom;
window.CRM2_DEMO=false;window.matchMedia=()=>({matches:false,addEventListener(){}});window.scrollTo=()=>{};
for(const key of ['window','document','location','FormData','Event','CustomEvent','HTMLElement','HTMLInputElement'])globalThis[key]=key==='window'?window:window[key];
globalThis.matchMedia=window.matchMedia;globalThis.addEventListener=window.addEventListener.bind(window);Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
const records={companies:demoData.companies,activities:demoData.activities,projects:demoData.projects,crm2Profiles:Object.entries(demoData.profiles).map(([id,row])=>({_id:id,...row})),opportunities:demoData.opportunities,tasks:demoData.tasks,targets:demoData.goals||[],crm2Owners:[],crm2Categories:[],calendar:[],'data/contacts/items':[]};
records.activities=[...records.activities,{_id:'trusted-document',spoofId:'fake-document',serverSavedBy:'server-editor',companyId:'demo-c1',type:'전화',date:'2026-11-01',status:'완료'}];
const callbacks={};let writes=0;
const snapshot=rows=>({docs:rows.map(row=>({id:row._id,version:row.version||1,updatedAt:row.updatedAt||null,updatedBy:row.serverSavedBy||null,data:()=>({...row,...(row.spoofId?{_id:row.spoofId,updatedBy:'json-wrong-editor'}:{})})}))});
const db={collection:path=>({get:async()=>snapshot(records[path]||[]),onSnapshot:callback=>{(callbacks[path]||=new Set()).add(callback);callback(snapshot(records[path]||[]));return()=>callbacks[path].delete(callback);}}),doc:()=>({get:async()=>({exists:false}),set:async()=>{writes++;}})};
window.claude={use:async name=>name==='db'?db:{can:async()=>true,isOwner:async()=>true,id:async()=>'synthetic-user',profiles:async ids=>Object.fromEntries(ids.map(id=>[id,{name:id==='server-editor'?'[예시] 서버 저장자':'[예시] 기록자'}]))}};
window.dmSync={whoami:()=>({role:'admin'})};
const emit=(collection,row)=>{records[collection].push(row);callbacks[collection]?.forEach(fn=>fn(snapshot(records[collection])));};
const countSubs=()=>Object.values(callbacks).reduce((n,s)=>n+s.size,0);
const source=await fs.readFile(new URL('crm2.js',root),'utf8'),moduleFile=new URL('.live-dom-check.mjs',root);
await fs.writeFile(moduleFile,source.replace(/boot\(\);\s*$/,'await boot();\nexport {state,render,meetingModal,closeModal,selectCompany,startLiveUpdates,liveUpdates};'));
try{
  const app=await import(pathToFileURL(moduleFile.pathname).href);app.liveUpdates.flush();
  assert.ok(app.state.activities.some(a=>a._id==='trusted-document'));assert.ok(!app.state.activities.some(a=>a._id==='fake-document'));assert.equal(app.state.docUpdatedBy['activities/trusted-document'],'server-editor');
  const baseline=app.state.activities.length;
  emit('activities',{_id:'test-live-1',companyId:'demo-c1',title:'자동 갱신 시험',spoofId:'trusted-document',createdBy:'external-author',serverSavedBy:'server-editor',date:'2026-11-10T01:00:00Z',type:'전화',status:'완료'});app.liveUpdates.flush();
  assert.equal(app.state.activities.length,baseline+1);assert.ok(app.state.activities.some(a=>a._id==='test-live-1'));assert.equal(app.state.activities.filter(a=>a._id==='trusted-document').length,1);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(app.state.docUpdatedBy['activities/test-live-1'],'server-editor');assert.equal(app.state.userProfiles['server-editor'].name,'[예시] 서버 저장자');console.log('PASS external activity and account names update without writes or refresh click');
  app.selectCompany('demo-c1');app.meetingModal();document.querySelector('[name=meetingTitle]').value='수정 중';
  emit('activities',{_id:'test-live-2',companyId:'demo-c1',title:'편집 중 변경',date:'2026-11-10T01:00:00Z',type:'전화',status:'완료'});app.liveUpdates.flush();
  assert.equal(app.state.activities.length,baseline+1);assert.equal(document.querySelector('[name=meetingTitle]').value,'수정 중');
  app.closeModal();app.liveUpdates.flush();assert.equal(app.state.activities.length,baseline+2);console.log('PASS modal input preserved and pending update applied after close');
  app.state.detailOpen=false;app.state.accountView='list';app.render();const search=document.querySelector('#f-q');search.focus();
  emit('activities',{_id:'test-live-3',companyId:'demo-c1',title:'검색 중 변경',date:'2026-11-10T01:00:00Z',type:'전화',status:'완료'});app.liveUpdates.flush();
  assert.equal(app.state.activities.length,baseline+2);assert.equal(document.activeElement,search);document.querySelector('#refreshBtn').focus();app.liveUpdates.flush();assert.equal(app.state.activities.length,baseline+3);console.log('PASS search focus preserved');
  for(const screen of ['agent','intake','import','admin']){app.state.screen=screen;emit('activities',{_id:'test-'+screen,companyId:'demo-c1'});const before=app.state.activities.length;app.liveUpdates.flush();assert.equal(app.state.activities.length,before);}
  app.state.screen='accounts';app.state.importSessionApplied=true;app.liveUpdates.flush();assert.ok(app.liveUpdates.pending>0);app.state.importSessionApplied=false;app.liveUpdates.flush();assert.equal(app.liveUpdates.pending,0);console.log('PASS inline editor and temporary import protection');
  for(const accountView of ['focus','list','coverage','timeline']){app.state.accountView=accountView;app.render();const button=document.querySelector('[data-action=account-view][data-view='+accountView+']');button.focus();const scroll=document.querySelector('.crm-kanban,.table-scroll,.timeline-list-scroll');if(scroll){scroll.scrollTop=117;scroll.scrollLeft=41;}emit('activities',{_id:'focus-'+accountView,companyId:'demo-c1'});app.liveUpdates.flush();assert.equal(document.activeElement.dataset.view,accountView);if(scroll){const next=document.querySelector('.crm-kanban,.table-scroll,.timeline-list-scroll');assert.equal(next.scrollTop,117);assert.equal(next.scrollLeft,41);}}
  console.log('PASS exact tab focus and table scroll preserved');
  const subscriptions=countSubs();app.startLiveUpdates();app.startLiveUpdates();assert.equal(countSubs(),subscriptions);app.liveUpdates.flush();
  assert.equal(writes,0);app.liveUpdates.stop();assert.equal(countSubs(),0);console.log('PASS restart and stop cleanup, zero database writes');
} finally {intervals.forEach(clearInterval);globalThis.setInterval=originalInterval;window.dispatchEvent(new window.Event('pagehide'));await fs.unlink(moduleFile);dom.window.close();}
