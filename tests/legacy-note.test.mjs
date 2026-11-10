import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {captureLegacyNote,saveLegacyNote} from '../legacy-note-entry.mjs';
const bridge=await readFile(new URL('../bridge.js',import.meta.url),'utf8');
const docRefCode=bridge.slice(bridge.indexOf('  function docRef(path) {'),bridge.indexOf('\n  const dbCap'));
const error=(code,message)=>Object.assign(new Error(message),{code});
function transport(){
 let row=null,behavior='',readFailure=false,authId='author',authError=false,authReads=0,holdAuth=false,releaseAuth=null;
 const authListeners=new Set();
 const me={id:'author',role:'sales'},writes=[],applied=[];
 const sb={auth:{onAuthStateChange:listener=>{authListeners.add(listener);return {data:{subscription:{unsubscribe:()=>authListeners.delete(listener)}}};},getUser:async()=>{authReads++;const readId=authId;if(holdAuth)await new Promise(resolve=>releaseAuth=resolve);return authError?{error:Error('Synthetic expired session')}:{data:{user:readId?{id:readId}:null}};}},from(table){assert.equal(table,'docs');let payload,signal;const q={
  insert(value){payload=structuredClone(value);writes.push(payload);return q;},
  upsert(){throw Error('Upsert forbidden');},update(){throw Error('Update forbidden');},
  select(columns){assert.equal(columns,'path,data,version,updated_at,updated_by');return q;},abortSignal(value){signal=value;assert.ok(signal instanceof AbortSignal);return q;},eq(){return q;},
  async maybeSingle(){if(readFailure)throw Error('read offline');return {data:structuredClone(row)};},
  async single(){
   if(behavior==='switch-before-write'){authId='other';for(const fn of authListeners)fn('SIGNED_IN',{user:{id:authId}});assert.equal(signal.aborted,true);return {error:{message:'aborted'}};}
   if(behavior==='denied')return {error:{message:'row-level security permission denied'}};
   if(behavior==='offline')throw Error('offline');
   if(row)return {error:{code:'23505',message:'duplicate key'}};
   row={...payload,version:1,updated_at:'server',updated_by:me.id};
   row.data=Object.fromEntries(Object.entries(row.data).reverse());
   if(behavior==='lost-after-edit'){row.data.summary='later edit';row.version++;throw Error('response lost');}
   if(behavior==='lost')throw Error('response lost');
   return {data:structuredClone(row)};
  }};return q;}};
 const snap=(path,row)=>({id:path.split('/').at(-1),exists:!!row,version:row?.version,updatedAt:row?.updated_at,updatedBy:row?.updated_by,data:()=>structuredClone(row?.data)});
 const docRef=new Function('sb','me','err','clone','applyLocal','docSnap','denied',"const idOf=p=>p.split('/').at(-1);\n"+docRefCode+'\nreturn docRef;')(sb,me,error,structuredClone,r=>applied.push(r),snap,e=>error(/permission/.test(e?.message)?'permission-denied':'unavailable',e?.message));
 const state={canWrite:true,userId:'author',db:{doc:docRef},companies:[{_id:'c'}],userCap:{id:async()=>me.id,can:async()=>['sales','admin'].includes(me.role)}};
 return {state,me,writes,applied,get listeners(){return authListeners.size;},set holdAuth(value){holdAuth=value;},releaseAuth:()=>releaseAuth(),switchAuth(id){authId=id;for(const fn of authListeners)fn('SIGNED_IN',id?{user:{id}}:null);},set authId(value){authId=value;},set authError(value){authError=value;},get authReads(){return authReads;},get row(){return row;},set row(value){row=value;},set behavior(value){behavior=value;},set readFailure(value){readFailure=value;}};
}
const draft=h=>captureLegacyNote(h.state,'c'),save=(h,d,text)=>saveLegacyNote(()=>h.state,d,text);
test('legacy note uses shared raw builder and actual INSERT-only bridge with no invented event/task fields',async()=>{
 const h=transport(),d=draft(h),text='\n  내일 미팅?\n\t<img src=x>  ';
 const result=await save(h,d,text);assert.equal(result.recordData.summary,text);assert.equal(h.writes.length,1);assert.equal(h.writes[0].path,'activities/'+d.id);assert.equal(h.row.data.createdBy,'author');
 for(const [key,value] of Object.entries({date:null,datePrecision:'unknown',recordKind:'undated_note',source:'crm2-note',type:'메모',status:'확인 메모',meetingRecord:false}))assert.equal(h.row.data[key],value);
 for(const key of ['nextAction','nextDue','report','sourceActor','stage','attendeesUs','transcript'])assert.equal(h.row.data[key],undefined);
 assert.deepEqual(h.state.companies,[{_id:'c'}]);
});
test('same stable ID and payload handles unique conflicts/racing creates without replacement writes',async()=>{
 const h=transport(),d=draft(h);const [a,b]=await Promise.all([save(h,d,'same'),save(h,d,'same')]);
 assert.equal(a.id,b.id);assert.equal(h.row.version,1);assert.equal(h.writes[0].path,h.writes[1].path);assert.deepEqual(h.writes[0].data,h.writes[1].data);
});
test('lost response reconciles canonical JSONB key order and exact original payload',async()=>{
 const h=transport(),d=draft(h);h.behavior='lost';const result=await save(h,d,'saved');assert.equal(result.recordData.summary,'saved');assert.equal(h.writes.length,1);assert.equal(h.row.version,1);
});
test('uncertain insert retains ID/payload and later retry cannot duplicate or overwrite',async()=>{
 const h=transport(),d=draft(h);h.behavior='lost';h.readFailure=true;await assert.rejects(()=>save(h,d,'saved'));
 h.readFailure=false;h.behavior='';await save(h,d,'saved');assert.equal(h.row.version,1);assert.equal(h.writes[0].path,h.writes[1].path);assert.deepEqual(h.writes[0].data,h.writes[1].data);
});
test('later edited row or unrelated ID collision fails closed with no replacement',async()=>{
 const h=transport(),d=draft(h);h.behavior='lost-after-edit';await assert.rejects(()=>save(h,d,'mine'),/내용이 달라졌/);assert.equal(h.row.data.summary,'later edit');
 h.behavior='';await assert.rejects(()=>save(h,d,'mine'),/내용이 달라졌/);assert.equal(h.row.data.summary,'later edit');assert.equal(h.row.version,2);
 const other=transport(),collision=draft(other);other.row={path:'activities/'+collision.id,data:{createdBy:'different',summary:'existing'},version:4};await assert.rejects(()=>save(other,collision,'new'),/내용이 달라졌/);assert.equal(other.row.data.summary,'existing');assert.equal(other.row.version,4);
});
test('changed draft after an uncertain save does not send a new payload',async()=>{
 const h=transport(),d=draft(h);h.behavior='offline';await assert.rejects(()=>save(h,d,'first'));await assert.rejects(()=>save(h,d,'changed'),/앞선 저장/);assert.equal(h.writes.length,1);assert.equal(h.row,null);
});
test('empty/oversize notes and unavailable safe creation fail before writes',async()=>{
 const h=transport(),d=draft(h);for(const value of [' \n\t ','x'.repeat(150001)])await assert.rejects(()=>save(h,d,value));assert.equal(d.attempt,null);assert.equal(h.writes.length,0);
 h.state.db.doc=()=>({set(){throw Error('Never fall back');}});await assert.rejects(()=>save(h,d,'draft'),/안전한 메모/);assert.equal(h.writes.length,0);
});
test('unknown/read-only/missing identities or changed active auth fail closed',async()=>{
 for(const mode of ['view','unknown','missing','changed','active-changed','active-view','db-changed','company-missing']){
  const h=transport(),d=draft(h);if(mode==='view')h.state.canWrite=false;if(mode==='unknown')h.state.canWrite=null;if(mode==='missing')h.state.userId=null;if(mode==='changed')h.state.userId='other';if(mode==='active-changed')h.me.id='other';if(mode==='active-view')h.me.role='view';if(mode==='db-changed')h.state.db={};if(mode==='company-missing')h.state.companies=[];
  await assert.rejects(()=>save(h,d,'keep draft'));assert.equal(h.writes.length,0,mode);
 }
});
test('session changes while capability checks await are rechecked before insert',async()=>{
 const h=transport(),d=draft(h);let release;h.state.userCap.id=()=>new Promise(resolve=>release=resolve);const saving=save(h,d,'draft');h.state.userId='other';release('author');await assert.rejects(()=>saving,/로그인 상태/);assert.equal(h.writes.length,0);
});
test('actual bridge rejects RLS and explicit missing/changed/readonly identity without changing data',async()=>{
 const h=transport(),record={createdBy:'author',summary:'draft'};h.behavior='denied';await assert.rejects(()=>h.state.db.doc('activities/a').createIfAbsent(record,{expectedUserId:'author'}),e=>e.code==='permission-denied');assert.equal(h.row,null);
 const count=h.writes.length;for(const [role,id,expected] of [['view','author','author'],['sales','other','author'],['sales','author',null]]){h.me.role=role;h.me.id=id;await assert.rejects(()=>h.state.db.doc('activities/a').createIfAbsent(record,{expectedUserId:expected}));}assert.equal(h.writes.length,count);
});
test('actual legacy note loader fails closed without unsafe fallback',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');const code=html.slice(html.indexOf('async function openLegacyNote('),html.indexOf('\nfunction legacyCompanyText('));let calls=0;const notices=[];
 const context={canWrite:true,isAdmin:false,myId:'author',legacyNoteEntryPromise:null,toast:t=>notices.push(t),legacyNoteState:()=>({}),loadFixture:async()=>{calls++;throw Error('offline');}};
 vm.createContext(context);vm.runInContext(code.replace("import('./legacy-note-entry.mjs?v=20261110-legacy-note-1')",'loadFixture()'),context);
 const button={disabled:false};await context.openLegacyNote(button,'c');assert.equal(button.disabled,false);assert.equal(context.legacyNoteEntryPromise,null);assert.match(notices.at(-1),/불러오지 못했습니다/);
 context.canWrite=null;await context.openLegacyNote(button,'c');assert.equal(calls,1);context.canWrite=true;context.myId=null;await context.openLegacyNote(button,'c');assert.equal(calls,1);
});

test('actual Supabase account is freshly verified, even when cached me and legacy state still match',async()=>{
 for(const mode of ['different-account','signed-out','auth-error']){
  const h=transport(),d=draft(h);if(mode==='different-account')h.authId='other';if(mode==='signed-out')h.authId=null;if(mode==='auth-error')h.authError=true;
  await assert.rejects(()=>save(h,d,'unsaved draft'),/로그인 계정/);assert.equal(h.state.userId,'author');assert.equal(h.me.id,'author');assert.equal(h.writes.length,0);assert.equal(h.row,null);assert.equal(h.authReads,1);
 }
});

test('auth switch during deferred getUser invalidates stale A response before any INSERT',async()=>{
 const h=transport(),d=draft(h);h.holdAuth=true;const pending=save(h,d,'draft');
 for(let i=0;i<10&&!h.authReads;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.authReads,1);assert.equal(h.listeners,1);h.switchAuth('other');h.releaseAuth();
 await assert.rejects(()=>pending,/로그인 계정/);assert.equal(h.writes.length,0);assert.equal(h.row,null);assert.equal(h.listeners,0);assert.equal(h.state.userId,'author');assert.equal(h.me.id,'author');
});
test('local auth guard is removed after confirmed, failed and conflicting writes',async()=>{
 const h=transport(),d=draft(h);await save(h,d,'memo');assert.equal(h.listeners,0);h.row.data.summary='later';await assert.rejects(()=>save(h,d,'memo'));assert.equal(h.listeners,0);
 const offline=transport();offline.behavior='offline';await assert.rejects(()=>save(offline,draft(offline),'memo'));assert.equal(offline.listeners,0);
});

test('auth switch during INSERT aborts attempt and never applies another-account response',async()=>{
 const h=transport(),d=draft(h);h.behavior='switch-before-write';await assert.rejects(()=>save(h,d,'draft'),/로그인 계정/);assert.equal(h.row,null);assert.equal(h.applied.length,0);assert.equal(h.listeners,0);
});
test('confirmed creation and exact retry reconciliation have no post-save auth reads',async()=>{
 const h=transport(),d=draft(h);await save(h,d,'memo');assert.equal(h.authReads,1);await save(h,d,'memo');assert.equal(h.authReads,2);assert.equal(h.row.version,1);
});
