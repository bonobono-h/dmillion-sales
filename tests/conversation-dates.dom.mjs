import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {JSDOM}=require(process.env.CRM_DOM_MODULE||'jsdom');
const root=new URL('../',import.meta.url);
const html=await fs.readFile(new URL('crm2.html',root),'utf8');
const dom=new JSDOM(html,{url:'http://localhost/crm2.html?demo=1',pretendToBeVisual:true});
const {window}=dom;window.CRM2_DEMO=true;
window.matchMedia=q=>({matches:q.includes('min-width:1081'),addEventListener(){}});window.scrollTo=()=>{};
for(const key of ['window','document','location','FormData','Event','CustomEvent','HTMLElement','HTMLInputElement'])globalThis[key]=key==='window'?window:window[key];
globalThis.matchMedia=window.matchMedia;globalThis.addEventListener=window.addEventListener.bind(window);
Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
let networkCalls=0;globalThis.fetch=()=>{networkCalls++;throw Error('Network is forbidden in fixture');};
const timers=[],originalInterval=globalThis.setInterval;
globalThis.setInterval=(...args)=>{const timer=originalInterval(...args);timers.push(timer);return timer;};
const source=await fs.readFile(new URL('crm2.js',root),'utf8');
const moduleFile=new URL('.date-safety-dom-check.mjs',root);
await fs.writeFile(moduleFile,source.replace(/boot\(\);\s*$/,'await boot();\nexport {state,render,selectCompany,renderActivities,renderTimelineDetail};'));
const note={_id:'date-note',companyId:'date-company',source:'dot-conversation',recordKind:'undated_note',type:'메모',status:'확인 메모',date:null,datePrecision:'unknown',meetingRecord:false,title:'가상 고객 대화 보고',summary:'실제 활동일이 언급되지 않은 확인 메모',sourceActor:{kind:'service',id:'dot',label:'dot'},sourceRef:{conversationId:'test-thread',messageId:'test-message',eventId:'test-event',reportedOn:'2026-11-09',reportedAt:'2026-11-09T06:00:00Z',timeZone:'Asia/Seoul'},createdAt:'2026-11-10T01:00:00Z'};
const dayVisit={...note,_id:'day-visit',recordKind:'completed_activity',type:'현장 방문',status:'완료',date:'2026-11-09',datePrecision:'day',title:'시간을 모르는 실제 방문',summary:'활동 날짜만 확인됨',nextDue:null};
try{
 const app=await import(pathToFileURL(moduleFile.pathname).href);
 const company={_id:'date-company',name:'[가상] 날짜 확인',kind:'고객사',stage:'리드'};
 app.state.companies.push(company);app.state.activities.push(note);
 app.selectCompany(company._id);const overviewHTML=document.querySelector('.crm-detail-now').outerHTML;assert.ok(document.querySelector('.crm-detail-now [data-conversation-note=date-note]'));assert.match(document.querySelector('.crm-detail-now').textContent,/대화 정리/);assert.match(document.querySelector('.crm-detail-now').textContent,/접촉 기록 없음/);assert.match(document.querySelector('.crm-conversation-notes').textContent,/활동일 미상/);assert.match(document.querySelector('.crm-conversation-notes').textContent,/대화 보고일/);assert.match(document.querySelector('.crm-conversation-notes').textContent,/출처 · dot 대화 정리/);document.querySelector('[data-action=company-tab][data-tab=activities]').click();
 const entry=document.querySelector('[data-activity-id=date-note]');assert.ok(entry);
 assert.match(entry.textContent,/활동일 미상/);assert.match(entry.textContent,/대화 보고일/);assert.match(entry.textContent,/2026-11-09/);assert.match(entry.textContent,/CRM 등록/);assert.match(entry.textContent,/확인 메모/);assert.doesNotMatch(entry.textContent,/완료/);
 const before=JSON.stringify(note);app.render();app.render();assert.equal(JSON.stringify(note),before);
 app.state.meetingScope='all';app.state.activityFilter='all';const table=app.renderActivities();assert.match(table,/활동일 미상/);assert.match(table,/가상 고객 대화 보고/);
 const {buildTimelineRows}=await import(new URL('crm2-timeline.mjs',root));
 const timeline=app.renderTimelineDetail(buildTimelineRows([company],[note],[],[],{today:'2026-11-10'})[0]);assert.match(timeline,/활동일 미상/);assert.match(timeline,/대화 보고일/);assert.match(timeline,/CRM 등록/);
 if(process.env.CRM_DATE_FIXTURE_OUTPUT)await fs.writeFile(process.env.CRM_DATE_FIXTURE_OUTPUT,`<!doctype html><html lang="ko"><meta charset="utf-8"><title>Undated note local fixture</title><body><h1>현재 상황의 대화 정리</h1>${overviewHTML}<h2>활동일 미상 표시</h2>${entry.outerHTML}<h2>전체 활동</h2>${table}<h2>타임라인</h2>${timeline}</body></html>`);
 console.log('PASS main CRM2 detail/table/timeline visibly distinguish unknown, reported and CRM dates; repeated rendering does not mutate record');
 app.state.activities.push(dayVisit);app.state.companyTab='overview';app.render();
 const contactBlock=document.querySelector('.crm-detail-now > .crm-detail-block');
 assert.match(contactBlock.textContent,/2026-11-09 · 시간 미상/);assert.match(contactBlock.textContent,/시간을 모르는 실제 방문/);
 assert.equal(document.querySelector('[data-conversation-note=day-visit]'),null,'completed day-only visit is not an informational note');
 document.querySelector('[data-action=company-tab][data-tab=activities]').click();
 const visitEntry=document.querySelector('[data-activity-id=day-visit]');
 assert.equal(visitEntry.querySelector('.crm-activity-event-date').textContent,'2026-11-09 · 시간 미상');
 assert.match(visitEntry.textContent,/완료/);assert.doesNotMatch(visitEntry.querySelector('.crm-activity-event-date').textContent,/00:00|09:00|오전|오후|2026-11-08|2026-11-10/);
 const visitTableDOM=new JSDOM(app.renderActivities());
 const visitRow=[...visitTableDOM.window.document.querySelectorAll('tbody tr')].find(row=>row.textContent.includes(dayVisit.title));
 assert.equal(visitRow.querySelector('.crm-activity-event-date').textContent,'2026-11-09 · 시간 미상');visitTableDOM.window.close();
 const visitTimeline=app.renderTimelineDetail(buildTimelineRows([company],[dayVisit],[],[],{today:'2026-11-10'})[0]);assert.match(visitTimeline,/2026-11-09 · 시간 미상/);
 console.log('PASS completed day-only visit shows literal day and 시간 미상 in current detail/history/table/timeline without clock or timezone shift');

 // Run the actual patched legacy editor functions, with an isolated fake database.
 const legacyHtml=await fs.readFile(new URL('index.html',root),'utf8');
 const legacyFunctions=legacyHtml.slice(legacyHtml.indexOf('function manualLegacyNote('),legacyHtml.indexOf('\nasync function runAI('));
 const legacyDOM=new JSDOM('<div id="actFormWrap"></div>',{url:'http://localhost/index.html?legacy=1'});
 const clone=structuredClone(note);clone._raw=structuredClone(note);
 const writes=[];let renderCount=0,fail=false,release=null;
 const view={editAct:note._id,actForm:company._id,actDraft:null};
 const ctx={view,acts:[clone],cw:()=>true,Date,console,STAGES:[],ACT_TYPES:[],ACT_STATUS:[],sample:false,
  $:id=>legacyDOM.window.document.getElementById(id),
  esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  toLocalInput:v=>v?String(v).slice(0,16):'',renderAll:()=>{renderCount++;},toast:()=>{},
  save:async fn=>{try{await fn();return true;}catch{return false;}},
  db:{doc:path=>({update:async data=>{writes.push({path,data});if(fail)throw Error('Synthetic failure');if(release==='wait')await new Promise(resolve=>{release=resolve;});}})}
 };
 vm.createContext(ctx);vm.runInContext(legacyFunctions,ctx);
 ctx.renderActForm(company);
 let form=ctx.$('conversationNoteF');assert.ok(form);assert.equal(form.querySelector('[type=datetime-local]'),null);assert.equal(form.querySelector('[data-k=status]'),null);assert.equal(form.querySelector('[data-k=sync]'),null);assert.equal(form.querySelector('[data-k=applyStage]'),null);assert.match(form.textContent,/활동일 미상/);
 await form.onsubmit({preventDefault(){}});assert.equal(writes.length,0);assert.equal(renderCount,1);assert.equal(clone.date,null);assert.equal(clone.status,'확인 메모');
 const reset=()=>{view.editAct=note._id;view.actForm=company._id;view.actDraft=null;ctx.renderActForm(company);return ctx.$('conversationNoteF');};
 form=reset();form.elements.summary.value='사용자가 요약을 수정함';await form.onsubmit({preventDefault(){}});
 assert.equal(writes.length,1);assert.equal(writes[0].path,'activities/'+note._id);assert.deepEqual(Object.keys(writes[0].data).sort(),['summary','title','updatedAt']);assert.equal(writes[0].data.summary,'사용자가 요약을 수정함');assert.equal(clone.date,null);assert.equal(clone.status,'확인 메모');
 form=reset();form.elements.summary.value='취소할 내용';ctx.$('noteCancel').click();assert.equal(writes.length,1);assert.equal(ctx.$('conversationNoteF'),null);
 form=reset();form.elements.summary.value='재시도 내용';fail=true;await form.onsubmit({preventDefault(){}});assert.equal(form.elements.summary.value,'재시도 내용');assert.equal(form.querySelector('[type=submit]').disabled,false);assert.equal(view.editAct,note._id);fail=false;await form.onsubmit({preventDefault(){}});assert.equal(writes.length,3);
 form=reset();form.elements.summary.value='이중 저장 방지';release='wait';const saving=form.onsubmit({preventDefault(){}});await form.onsubmit({preventDefault(){}});assert.equal(writes.length,4);ctx.$('noteCancel').click();assert.equal(view.editAct,note._id);release();await saving;
 const originalSummary=clone.summary;clone.summary='긴 내용'.repeat(40000);form=reset();assert.equal(form.elements.summary.value,clone.summary);await form.onsubmit({preventDefault(){}});assert.equal(writes.length,4);assert.equal(view.editAct,null);clone.summary=originalSummary;
 form=reset();form.elements.summary.value='읽기 전용 변경 금지';ctx.cw=()=>false;await form.onsubmit({preventDefault(){}});assert.equal(writes.length,4);ctx.cw=()=>true;
 assert.equal(clone.sourceActor.id,'dot');assert.equal(clone.createdBy,undefined);assert.equal(networkCalls,0);

 // The same protected title/summary editor must preserve completed day-only facts.
 const visitClone=structuredClone(dayVisit);visitClone._raw=structuredClone(dayVisit);ctx.acts.push(visitClone);
 const resetVisit=()=>{view.editAct=visitClone._id;view.actForm=company._id;view.actDraft=null;ctx.renderActForm(company);return ctx.$('conversationNoteF');};
 const writesBefore=writes.length;form=resetVisit();assert.ok(form);
 assert.match(form.querySelector('p').textContent,/2026-11-09 · 시간 미상 · 완료/);assert.doesNotMatch(form.querySelector('p').textContent,/활동일 미상|확인 메모/);
 for(const selector of ['[type=datetime-local]','[data-k=status]','[data-k=sync]','[data-k=applyStage]','[data-k=nextDue]'])assert.equal(form.querySelector(selector),null);
 const facts=JSON.stringify(visitClone);await form.onsubmit({preventDefault(){}});assert.equal(writes.length,writesBefore);assert.equal(JSON.stringify(visitClone),facts);
 form=resetVisit();form.elements.title.value='방문 제목 수정';form.elements.summary.value='확인된 요약 수정';await form.onsubmit({preventDefault(){}});
 assert.equal(writes.length,writesBefore+1);assert.equal(writes.at(-1).path,'activities/day-visit');assert.deepEqual(Object.keys(writes.at(-1).data).sort(),['summary','title','updatedAt']);
 const savedVisit={...visitClone,...writes.at(-1).data};
 for(const key of ['date','datePrecision','status','recordKind','type','source','sourceActor','sourceRef','createdAt','nextDue'])assert.deepEqual(savedVisit[key],visitClone[key],key+' must survive edited save');
 assert.equal(savedVisit.date,'2026-11-09');assert.equal(savedVisit.status,'완료');assert.equal(savedVisit.datePrecision,'day');assert.equal(ctx.protectedConversationNote(savedVisit),false);
 assert.equal(ctx.legacyActivityDate(savedVisit),'2026-11-09 · 시간 미상');assert.equal(ctx.legacyActivityDate(savedVisit,true),'2026-11-09 · 시간 미상');
 // Evaluate actual legacy read-card code too, not a reconstructed template.
 const actItemCode=legacyHtml.slice(legacyHtml.indexOf('function actItemHTML('),legacyHtml.indexOf('\nfunction opt('));
 ctx.REPORT_FIELDS=[];ctx.eqLabel=()=>'';vm.runInContext(actItemCode,ctx);
 const legacyCardDOM=new JSDOM(ctx.actItemHTML(savedVisit));assert.equal(legacyCardDOM.window.document.querySelector('.date').textContent,'2026-11-09 · 시간 미상');assert.match(legacyCardDOM.window.document.querySelector('.t1').textContent,/완료/);legacyCardDOM.window.close();
 console.log('PASS legacy read-card and unchanged/edited day-only visit preserve actual day, completed status, precision and source metadata; no stage/deadline writes');
 legacyDOM.window.close();
 console.log('PASS actual legacy note editor unchanged-save, edit, cancel, failure/retry and double-submit preserve date/status/source; fake DB writes only title/summary/updatedAt');
 // Manual notes must not enter this older unconditional title/summary form.
 // The full safe editor save/revision path is exercised in legacy-note.dom.mjs.
 const manual={...structuredClone(note),_id:'manual-note',source:'crm2-note',sourceActor:undefined,sourceRef:undefined,title:'메모',summary:'  원래 메모\n\n  ',createdBy:'manual-author'};manual._raw=structuredClone(manual);ctx.acts.push(manual);
 const manualWrites=writes.length;view.editAct=manual._id;view.actForm=company._id;view.actDraft=null;ctx.renderActForm(company);
 assert.equal(ctx.$('conversationNoteF'),null);assert.equal(ctx.$('actF'),null);assert.match(ctx.$('actFormWrap').textContent,/내용 수정/);assert.equal(writes.length,manualWrites);assert.equal(manual.date,null);assert.equal(manual.createdBy,'manual-author');assert.equal(manual.source,'crm2-note');
 console.log('PASS legacy manual notes cannot enter an unconditional structured editor; safe CAS edit route tested separately');
 console.log('PASS no network/authentication/production writes');
} finally {
 for(const timer of timers)clearInterval(timer);globalThis.setInterval=originalInterval;
 await fs.unlink(moduleFile);dom.window.close();
}
