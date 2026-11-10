// Actual authenticated CRM2 boot and UI save handler, with synthetic records and a fake DB only.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
const root=new URL('../',import.meta.url),html=await fs.readFile(new URL('crm2.html',root),'utf8');
const dom=new JSDOM(html,{url:'http://localhost/crm2.html',pretendToBeVisual:true}),{window}=dom;
window.CRM2_DEMO=false;window.matchMedia=q=>({matches:q.includes('min-width:1081'),addEventListener(){}});window.scrollTo=()=>{};
for(const key of ['window','document','location','FormData','Event','CustomEvent','HTMLElement','HTMLInputElement'])globalThis[key]=key==='window'?window:window[key];
globalThis.matchMedia=window.matchMedia;globalThis.addEventListener=window.addEventListener.bind(window);Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
let networkCalls=0;globalThis.fetch=()=>{networkCalls++;throw Error('Network forbidden in synthetic UI test');};
const timers=[],originalInterval=globalThis.setInterval;globalThis.setInterval=(...args)=>{const timer=originalInterval(...args);timers.push(timer);return timer;};
const company={_id:'synthetic-company',name:'[가상] 메모 확인 업체',kind:'고객사',stage:'리드'};
const past={_id:'synthetic-past',companyId:company._id,type:'전화',status:'완료',date:'2026-11-09',summary:'[가상] 기존 통화 내용',createdBy:'author'};
const dotNote={_id:'synthetic-dot',companyId:company._id,title:'[가상] 대화 정리',summary:'[가상] 기존 참고 내용',source:'dot-conversation',recordKind:'undated_note',date:null,datePrecision:'unknown',status:'확인 메모',sourceActor:{kind:'service',id:'dot'},createdAt:'2026-11-09T00:00:00Z'};
const rows={companies:[company],activities:[past,dotNote],projects:[],tasks:[],opportunities:[],crm2Profiles:[],targets:[],crm2Categories:[],crm2Owners:[],calendar:[],'data/contacts/items':[{_id:company._id,contactPerson:'PRIVATE-TEST',email:'private@example.invalid'}]};
const server=new Map(),callbacks={};let writes=[],failure=false,hold=false,release,readFailure=false,readPending=false;
const snap=row=>({id:row._id,exists:true,version:row.version||1,updatedAt:row.updatedAt||null,updatedBy:row.serverEditor||null,data:()=>{const {_id,serverEditor,...data}=row;return structuredClone(data);}});
const snapshot=collection=>({docs:(rows[collection]||[]).map(snap)});
const emit=collection=>callbacks[collection]?.forEach(fn=>fn(snapshot(collection)));
const db={collection:collection=>({get:async()=>snapshot(collection),onSnapshot:fn=>{(callbacks[collection]??=new Set()).add(fn);fn(snapshot(collection));return()=>callbacks[collection].delete(fn);}}),doc:path=>({get:async()=>{if(readFailure)throw Error('Synthetic metadata read failure');if(readPending)return new Promise(()=>{});return server.has(path)?snap(server.get(path)):{exists:false};},set:async data=>{
 writes.push({path,data:structuredClone(data)});if(failure)throw Error('Synthetic offline failure');if(hold)await new Promise(resolve=>release=resolve);
 assert.match(path,/^activities\//);const record={_id:path.slice('activities/'.length),...structuredClone(data),serverEditor:'server-editor'};server.set(path,record);const index=rows.activities.findIndex(a=>a._id===record._id);if(index<0)rows.activities.push(record);else rows.activities[index]=record;emit('activities');
}})};
window.claude={use:async name=>name==='db'?db:{can:async()=>true,isOwner:async()=>false,id:async()=>'author',profiles:async ids=>Object.fromEntries(ids.map(id=>[id,{name:id==='server-editor'?'[가상] 저장 계정':'[가상] 작성 계정'}]))}};
window.dmSync={whoami:()=>({id:'author',name:'[가상] 작성 계정',role:'sales'})};
const source=await fs.readFile(new URL('crm2.js',root),'utf8'),moduleFile=new URL('.freeform-note-dom-check.mjs',root);
await fs.writeFile(moduleFile,source.replace(/boot\(\);\s*$/,'await boot();\nexport {state,render,selectCompany,noteModal,closeModal,liveUpdates,canApplyLiveUpdates,renderTimelineDetail};'));
const $=selector=>document.querySelector(selector);
const submit=()=>$('#dialogForm').onsubmit({preventDefault(){}});
const raw='  생각나는 내용 그대로\n\n 내일 미팅? 11/15 제안서 전달할까\n\t① 검토  ② 보류 <img src=x onerror="alert(1)">\n  ';
async function artifact(name){
 if(!process.env.CRM_NOTE_FIXTURE_DIR)return;
 await fs.mkdir(process.env.CRM_NOTE_FIXTURE_DIR,{recursive:true});
 const copy=document.documentElement.cloneNode(true);copy.querySelectorAll('script,link').forEach(n=>n.remove());
 const style=document.createElement('style');style.textContent=(await Promise.all(['crm2.css','crm2-workflow.css','crm2-calendar.css','crm2-updates.css','crm2-focus.css'].map(file=>fs.readFile(new URL(file,root),'utf8')))).join('\n');copy.querySelector('head').append(style);
 copy.querySelectorAll('textarea').forEach((area,i)=>area.textContent=document.querySelectorAll('textarea')[i].value);
 await fs.writeFile(`${process.env.CRM_NOTE_FIXTURE_DIR}/${name}.html`,'<!doctype html>'+copy.outerHTML);
}
try{
 const app=await import(pathToFileURL(moduleFile.pathname).href);app.liveUpdates.flush();assert.equal(app.state.demo,false);assert.equal(app.state.userId,'author');app.selectCompany(company._id);
 const original=JSON.stringify({company:app.state.companies,profiles:app.state.profiles,tasks:app.state.tasks,opportunities:app.state.opportunities,projects:app.state.projects,calendar:app.state.calendar});
 const open=()=>{$('[data-action=new-note]').click();return $('#dialogForm');};
 assert.equal($('.crm-add-menu'),null);assert.ok($('[data-action=new-note]'));assert.equal($('[data-action=new-note]').closest('details'),null);
 for(const action of ['new-meeting','new-task','new-opportunity'])assert.ok($(`[data-action=${action}]`).closest('.crm-more-menu'));
 let form=open();assert.equal(document.activeElement,form.elements.noteText);assert.equal(form.querySelectorAll('textarea').length,1);assert.equal(form.querySelectorAll('input,select').length,0);assert.equal(form.elements.noteText.hasAttribute('maxlength'),false);assert.equal($('#dialogSave').textContent,'저장');assert.equal($('#dialogReview').hidden,true);
 form.elements.noteText.value=raw;await artifact('freeform-open');assert.equal(app.canApplyLiveUpdates(),false);
 rows.activities.push({_id:'synthetic-external',companyId:company._id,title:'[가상] 외부 기록',type:'전화',date:'2026-11-08',status:'완료'});emit('activities');app.liveUpdates.flush();assert.equal(form.elements.noteText.value,raw);assert.equal(app.state.activities.length,2);
 $('[data-close="1"]').click();assert.equal(writes.length,0);app.liveUpdates.flush();assert.equal(app.state.activities.length,3);console.log('PASS primary note button, single textarea, optional structured actions, cancel and realtime draft protection');
 form=open();form.elements.noteText.value=' \n\t ';await submit();assert.equal(writes.length,0);assert.equal($('#dialogError').hidden,false);assert.equal(form.elements.noteText.value,' \n\t ');
 form.elements.noteText.value='긴 메모'.repeat(40000);await submit();assert.equal(writes.length,0);assert.equal(form.elements.noteText.value.length,160000);assert.equal($('#dialogError').hidden,false);
 form.elements.noteText.value=raw;failure=true;await submit();assert.equal(writes.length,1);assert.equal($('#dialogError').hidden,false);assert.equal($('#dialogSave').disabled,false);assert.equal(form.elements.noteText.value,raw);assert.equal($('#modalLayer').classList.contains('hidden'),false);
 failure=false;hold=true;const pending=submit();await submit();app.closeModal();assert.equal(writes.length,2);assert.equal(writes[0].path,writes[1].path);assert.equal(writes[0].data.createdAt,writes[1].data.createdAt);assert.equal($('#dialogSave').disabled,true);assert.equal(form.elements.noteText.disabled,true);assert.equal($('#modalLayer').classList.contains('hidden'),false);release();await pending;hold=false;
 assert.equal($('#modalLayer').classList.contains('hidden'),true);assert.equal(app.state.companyTab,'overview');assert.equal(writes[1].data.summary,raw);assert.equal(writes[1].data.createdBy,'author');assert.equal(writes[1].data.source,'crm2-note');assert.equal(writes[1].data.sourceActor,undefined);assert.equal(writes[1].data.date,null);assert.equal(writes[1].data.datePrecision,'unknown');assert.equal(writes[1].data.nextAction,undefined);assert.equal(writes[1].data.nextDue,undefined);assert.equal(writes[1].data.attendeesUs,undefined);
 const id=writes[1].path.slice('activities/'.length);assert.equal(app.state.activities.filter(a=>a._id===id).length,1);assert.equal(app.state.docUpdatedBy[writes[1].path],'server-editor');app.liveUpdates.flush();await new Promise(resolve=>setTimeout(resolve,0));
 let note=$(`[data-conversation-note="${id}"]`);assert.ok(note);assert.equal(note.querySelector('.crm-note-text').textContent,raw);assert.equal(note.querySelector('img'),null);assert.match(note.textContent,/직접 작성 메모/);assert.match(note.textContent,/기록 작성 · \[가상\] 작성 계정/);assert.match(note.textContent,/마지막 저장 · \[가상\] 저장 계정/);assert.doesNotMatch(note.textContent,/활동일 미상/);assert.match(note.textContent,/메모 작성/);assert.doesNotMatch(note.textContent,/dot|대화 보고일/);assert.match($('.crm-detail-now > .crm-detail-block').textContent,/기존 통화 내용/);assert.ok($('[data-conversation-note=synthetic-dot]'));
 assert.equal(JSON.stringify({company:app.state.companies,profiles:app.state.profiles,tasks:app.state.tasks,opportunities:app.state.opportunities,projects:app.state.projects,calendar:app.state.calendar}),original);
 const {buildTimelineRows}=await import(new URL('crm2-timeline.mjs',root));const manualActivity=app.state.activities.find(a=>a._id===id);const timeline=app.renderTimelineDetail(buildTimelineRows([company],[manualActivity],[],[],{today:'2026-11-10'})[0]);assert.match(timeline,/메모 작성/);assert.doesNotMatch(timeline,/활동일 미상|대화 보고일/);
 await artifact('freeform-saved');$('[data-action=company-tab][data-tab=activities]').click();note=$(`[data-activity-id="${id}"]`);assert.equal(note.querySelector('.crm-note-text').textContent,raw);assert.match(note.textContent,/직접 작성 메모/);assert.doesNotMatch(note.textContent,/완료|디밀리언 참석|dot/);assert.ok($('[data-activity-id=synthetic-past]'));console.log('PASS actual authenticated save route: raw text, safe HTML, stable retry ID, double-submit block, current detail/history, account attribution and no other writes');
 // A confirmed write is not presented as failed merely because attribution refresh is unavailable.
 readFailure=true;form=open();form.elements.noteText.value='[가상] 메타데이터 조회 실패에도 저장 성공';await submit();assert.equal(writes.length,3);assert.equal($('#modalLayer').classList.contains('hidden'),true);readFailure=false;app.liveUpdates.flush();
 readPending=true;form=open();form.elements.noteText.value='[가상] 메타데이터 조회가 멈춰도 저장 성공';const pendingReadStart=Date.now();await submit();assert.ok(Date.now()-pendingReadStart<2500,'optional attribution read must not trap the save dialog');assert.equal(writes.length,4);assert.equal($('#modalLayer').classList.contains('hidden'),true);assert.match($('.crm-conversation-notes').textContent,/메타데이터 조회가 멈춰도 저장 성공/);readPending=false;app.liveUpdates.flush();
 form=open();const missingSessionDraft='[가상] 로그인 상태가 없어도 입력은 유지';form.elements.noteText.value=missingSessionDraft;
 for(const missingUser of [null,'', '  ',undefined]){app.state.userId=missingUser;await submit();assert.equal(writes.length,4);assert.equal(form.elements.noteText.value,missingSessionDraft);assert.equal($('#modalLayer').classList.contains('hidden'),false);assert.match($('#dialogError').textContent,/로그인 상태/);assert.equal($('#dialogSave').disabled,false);}
 app.state.userId='author';app.closeModal();console.log('PASS pending attribution read is bounded and missing login author prevents writes without losing the draft');
 form=open();form.elements.noteText.value='[가상] 권한 변경 후 저장 금지';app.state.canWrite=false;await submit();assert.equal(writes.length,4);assert.equal(form.elements.noteText.value,'[가상] 권한 변경 후 저장 금지');app.closeModal();app.render();assert.equal($('[data-action=new-note]'),null);assert.equal($('[data-action=new-meeting]'),null);app.noteModal();assert.equal($('#modalLayer').classList.contains('hidden'),true);$('[data-action=company-tab][data-tab=resources]').click();assert.doesNotMatch($('#main').textContent,/PRIVATE-TEST|private@example.invalid/);assert.equal(networkCalls,0);console.log('PASS metadata read failure, read-only permissions, protected contacts and zero network calls');
}finally{timers.forEach(clearInterval);globalThis.setInterval=originalInterval;window.dispatchEvent(new window.Event('pagehide'));await fs.unlink(moduleFile);dom.window.close();}
