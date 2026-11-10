// Execute real legacy renderers and click/submit handlers against a versioned synthetic DB only.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {JSDOM}=createRequire(import.meta.url)('jsdom'),root=new URL('../',import.meta.url);
const html=await fs.readFile(new URL('index.html',root),'utf8');
const dom=new JSDOM(html,{url:'https://fixture.invalid/index.html?legacy=1#list',pretendToBeVisual:true}),{window}=dom;
for(const key of ['document','location','localStorage','HTMLElement','Event','CustomEvent','FormData'])globalThis[key]=window[key];
globalThis.window=window;globalThis.matchMedia=()=>({matches:true});window.HTMLElement.prototype.scrollIntoView=()=>{};globalThis.scrollTo=()=>{};
let network=0;globalThis.fetch=()=>{network++;throw Error('External network forbidden');};
const company={name:'[가상] 읽기·수정 업체',kind:'고객사',stage:'제안',channel:'인바운드',owner:'[가상] 담당',source:'test',needs:'\n  기존 니즈\n\t둘째 줄  ',memo:'업체 메모',checkNote:'확인할 사항',bizDetail:'업종 상세',scale:'규모 메모',nextAction:'  다음 행동\n두 줄  ',nextDate:'2026-11-20',contract:{scope:'보존할 범위',amount:100},docs:[{name:'[가상] 문서',url:'https://fixture.invalid/doc',kind:'계약서'}]};
const activity={companyId:'c',title:'[가상] 현장 방문',summary:'\n  기존 내용\n\t끝  ',type:'현장 방문',status:'완료',date:'2026-11-09',datePrecision:'day',source:'dot-conversation',createdBy:'original',createdAt:'2026-11-10T00:00:00Z',nextAction:' 자료 보내기 ',nextDue:'2026-11-30',issue:'고객 이슈',transcript:'  보존할 녹취\n ',transcriptAsset:'asset-fixture',report:{purpose:'방문 목적',decisionMaker:'만난 사람',problem:'고객 문제',proposal:'우리 제안',reaction:'고객 반응',blockers:'걸림돌',equipment:[{category:'로봇암',model:'fixture'}]},sourceRef:{messageId:'fixture-message'}};
const long={...structuredClone(activity),title:'[가상] 긴 기록',summary:'\n  '+'긴 기록 '.repeat(200)+'\n끝  ',date:null,datePrecision:'unknown',recordKind:'undated_note',status:'확인 메모'};
const content={...structuredClone(activity),title:'[가상] content 기록',summary:undefined,content:'  content 원문\n ',report:{equipment:[]}};delete content.summary;
const server=new Map(Object.entries({'companies/c':company,'companies/other':{...company,name:'[가상] 다른 업체'},'activities/a':activity,'activities/long':long,'activities/content':content}).map(([path,data])=>[path,{data:structuredClone(data),version:3}]));
const writes=[];let fail=false,hold=false,release,holdRead=false,releaseRead,holdReply=false,releaseReply,failRead=false;
const snapshot=(path,row)=>({exists:!!row,id:path.split('/').at(-1),version:row?.version,updatedAt:'server',updatedBy:'fixture-editor',data:()=>structuredClone(row?.data)});
const db={doc:path=>({get:async()=>{if(failRead)throw Error('가상 읽기 오류');if(holdRead)await new Promise(resolve=>releaseRead=resolve);return snapshot(path,server.get(path));},updateIfVersion:async(patch,version,{baseData,editId})=>{
 writes.push({path,patch:structuredClone(patch),version,editId});if(fail)throw Error('가상 네트워크 오류');if(hold)await new Promise(resolve=>release=resolve);
 const row=server.get(path);if(!row||row.version!==version)throw Error('다른 곳에서 변경되었거나 삭제되었습니다.');assert.deepEqual(baseData,row.data);
 const saved={data:{...row.data,...structuredClone(patch)},version:version+1};server.set(path,saved);if(holdReply)await new Promise(resolve=>releaseReply=resolve);return snapshot(path,saved);
},set:()=>{throw Error('No replacement writes permitted');},update:()=>{throw Error('No unconditional update permitted');},delete:()=>{throw Error('No deletes permitted');}})};
const appCode=html.slice(html.indexOf("(() => {\n'use strict';")+9,html.indexOf('// ---------- boot ----------'));
const moduleURL=new URL('.legacy-edit-dom-fixture.mjs',root);
await fs.writeFile(moduleURL,appCode+`\nexport function seed(fakeDB,rows,role='admin'){MAP={w:100,h:100,provs:[],munis:[]};db=fakeDB;companies=rows.filter(([p])=>p.startsWith('companies/')).map(([p,r])=>({...structuredClone(r.data),_id:p.split('/').at(-1)}));acts=rows.filter(([p])=>p.startsWith('activities/')).map(([p,r])=>({...structuredClone(r.data),_id:p.split('/').at(-1),_raw:structuredClone(r.data)}));for(const [p,r] of rows)legacyDocVersions[p]=r.version;loaded={c:true,a:true};myId='fixture-editor';canWrite=role!=='view';isAdmin=role==='admin';tab='list';view.sel='c';view.form=null;view.dtab='hist';contacts={c:{phone:'fixture-phone',email:'fixture@example.invalid'}};renderAll();}\nexport function role(value){canWrite=value==='unknown'?null:value!=='view';isAdmin=value==='admin';if(value==='view'||value==='unknown')contacts={};renderAll();}\nexport function identity(value){myId=value;}\nexport function removeLocal(id){acts=acts.filter(a=>a._id!==id);}\nexport function remote(collection,snap){if(collection==='companies')companies=legacySnapshotRows(collection,snap);else acts=legacySnapshotRows(collection,snap);renderAll();}\nexport {renderAll,select,view,legacyTextState,openLegacyText};\nexport const editor=()=>legacyTextEditorPromise;`);
const $=q=>document.querySelector(q),tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const button=(id,field)=>`[data-legacy-id="${id}"][data-legacy-field="${field}"]`;
async function open(id,field){const node=$(button(id,field));assert.ok(node,`${id} ${field} control exists`);node.click();for(let i=0;i<30&&!$('#legacyEditText');i++)await tick();await tick();return $('#legacyTextEditForm');}
const submit=()=>$('#legacyTextEditForm').onsubmit({preventDefault(){}});
async function artifact(name){if(!process.env.CRM_LEGACY_FIXTURE_DIR)return;await fs.mkdir(process.env.CRM_LEGACY_FIXTURE_DIR,{recursive:true});const copy=document.documentElement.cloneNode(true);copy.querySelectorAll('script,link').forEach(node=>node.remove());const style=document.createElement('style');style.textContent=await fs.readFile(new URL('legacy-readable.css',root),'utf8');copy.querySelector('head').append(style);copy.querySelectorAll('textarea').forEach((area,i)=>area.textContent=document.querySelectorAll('textarea')[i].value);await fs.writeFile(`${process.env.CRM_LEGACY_FIXTURE_DIR}/${name}.html`,'<!doctype html>'+copy.outerHTML);}
try{
 const app=await import(pathToFileURL(moduleURL.pathname).href);app.seed(db,[...server]);
 assert.equal($('#editCo').textContent,'업체 정보 수정');assert.equal($('.dpane[data-pane=hist]').hidden,false);assert.match($('[data-legacy-activity=a]').textContent,/내용 수정/);assert.match($('#list .legacy-row-next').textContent,/다음/);assert.ok($('[data-legacy-activity=long] .legacy-expand'));await artifact('legacy-history');
 let form=await open('a','summary');assert.equal(form.querySelectorAll('textarea').length,1);assert.equal(form.querySelectorAll('input,select').length,0);assert.equal($('#legacyEditText').value,activity.summary);assert.equal(document.activeElement,$('#legacyEditText'));assert.match($('#legacyEditStatus').textContent,/날짜/);await artifact('legacy-editor');
 $('#legacyEditText').value='취소할 내용';$('#legacyEditCancel').click();assert.equal($('#legacyTextEditForm'),null);assert.equal(writes.length,0);
 form=await open('long','summary');assert.equal($('#legacyEditText').value,long.summary);$('#legacyEditCancel').click();
 console.log('PASS exact legacy history rendering, distinct company edit, one full prefilled textarea, long text expand and cancel');
 const raw='\n  고친 내용\n\t여백 <img src=x onerror=alert(1)>\n  ';
 await open('a','summary');$('#legacyEditText').value=raw;hold=true;const pending=submit();await submit();$('#legacyEditCancel').click();assert.equal($('#legacyEditSave').disabled,true);assert.equal($('#legacyEditText').disabled,true);assert.equal(writes.length,1);release();await pending;hold=false;
 assert.equal(server.size,5);assert.equal(server.get('activities/a').data.summary,raw);assert.deepEqual(app.legacyTextState().activities.find(a=>a._id==='a')._raw,server.get('activities/a').data);assert.equal(Object.hasOwn(app.legacyTextState().activities.find(a=>a._id==='a')._raw,'_id'),false);assert.equal($('#legacyTextEditForm'),null);assert.equal($('[data-legacy-activity=a] .legacy-text').textContent,raw);assert.equal($('[data-legacy-activity=a] img'),null);
 for(const [key,value] of Object.entries(activity))if(key!=='summary')assert.deepEqual(server.get('activities/a').data[key],value,key);
 await open('a','summary');assert.equal($('.legacy-edit-history pre').textContent,activity.summary);await submit();assert.equal(writes.length,1);
 console.log('PASS actual save mutates same summary only with CAS, old text recoverable, duplicate submit blocked, source/date/status/deadline/transcript retained');
 await open('a','summary');$('#legacyEditText').value='실패해도 남는 초안';fail=true;await submit();const operation=writes.at(-1).editId;assert.equal($('#legacyEditText').value,'실패해도 남는 초안');assert.match($('#legacyEditError').textContent,/오류/);assert.equal($('#legacyEditSave').disabled,false);fail=false;await submit();assert.equal(writes.at(-1).editId,operation);
 await open('a','summary');$('#legacyEditText').value='충돌 초안';server.get('activities/a').version++;await submit();assert.equal($('#legacyEditText').value,'충돌 초안');assert.match($('#legacyEditError').textContent,/변경/);$('#legacyEditCancel').click();
 await open('a','summary');$('#legacyEditText').value='첫 시도';fail=true;await submit();const count=writes.length;$('#legacyEditText').value='새 초안';fail=false;await submit();assert.equal(writes.length,count);assert.equal($('#legacyEditText').value,'새 초안');assert.match($('#legacyEditError').textContent,/앞선 저장/);$('#legacyEditCancel').click();
 console.log('PASS failures and stale versions retain drafts, stable-operation retries, unknown-outcome changed draft is not submitted');
 // Explicit report edits can target their own field even when summary is the primary body.
 for(const [id,field,path] of [['c','needs','companies/c'],['c','memo','companies/c'],['c','nextAction','companies/c'],['c','checkNote','companies/c'],['a','title','activities/a'],['a','issue','activities/a'],['a','nextAction','activities/a'],...['purpose','decisionMaker','problem','proposal','reaction','blockers'].map(k=>['a','report.'+k,'activities/a']),['content','content','activities/content']]){
  const before=structuredClone(server.get(path).data);await open(id,field);const old=field.startsWith('report.')?before.report[field.slice(7)]:before[field];assert.equal($('#legacyEditText').value,old);const revised='\n  변경 '+field+'\n  ';$('#legacyEditText').value=revised;await submit();const after=server.get(path).data;
  if(field.startsWith('report.')){assert.equal(after.report[field.slice(7)],revised);for(const [key,value] of Object.entries(before.report))if(key!==field.slice(7))assert.deepEqual(after.report[key],value);}
  else assert.equal(after[field],revised);
  for(const [key,value] of Object.entries(before))if(![field,'updatedAt','crmTextEdits',...(field.startsWith('report.')?['report']:[])].includes(key))assert.deepEqual(after[key],value,key);
 }
 console.log('PASS company needs/memo/nextAction/checkNote, history title/body/issue/nextAction and each report field keep all siblings and record provenance');
 // Draft layer survives normal render, company selection and browser history events.
 await open('a','summary');$('#legacyEditText').value='이동 중에도 남는 초안';const area=$('#legacyEditText');app.renderAll();assert.equal($('#legacyEditText'),area);app.select('other');window.history.pushState({},'', '#map');window.dispatchEvent(new window.PopStateEvent('popstate'));window.dispatchEvent(new window.HashChangeEvent('hashchange'));assert.equal($('#legacyEditText'),area);assert.equal(area.value,'이동 중에도 남는 초안');await submit();assert.equal(app.view.sel,'other');assert.equal(server.get('activities/a').data.summary,'이동 중에도 남는 초안');app.select('c');
 // Real full workflows are still reachable without silently reusing the unsafe legacy form for text-only edits.
 $('#editCo').click();assert.ok($('#coF'));assert.match($('#fNeeds').value,/변경 needs/);assert.ok($('#fCNote'));assert.ok($('#fPhone'));$('#fCancel').click();
 $('[data-legacy-activity=a] [data-edit]').click();assert.ok($('#conversationNoteF'));$('#noteCancel').click();
 $('[data-dtab=docs]').click();assert.equal($('.dpane[data-pane=docs]').hidden,false);assert.match($('.dpane[data-pane=docs]').textContent,/문서/);$('[data-dtab=hist]').click();
 console.log('PASS refresh/selection/back events retain draft and selection, old company/contact/contract/docs and history structured edit remain reachable');
 // A newer realtime row arriving while the successful older response is in flight wins.
 await open('a','summary');$('#legacyEditText').value='내 저장';holdReply=true;const savedPending=submit();await tick();
 const savedRow=structuredClone(server.get('activities/a'));const newer={data:{...savedRow.data,summary:'나중에 저장된 최신 내용'},version:savedRow.version+1};server.set('activities/a',newer);
 const activitySnapshots=()=>({docs:[...server].filter(([p])=>p.startsWith('activities/')).map(([p,row])=>snapshot(p,row))});
 app.remote('activities',activitySnapshots());releaseReply();await savedPending;holdReply=false;
 assert.equal(app.legacyTextState().activities.find(a=>a._id==='a').summary,newer.data.summary);assert.equal(app.legacyTextState().docVersions['activities/a'],newer.version);
 const stale=activitySnapshots();stale.docs=stale.docs.map(d=>d.id==='a'?snapshot('activities/a',savedRow):d);app.remote('activities',stale);assert.equal(app.legacyTextState().activities.find(a=>a._id==='a').summary,newer.data.summary);
 assert.deepEqual(app.legacyTextState().activities.find(a=>a._id==='a')._raw,newer.data);
 console.log('PASS newer realtime snapshot wins over delayed save response and stale snapshot; _raw remains exact confirmed server data');

 for(const role of ['sales','admin']){app.role(role);await open('a','summary');assert.ok($('#legacyTextEditForm'));$('#legacyEditCancel').click();}
 await open('a','summary');$('#legacyEditText').value='권한 바뀐 초안';const deniedCount=writes.length;app.role('view');await submit();assert.equal(writes.length,deniedCount);assert.equal($('#legacyEditText').value,'권한 바뀐 초안');$('#legacyEditCancel').click();assert.equal($('[data-legacy-field]'),null);assert.equal($('#editCo'),null);assert.equal($('#addAct'),null);assert.doesNotMatch($('#detailCard').textContent,/fixture-phone/);app.role('unknown');assert.equal($('[data-legacy-field]'),null);
 app.role('sales');await open('a','summary');$('#legacyEditText').value='로그인 바뀐 초안';app.identity(null);await submit();assert.equal(writes.length,deniedCount);assert.equal($('#legacyEditText').value,'로그인 바뀐 초안');$('#legacyEditCancel').click();app.identity('fixture-editor');
 holdRead=true;const opening=app.openLegacyText($(button('a','summary')));await tick();$('#legacyEditCancel').click();releaseRead();holdRead=false;await opening;assert.equal($('#legacyTextEditForm'),null);
 // An initial read failure leaves existing text copyable but cannot create an unsavable draft.
 failRead=true;await open('a','summary');assert.equal($('#legacyEditText').readOnly,true);assert.equal($('#legacyEditText').disabled,false);assert.equal($('#legacyEditSave').disabled,true);assert.match($('#legacyEditError').textContent,/읽기 오류/);await submit();assert.equal(writes.length,deniedCount);$('#legacyEditCancel').click();failRead=false;
 // Missing safe bridge method fails closed; no fallback set/update.
 const oldDoc=db.doc;db.doc=path=>({...oldDoc(path),updateIfVersion:undefined});await open('a','summary');$('#legacyEditText').value='안전한 저장기 없음';await submit();assert.match($('#legacyEditError').textContent,/안전한 수정/);assert.equal(writes.length,deniedCount);assert.equal($('#legacyEditText').value,'안전한 저장기 없음');$('#legacyEditCancel').click();db.doc=oldDoc;
 assert.equal(network,0);await artifact('legacy-after');console.log('PASS admin/sales/view/unknown gates, revoked auth, cancelled async opening and missing CAS fail closed with zero external calls');
 await (await app.editor()).destroy();
}finally{await fs.unlink(moduleURL);window.close();}
