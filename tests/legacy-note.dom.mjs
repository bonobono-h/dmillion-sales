// Actual legacy boot, note button and save/edit handlers. All records/DB/network are synthetic.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {JSDOM}=createRequire(import.meta.url)('jsdom'),root=new URL('../',import.meta.url);
const html=await fs.readFile(new URL('index.html',root),'utf8');
const dom=new JSDOM(html,{url:'https://fixture.invalid/index.html?legacy=1#list',pretendToBeVisual:true}),{window}=dom;
for(const key of ['document','location','localStorage','HTMLElement','Event','CustomEvent','FormData'])globalThis[key]=window[key];
globalThis.window=window;globalThis.matchMedia=()=>({matches:true});window.HTMLElement.prototype.scrollIntoView=()=>{};globalThis.scrollTo=()=>{};globalThis.getComputedStyle=window.getComputedStyle;globalThis.addEventListener=window.addEventListener.bind(window);
const map={w:100,h:100,provs:[],munis:[]};let mapReads=0,external=0;
globalThis.fetch=async path=>{if(path!=='map.json'){external++;throw Error('External network forbidden');}mapReads++;return {json:async()=>map};};
const company={name:'[가상] 자유 메모 업체',kind:'고객사',stage:'제안',owner:'기존 담당',nextAction:'기존 다음 행동',nextDate:'2026-12-20',needs:'기존 니즈',source:'fixture'};
const activity={companyId:'c',title:'[가상] 기존 통화',summary:'\n 원래 내용  ',type:'통화',status:'완료',date:'2026-11-09',datePrecision:'day',createdBy:'old-author',createdAt:'2026-11-09T00:00:00Z',report:{purpose:'보존할 목적'},transcript:'보존할 녹취',owner:'기존 담당',source:'fixture'};
const server=new Map(Object.entries({'companies/c':company,'companies/other':{...company,name:'[가상] 다른 업체'},'activities/a':activity}).map(([path,data])=>[path,{data:structuredClone(data),version:3}]));
const original=structuredClone([...server]),callbacks=new Map(),writes=[];let activeId='fixture-author',activeRole='sales',failure=false,hold=false,release,lost=false,failRead=false,laterEdit=false;
const snapshot=(path,row)=>({exists:!!row,id:path.split('/').at(-1),version:row?.version,updatedAt:'server',updatedBy:activeId,data:()=>structuredClone(row?.data)});
const collectionSnapshot=name=>({docs:[...server].filter(([path])=>path.slice(0,path.lastIndexOf('/'))===name).map(([path,row])=>snapshot(path,row))});
const emit=name=>{for(const callback of callbacks.get(name)||[])callback(collectionSnapshot(name));};
const db={collection:name=>{const q={get:async()=>collectionSnapshot(name),orderBy:()=>q,limit:()=>q,onSnapshot:callback=>{if(!callbacks.has(name))callbacks.set(name,new Set());callbacks.get(name).add(callback);callback(collectionSnapshot(name));return()=>callbacks.get(name).delete(callback);}};return q;},doc:path=>({
 onSnapshot:callback=>{callback(snapshot(path,server.get(path)));return()=>{};},get:async()=>{if(failRead)throw Error('가상 읽기 오류');return snapshot(path,server.get(path));},
 createIfAbsent:async(data,{expectedUserId})=>{
  writes.push({path,data:structuredClone(data)});assert.equal(expectedUserId,activeId);assert.ok(['sales','admin'].includes(activeRole));
  if(failure)throw Error('가상 저장 실패');if(hold)await new Promise(resolve=>release=resolve);
  let existing=server.get(path);if(existing){assert.deepEqual(existing.data,data);return snapshot(path,existing);}
  const saved={data:structuredClone(data),version:1};server.set(path,saved);emit('activities');
  if(laterEdit){saved.data.summary='나중에 바뀐 최신 내용';saved.version++;emit('activities');}
  if(lost)throw Error('가상 응답 유실');return snapshot(path,saved);
 },
 updateIfVersion:async(patch,version,{baseData})=>{const row=server.get(path);assert.equal(row.version,version);assert.deepEqual(baseData,row.data);writes.push({path,patch:structuredClone(patch)});const saved={data:{...row.data,...structuredClone(patch)},version:version+1};server.set(path,saved);emit('activities');return snapshot(path,saved);},
 set(){throw Error('Replacement write forbidden');},update(){throw Error('Unconditional update forbidden');},delete(){throw Error('Delete forbidden');}
})};
const user={id:async()=>activeId,can:async()=>['sales','admin'].includes(activeRole),isOwner:async()=>activeRole==='admin',canEdit:async()=>activeRole==='admin',profiles:async()=>({})};
window.claude={use:async name=>name==='db'?db:name==='user'?user:null};
let code=html.slice(html.indexOf("(() => {\n'use strict';")+9,html.lastIndexOf('})();\n</script>'));
code=code.replace('(async () => {\n  const cl = window.claude;','const legacyBootReady = (async () => {\n  const cl = window.claude;');
const moduleURL=new URL('.legacy-note-dom-fixture.mjs',root);
await fs.writeFile(moduleURL,code+`\nawait legacyBootReady;\nexport {renderAll,select,view,legacyTextState,legacyNoteState,openLegacyNote,contactCount,firstContact,lastContact,coEvents,homeSchedule,weekItems,upcoming,cardHTML,rpReached};\nexport function role(value){canWrite=value==='unknown'?null:value!=='view';isAdmin=value==='admin';renderAll();}\nexport function identity(value){myId=value;}\nexport const noteEditor=()=>legacyNoteEntryPromise;\nexport const textEditor=()=>legacyTextEditorPromise;`);
const $=q=>document.querySelector(q),tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const submit=()=>$('#legacyNoteForm').onsubmit({preventDefault(){}});
async function open(){const button=$('#addAct');assert.ok(button);button.click();for(let i=0;i<40&&!$('#legacyNoteForm');i++)await tick();assert.ok($('#legacyNoteForm'));return $('#legacyNoteForm');}
async function artifact(name){if(!process.env.CRM_LEGACY_NOTE_FIXTURE_DIR)return;await fs.mkdir(process.env.CRM_LEGACY_NOTE_FIXTURE_DIR,{recursive:true});const copy=document.documentElement.cloneNode(true);copy.querySelectorAll('script,link').forEach(n=>n.remove());const style=document.createElement('style');style.textContent=await fs.readFile(new URL('legacy-readable.css',root),'utf8');copy.querySelector('head').append(style);copy.querySelectorAll('textarea').forEach((area,i)=>area.textContent=document.querySelectorAll('textarea')[i].value);await fs.writeFile(`${process.env.CRM_LEGACY_NOTE_FIXTURE_DIR}/${name}.html`,'<!doctype html>'+copy.outerHTML);}
try{
 const app=await import(pathToFileURL(moduleURL.pathname).href);await tick();assert.equal(app.legacyNoteState().userId,activeId);assert.equal(app.legacyNoteState().canWrite,true);assert.equal(mapReads,1);app.select('c');
 assert.equal(document.querySelectorAll('#tabs > button').length,4);
 assert.ok(document.querySelector('#tabs .legacy-more-nav [data-tab=analysis]'));
 assert.equal(document.querySelector('.legacy-new-workspace').getAttribute('href'),'crm2.html?view=focus');
 $('#expandDetail').click();assert.ok([...document.querySelectorAll('#detailCard details')].every(el=>el.open));
 $('#collapseDetail').click();assert.ok([...document.querySelectorAll('#detailCard details')].every(el=>!el.open));
 $('#q').value='no matches';$('#fOwner').value='__none';$('#fStar').checked=true;$('#clearFilters').click();
 assert.equal($('#q').value,'');assert.equal($('#fOwner').value,'');assert.equal($('#fStar').checked,false);assert.equal(writes.length,0);
 console.log('PASS legacy compact navigation, expand/collapse and filter reset preserve data');
 const c=()=>app.legacyTextState().companies.find(row=>row._id==='c');const metrics=()=>({count:app.contactCount(c()),first:app.firstContact(c()),last:app.lastContact(c()),calendar:app.coEvents(c()),schedule:app.homeSchedule(),week:app.weekItems('2020-01-01','2030-12-31'),upcoming:app.upcoming(),stage:c().stage,nextAction:c().nextAction,nextDate:c().nextDate});const before=metrics();
 assert.equal($('#addAct').textContent,'+ 메모 남기기');assert.ok($('#addStructuredAct').closest('details'));assert.equal($('#actF'),null);
 let form=await open();assert.equal(form.querySelectorAll('textarea').length,1);assert.equal(form.querySelectorAll('input,select').length,0);assert.equal(document.activeElement,$('#legacyNoteText'));assert.equal($('#legacyNoteSave').textContent,'저장');assert.equal($('#legacyNoteText').hasAttribute('maxlength'),false);
 $('#legacyNoteText').value='취소할 내용';$('#legacyNoteCancel').click();assert.equal($('#legacyNoteForm'),null);assert.equal(writes.length,0);
 $('#addStructuredAct').closest('details').open=true;$('#addStructuredAct').click();assert.ok($('#actF'));const report=$('[data-k=summary]');report.value='보존할 보고서 초안';report.dispatchEvent(new Event('input',{bubbles:true}));
 await open();$('#legacyNoteText').value='다른 자유 메모';app.renderAll();assert.equal($('#legacyNoteText').value,'다른 자유 메모');$('#legacyNoteCancel').click();assert.equal($('[data-k=summary]').value,'보존할 보고서 초안');$('#aCancel').click();
 console.log('PASS actual authenticated legacy boot, primary single-textarea form, secondary report form, cancel and report draft preservation');
 form=await open();$('#legacyNoteText').value=' \n\t ';await submit();assert.equal(writes.length,0);assert.match($('#legacyNoteError').textContent,/입력/);assert.equal($('#legacyNoteText').value,' \n\t ');
 const raw='\n  생각나는 내용 그대로\n 내일 방문? 11/15 제안서?\n\t<img src=x onerror=alert(1)>  ';
 $('#legacyNoteText').value=raw;await artifact('legacy-freeform-open');failure=true;await submit();assert.equal(writes.length,1);assert.equal($('#legacyNoteText').value,raw);assert.equal($('#legacyNoteSave').disabled,false);assert.match($('#legacyNoteError').textContent,/실패/);
 failure=false;hold=true;const pending=submit();await tick();await submit();$('#legacyNoteCancel').click();window.dispatchEvent(new window.PopStateEvent('popstate'));app.renderAll();assert.equal(writes.length,2);assert.equal($('#legacyNoteText').value,raw);assert.equal($('#legacyNoteText').disabled,true);assert.ok($('#legacyNoteForm'));release();await pending;hold=false;
 const id=writes[1].path.split('/').at(-1);assert.equal(writes[0].path,writes[1].path);assert.deepEqual(writes[0].data,writes[1].data);assert.equal($('#legacyNoteForm'),null);assert.deepEqual(metrics(),before);assert.equal(app.view.dtab,'hist');
 const note=$(`[data-legacy-activity="${id}"]`);assert.ok(note);assert.equal(note.querySelector('.legacy-text').textContent,raw);assert.equal(note.querySelector('img'),null);assert.match(note.textContent,/메모 작성/);assert.match(note.textContent,/직접 작성 메모/);assert.doesNotMatch(note.textContent,/활동일 미상|예정|완료|대화 보고일/);assert.equal(note.querySelector('[data-edit]'),null);assert.equal($('#detailCard .tl > li').dataset.legacyActivity,id);assert.equal(app.legacyTextState().activities.filter(a=>a._id===id).length,1);
 for(const [path,row] of original)assert.deepEqual(server.get(path),row,path);assert.equal(server.size,4);assert.equal(server.get('activities/'+id).data.createdBy,activeId);assert.equal(server.get('activities/'+id).data.date,null);await artifact('legacy-freeform-saved');
 console.log('PASS raw multiline save/XSS escaping, stable ID/date retries, double click prevention, immediate history placement and unchanged contacts/stage/calendar/old records');
 note.querySelector('[data-legacy-field=summary]').click();for(let i=0;i<40&&!$('#legacyEditText');i++)await tick();await tick();assert.equal($('#legacyEditText').value,raw);$('#legacyEditText').value='\n  고친 자유 메모  ';await $('#legacyTextEditForm').onsubmit({preventDefault(){}});assert.equal(server.get('activities/'+id).data.summary,'\n  고친 자유 메모  ');assert.equal(server.get('activities/'+id).data.crmTextEdits[0].before,raw);assert.equal(server.get('activities/'+id).data.date,null);assert.deepEqual(metrics(),before);
 console.log('PASS newly created note reopens in existing safe CAS editor and retains original content history');
 // Poisoned dates/status/type/next action must not fabricate contacts, visits, stages or calendar events.
 const saved=structuredClone(server.get('activities/'+id));for(const status of ['완료','예정']){server.set('activities/'+id,{data:{...saved.data,status,type:'현장 방문',date:'2026-12-01T10:00:00Z',nextAction:'POISON',nextDue:'2026-12-05'},version:saved.version+1});emit('activities');assert.deepEqual(metrics(),before);assert.equal(app.rpReached({...c(),stage:'보류'},[server.get('activities/'+id).data]),0);assert.doesNotMatch(app.cardHTML(c()),/POISON/);}server.set('activities/'+id,{...saved,version:saved.version+2});emit('activities');
 console.log('PASS source-protected note remains excluded even with poisoned activity date/type/status/deadline');
 // Overlay survives realtime rows, rerenders, selection and back/forward without switching target.
 await open();$('#legacyNoteText').value='이동 중 유지할 초안';const area=$('#legacyNoteText');app.select('other');window.history.pushState({},'','#map');window.dispatchEvent(new window.PopStateEvent('popstate'));window.dispatchEvent(new window.HashChangeEvent('hashchange'));emit('activities');assert.equal($('#legacyNoteText'),area);assert.equal(area.value,'이동 중 유지할 초안');await submit();assert.equal(app.view.sel,'other');assert.equal(writes.at(-1).data.companyId,'c');app.select('c');
 const failCount=writes.length;await open();$('#legacyNoteText').value='권한 바뀌어도 남는 초안';app.role('view');await submit();assert.equal(writes.length,failCount);assert.equal($('#legacyNoteText').value,'권한 바뀌어도 남는 초안');$('#legacyNoteCancel').click();assert.equal($('#addAct'),null);assert.equal($('#addStructuredAct'),null);app.role('unknown');assert.equal($('#addAct'),null);
 app.role('sales');await open();$('#legacyNoteText').value='다른 계정으로 저장 금지';activeId='other-author';await submit();assert.equal(writes.length,failCount);assert.equal($('#legacyNoteText').value,'다른 계정으로 저장 금지');activeId='fixture-author';app.identity(null);await submit();assert.equal(writes.length,failCount);$('#legacyNoteCancel').click();app.identity('fixture-author');app.renderAll();
 await open();$('#legacyNoteText').value='활성 권한 철회';activeRole='view';await submit();assert.equal(writes.length,failCount);assert.equal($('#legacyNoteText').value,'활성 권한 철회');activeRole='sales';$('#legacyNoteCancel').click();
 console.log('PASS realtime/navigation draft survival, original company target, revoked/unknown/missing/changing auth fail closed without writes');
 await open();$('#legacyNoteText').value='응답 잃어도 한 번만';lost=true;await submit();const retryPath=writes.at(-1).path;assert.equal($('#legacyNoteText').value,'응답 잃어도 한 번만');lost=false;await submit();assert.equal(writes.at(-1).path,retryPath);assert.equal(app.legacyTextState().activities.filter(row=>row._id===retryPath.split('/').at(-1)).length,1);
 await open();$('#legacyNoteText').value='첫 시도';failure=true;await submit();const count=writes.length;$('#legacyNoteText').value='실패 후 바꾼 초안';failure=false;await submit();assert.equal(writes.length,count);assert.equal($('#legacyNoteText').value,'실패 후 바꾼 초안');assert.match($('#legacyNoteError').textContent,/앞선 저장/);$('#legacyNoteCancel').click();
 assert.equal(external,0);await (await app.noteEditor()).destroy();await (await app.textEditor()).destroy();console.log('PASS lost-response retry and changed-draft safety, zero external requests or production writes');
}finally{await fs.unlink(moduleURL);window.close();}
