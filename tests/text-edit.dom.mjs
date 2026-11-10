// Synthetic authenticated UI. No real customer data, login or external writes.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {JSDOM}=createRequire(import.meta.url)('jsdom'),root=new URL('../',import.meta.url);
const dom=new JSDOM(await fs.readFile(new URL('crm2.html',root),'utf8'),{url:'http://localhost/crm2.html',pretendToBeVisual:true}),{window}=dom;
window.CRM2_DEMO=false;window.matchMedia=()=>({matches:true,addEventListener(){}});window.scrollTo=()=>{};
for(const key of ['window','document','location','FormData','Event','CustomEvent','HTMLElement','HTMLInputElement'])globalThis[key]=key==='window'?window:window[key];
globalThis.matchMedia=window.matchMedia;globalThis.addEventListener=window.addEventListener.bind(window);Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
let network=0;globalThis.fetch=()=>{network++;throw Error('Network forbidden');};
const timers=[],oldInterval=globalThis.setInterval;globalThis.setInterval=(...args)=>{const id=oldInterval(...args);timers.push(id);return id;};
const company={name:'[가상] 편집 확인 업체',kind:'고객사',stage:'현장 방문',owner:'[가상] 담당',nextAction:'\n  1) 첫 항목\n  2) 두 번째 항목  ',nextDate:'2026-11-18'};
const visit={companyId:'c',type:'현장 방문',status:'완료',source:'dot-conversation',date:'2026-11-09',datePrecision:'day',createdBy:'original-author',createdAt:'2026-11-10T00:00:00Z',title:'[가상] 방문 제목',summary:'\n  기존 방문 내용\n\t추가 줄  ',nextAction:'  자료 전달\n 회신 확인  ',nextDue:'2026-11-20',attendeesUs:'[가상] 방문 담당',sourceActor:{kind:'service',id:'dot'}};
const note={companyId:'c',source:'dot-conversation',type:'확인 메모',recordKind:'undated_note',status:'확인 메모',title:'[가상] 메모',summary:'  '+'긴 메모 '.repeat(180)+'\n  끝  ',date:null,datePrecision:'unknown',createdAt:'2026-11-10T00:00:00Z'};
const task={companyId:'c',title:'[가상] 할 일',status:'todo',owner:'keep',dueAt:'2026-11-22'};
const server=new Map(Object.entries({'companies/c':company,'activities/a':visit,'activities/n':note,'tasks/t':task}).map(([path,data])=>[path,{data:structuredClone(data),version:3}]));
const writes=[];let fail=false,hold=false,release,holdRead=false,releaseRead;
const snap=(path,row)=>({id:path.split('/').at(-1),exists:!!row,version:row?.version,updatedAt:'server-at',updatedBy:'server-editor',data:()=>structuredClone(row?.data)});
const db={collection:name=>({get:async()=>({docs:[...server].filter(([path])=>path.slice(0,path.lastIndexOf('/'))===name).map(([path,row])=>snap(path,row))}),onSnapshot:()=>()=>{}}),doc:path=>({
 get:async()=>{if(holdRead)await new Promise(resolve=>releaseRead=resolve);return snap(path,server.get(path));},
 updateIfVersion:async(patch,version,{baseData,editId})=>{
  writes.push({path,patch:structuredClone(patch),version,editId});if(fail)throw Error('synthetic offline');if(hold)await new Promise(resolve=>release=resolve);
  const row=server.get(path);if(!row||row.version!==version)throw Error('다른 곳에서 변경되었거나 삭제된 기록');
  assert.deepEqual(baseData,row.data);assert.equal(baseData._id,undefined);
  const next={data:{...structuredClone(baseData),...structuredClone(patch)},version:version+1};server.set(path,next);return snap(path,next);
 },set:()=>{throw Error('No new records allowed');},update:()=>{throw Error('No unconditional update allowed');}
})};
window.claude={use:async name=>name==='db'?db:{can:async()=>true,isOwner:async()=>false,id:async()=>'editor',profiles:async ids=>Object.fromEntries(ids.map(id=>[id,{name:'[가상] 계정'}]))}};
window.dmSync={whoami:()=>({id:'editor',name:'[가상] 계정',role:'sales'})};
const moduleFile=new URL('.text-edit-dom-check.mjs',root),source=await fs.readFile(new URL('crm2.js',root),'utf8');
await fs.writeFile(moduleFile,source.replace(/boot\(\);\s*$/,'await boot();\nexport {state,render,selectCompany,closeModal,textEditModal,liveUpdates,canApplyLiveUpdates};'));
const $=q=>document.querySelector(q),tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const submit=()=>$('#dialogForm').onsubmit({preventDefault(){}});
async function open(selector){$(selector).click();await tick();return $('#dialogForm');}
async function artifact(name){
 if(!process.env.CRM_EDIT_FIXTURE_DIR)return;
 await fs.mkdir(process.env.CRM_EDIT_FIXTURE_DIR,{recursive:true});const copy=document.documentElement.cloneNode(true);copy.querySelectorAll('script,link').forEach(node=>node.remove());
 const style=document.createElement('style');style.textContent=(await Promise.all(['crm2.css','crm2-workflow.css','crm2-calendar.css','crm2-updates.css','crm2-focus.css'].map(file=>fs.readFile(new URL(file,root),'utf8')))).join('\n');copy.querySelector('head').append(style);
 copy.querySelectorAll('textarea').forEach((area,i)=>area.textContent=document.querySelectorAll('textarea')[i].value);
 await fs.writeFile(`${process.env.CRM_EDIT_FIXTURE_DIR}/${name}.html`,'<!doctype html>'+copy.outerHTML);
}
try{
 const app=await import(pathToFileURL(moduleFile.pathname).href);app.selectCompany('c');
 const find=(id,field)=>`[data-action=edit-text][data-id=${id}][data-field="${field}"]`;
 for(const [id,field] of [['a','summary'],['n','summary'],['c','nextAction'],['a','nextAction'],['t','title']])assert.ok($(find(id,field)));
 assert.doesNotMatch($('.crm-legacy-actions').textContent,/기존 화면/);await artifact('edit-overview');
 let form=await open(find('a','summary'));assert.equal(form.querySelectorAll('textarea').length,1);assert.equal(form.querySelectorAll('input,select').length,0);assert.equal(form.elements.editText.value,visit.summary);assert.equal(document.activeElement,form.elements.editText);assert.equal(app.canApplyLiveUpdates(),false);
 form.elements.editText.value='unsaved';$('[data-close]').click();assert.equal(writes.length,0);assert.equal($('#modalLayer').classList.contains('hidden'),true);
 form=await open(find('n','summary'));assert.equal(form.elements.editText.value,note.summary);assert.ok(form.elements.editText.value.length>600);app.closeModal();
 console.log('PASS section edit controls, one prefilled textarea, full untruncated raw text, cancel and realtime draft protection');
 form=await open(find('a','summary'));const raw='\n  수정 내용\n\t여백  <img src=x onerror=alert(1)>\n  ';form.elements.editText.value=raw;await artifact('edit-open');hold=true;const pending=submit();await submit();app.closeModal();assert.equal(writes.length,1);assert.equal($('#dialogSave').disabled,true);assert.equal(form.elements.editText.disabled,true);assert.equal($('#modalLayer').classList.contains('hidden'),false);release();await pending;hold=false;
 assert.equal(server.size,4);assert.equal(server.get('activities/a').data.summary,raw);assert.equal($('.crm-detail-now > section .crm-note-text').textContent,raw);assert.equal($('.crm-detail-now > section img'),null);assert.match($('.crm-detail-now > section').textContent,/2026-11-09 · 시간 미상/);
 for(const [key,value] of Object.entries(visit))if(key!=='summary')assert.deepEqual(server.get('activities/a').data[key],value,key);
 assert.equal(app.state.docUpdatedBy['activities/a'],'server-editor');form=await open(find('a','summary'));assert.equal(form.querySelectorAll('textarea').length,1);assert.equal($('.crm-text-revisions pre').textContent,visit.summary);await artifact('edit-history');await submit();assert.equal(writes.length,1);
 $('[data-action=company-tab][data-tab=activities]').click();assert.equal($('[data-activity-id=a] .crm-note-text').textContent,raw);assert.match($('[data-activity-id=n]').textContent,/활동일 미상/);
 console.log('PASS actual save handler updates same record, title/date/source preserved, escaped raw text, double-click blocked and recoverable history disclosure');
 // Failure + same-draft retry, stale/deleted versions and changed-draft safety.
 form=await open(find('n','summary'));form.elements.editText.value='  new note\n';fail=true;await submit();assert.equal(form.elements.editText.value,'  new note\n');assert.equal($('#dialogSave').disabled,false);assert.equal($('#modalLayer').classList.contains('hidden'),false);const attempted=writes.at(-1);fail=false;await submit();assert.equal(writes.at(-1).editId,attempted.editId);assert.equal(server.get('activities/n').data.date,null);assert.equal(server.get('activities/n').data.status,'확인 메모');assert.equal(server.size,4);
 form=await open(find('n','summary'));form.elements.editText.value='keep conflict draft';server.get('activities/n').version++;await submit();assert.equal(form.elements.editText.value,'keep conflict draft');assert.match($('#dialogError').textContent,/변경/);assert.equal($('#modalLayer').classList.contains('hidden'),false);app.closeModal();
 form=await open(find('n','summary'));form.elements.editText.value='first failed';fail=true;await submit();const count=writes.length;form.elements.editText.value='newer draft';fail=false;await submit();assert.equal(writes.length,count);assert.equal(form.elements.editText.value,'newer draft');assert.match($('#dialogError').textContent,/앞선 저장 결과/);app.closeModal();
 console.log('PASS failure/retry keeps stable operation, conflict/newer-draft failures retain exact textarea and never add records');
 $('[data-action=company-tab][data-tab=overview]').click();
 for(const [id,field,path,value] of [['c','nextAction','companies/c','  legacy revised\n  '],['a','nextAction','activities/a',' activity revised\n '],['t','title','tasks/t','  task revised\n ']]){
  form=await open(find(id,field));const before=structuredClone(server.get(path).data);form.elements.editText.value=value;await submit();assert.equal(server.get(path).data[field],value);for(const [key,old] of Object.entries(before))if(![field,'updatedAt','crmTextEdits'].includes(key))assert.deepEqual(server.get(path).data[key],old,key);assert.equal(server.size,4);
 }
 await artifact('edit-saved');console.log('PASS legacy company raw nextAction, activity nextAction and actual task title update their own original records only');
 form=await open(find('a','summary'));form.elements.editText.value='missing auth draft';const before=writes.length;app.state.userId=null;await submit();assert.equal(writes.length,before);assert.equal(form.elements.editText.value,'missing auth draft');app.state.userId='editor';app.state.canWrite=false;await submit();assert.equal(writes.length,before);assert.equal(form.elements.editText.value,'missing auth draft');app.closeModal();app.render();assert.equal($('[data-action=edit-text]'),null);app.textEditModal('activities','a','summary');assert.equal($('#modalLayer').classList.contains('hidden'),true);
 app.state.canWrite=true;app.render();holdRead=true;$(find('a','summary')).click();const oldForm=$('#dialogForm');app.closeModal();releaseRead();holdRead=false;await tick();assert.equal($('#modalLayer').classList.contains('hidden'),true);assert.notEqual($('#dialogForm'),oldForm);
 assert.equal(network,0);console.log('PASS revoked write/auth permissions, cancelled async open and zero network/customer-data writes');
}finally{timers.forEach(clearInterval);globalThis.setInterval=oldInterval;window.dispatchEvent(new window.Event('pagehide'));await fs.unlink(moduleFile);dom.window.close();}
