import test from 'node:test';
import assert from 'node:assert/strict';
test('entrypoint versions the editing bridge with the matching app and stylesheet release',async()=>{
 const html=await readFile(new URL('../crm2.html',import.meta.url),'utf8');
 const main=html.match(/import\('\.\/crm2\.js\?v=([^']+)'\)/)?.[1];
 const bridge=html.match(/s\.src=name==='bridge\.js'\?name\+'\?v=([^']+)':name/)?.[1];
 const style=html.match(/href="crm2-focus\.css\?v=([^"]+)"/)?.[1];
 assert.ok(main);assert.equal(bridge,main);assert.equal(style,main);
});
import {readFile} from 'node:fs/promises';
import {activityTextField,rawText,captureTextEdit,loadTextEdit,textPatch,storedDraft,revisionPatch,saveTextEdit} from '../crm2-text-edit.mjs';
const source=await readFile(new URL('../bridge.js',import.meta.url),'utf8');
const docRefCode=source.slice(source.indexOf('  function docRef(path) {'),source.indexOf('\n  const dbCap'));
const base={companyId:'c',summary:'\n  old\n\ttext  ',title:'original title',createdBy:'author',source:'dot-conversation',sourceActor:{kind:'service',id:'dot'},date:null,datePrecision:'unknown',reportedAt:'2026-11-09',createdAt:'2026-11-10T00:00:00Z',status:'확인 메모',owner:'owner',nextDue:null,stage:'keep',report:{purpose:'other text',decision:'keep'}};
const makeError=(code,message)=>Object.assign(new Error(message),{code});
function transport(data=base){
 let row={path:'activities/a',data:structuredClone(data),version:7,updated_at:'server-before',updated_by:'original-editor'},behavior='',readFailure=false;
 const writes=[],applied=[],queries=[],listeners=new Set();let authId='editor',authError=false,authReads=0,holdAuth=false,releaseAuth;
 const me={id:'editor',role:'sales'};
 const sb={auth:{onAuthStateChange:listener=>{listeners.add(listener);return {data:{subscription:{unsubscribe:()=>listeners.delete(listener)}}};},getUser:async()=>{authReads++;const readId=authId;if(holdAuth)await new Promise(resolve=>releaseAuth=resolve);return authError?{error:Error('auth unavailable')}:{data:{user:readId?{id:readId}:null}};}},from(table){assert.equal(table,'docs');const filters={};let payload,signal;
  const query={update(value){payload=value;writes.push(structuredClone(value));return query;},select(columns){assert.equal(columns,'path,data,version,updated_at,updated_by');return query;},abortSignal(value){signal=value;assert.ok(signal instanceof AbortSignal);return query;},eq(key,value){filters[key]=value;return query;},async maybeSingle(){
   queries.push({filters:{...filters},write:!!payload});
   if(!payload){if(readFailure)throw Error('read offline');return {data:row?structuredClone(row):null};}
   assert.deepEqual(Object.keys(payload),['data']);assert.equal(filters.path,'activities/a');assert.ok(Number.isSafeInteger(filters.version));
   if(behavior==='switch-before-write'){authId='other';for(const fn of listeners)fn('SIGNED_IN',{user:{id:authId}});assert.equal(signal.aborted,true);return {error:{message:'aborted'}};}
   if(behavior==='denied')return {error:{message:'row-level security permission denied'}};
   if(behavior==='offline')throw Error('network unavailable');
   if(!row||row.version!==filters.version)return {data:null};
   row={...row,data:structuredClone(payload.data),version:row.version+1,updated_at:'server-after',updated_by:'server-editor'};
   if(behavior==='lost-after-newer'){row.data.summary='someone later';row.version++;throw Error('response lost');}
   if(behavior==='lost'){row.data.crmTextEdits=row.data.crmTextEdits.map(item=>Object.fromEntries(Object.entries(item).reverse()));throw Error('response lost');}
   return {data:structuredClone(row)};
  }};return query;
 }};
 const snap=(path,r)=>({id:path.split('/').at(-1),exists:!!r,version:r?.version,updatedAt:r?.updated_at,updatedBy:r?.updated_by,data:()=>structuredClone(r?.data)});
 const docRef=new Function('sb','me','err','clone','applyLocal','docSnap','denied',"const idOf=p=>p.split('/').at(-1);\n"+docRefCode+'\nreturn docRef;')(sb,me,makeError,structuredClone,r=>applied.push(r),snap,e=>makeError(/permission/.test(e?.message)?'permission-denied':'unavailable',e?.message));
 return {db:{doc:docRef},writes,applied,queries,me,get listeners(){return listeners.size;},get authReads(){return authReads;},set holdAuth(value){holdAuth=value;},releaseAuth:()=>releaseAuth(),switchAuth(id){authId=id;for(const fn of listeners)fn('SIGNED_IN',id?{user:{id}}:null);},set authId(value){authId=value;},set authError(value){authError=value;},get row(){return row;},set row(value){row=value;},set behavior(value){behavior=value;},set readFailure(value){readFailure=value;}};
}
function fixture(data=base){const h=transport(data);const state={canWrite:true,demo:false,userId:'editor',db:h.db,docVersions:{'activities/a':7},activities:[{...structuredClone(data),_id:'a'}],companies:[{_id:'c',nextAction:'old next'}],tasks:[{_id:'t',title:'old task',status:'todo'}]};return {h,state};}
const opened=f=>loadTextEdit(f.state,'activities','a','summary');
test('source field mapping uses original summary/content/report purpose/purpose without remapping',()=>{
 for(const [record,field] of [[{summary:'text'},'summary'],[{summary:' ',content:'c'},'content'],[{report:{purpose:'p'}},'report.purpose'],[{purpose:'p'},'purpose'],[{},'summary']])assert.equal(activityTextField(record),field);
 assert.equal(rawText(base,'report.purpose'),'other text');
});
test('fresh opening snapshot has server data and version without UI _id; no mutation on open',async()=>{
 const f=fixture();f.state.activities[0].summary='stale UI';const edit=await opened(f);assert.equal(edit.value,base.summary);assert.equal(edit.record._id,undefined);assert.equal(edit.version,7);assert.equal(f.h.writes.length,0);
});
test('whitespace, leading newline and CRLF preservation; unchanged long existing values are no-op',()=>{
 assert.equal(storedDraft('\r\n old\r\n','\n old\n'),'\r\n old\r\n');assert.equal(storedDraft('a\r\nb','a\nx\n'),'a\r\nx\r\n');
 const edit={collection:'activities',value:'x'.repeat(160000),field:'summary'};assert.equal(textPatch(edit,edit.value),null);assert.throws(()=>textPatch(edit,'y'.repeat(150001)),/150,000/);
});
test('body clear cannot expose hidden fallback; clear next action is deliberate',()=>{
 assert.throws(()=>textPatch({collection:'activities',field:'summary',value:base.summary,record:base},''),/다른 원문/);
 assert.equal(textPatch({collection:'activities',field:'nextAction',value:'next',record:base},'').nextAction,'');
});
test('CAS saves original record plus one field/update/history; keeps all dates/source/title/owner metadata',async()=>{
 const f=fixture(),edit=await opened(f),text='  changed\n\t <script>unsafe</script>  ';
 await saveTextEdit(f.state,edit,text);const data=f.h.row.data;
 for(const [key,value] of Object.entries(base))if(key!=='summary')assert.deepEqual(data[key],value,key);
 assert.equal(data.summary,text);assert.equal(data.crmTextEdits[0].before,base.summary);assert.equal(data.crmTextEdits[0].after,text);assert.equal(data.crmTextEdits[0].baseVersion,7);assert.equal(data._id,undefined);
 assert.equal(f.state.docUpdatedBy['activities/a'],'server-editor');assert.equal(f.state.docVersions['activities/a'],8);assert.equal(f.h.applied.length,1);
 assert.deepEqual(f.h.queries.at(-1).filters,{path:'activities/a',version:7});
});
test('two editors of one base: one CAS succeeds and other cannot overwrite, history has one entry',async()=>{
 const f=fixture(),a=await opened(f),b=await opened(f);
 const result=await Promise.allSettled([saveTextEdit(f.state,a,'first'),saveTextEdit(f.state,b,'second')]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.code,'conflict');
 assert.equal(f.h.row.data.summary,'first');assert.equal(f.h.row.data.crmTextEdits.length,1);assert.equal(f.h.applied.length,1);
});
test('nested report purpose edit retains report siblings and backing field identity',async()=>{
 const f=fixture({...base,summary:'',report:{purpose:'old nested',decision:'keep'}}),edit=await loadTextEdit(f.state,'activities','a','report.purpose');
 await saveTextEdit(f.state,edit,' new nested\n');assert.equal(f.h.row.data.summary,'');assert.deepEqual(f.h.row.data.report,{purpose:' new nested\n',decision:'keep'});assert.equal(f.h.row.data.crmTextEdits[0].field,'report.purpose');
});
test('lost response reconciles stable operation and returns later server state without replay',async()=>{
 const f=fixture(),edit=await opened(f);f.h.behavior='lost-after-newer';
 const result=await saveTextEdit(f.state,edit,'my edit');assert.equal(result.subsequentlyChanged,true);assert.equal(f.h.writes.length,1);assert.equal(f.state.activities[0].summary,'someone later');assert.equal(f.h.applied.length,1);assert.equal(f.h.applied[0].version,9);
});
test('uncertain failed reconciliation retries identical operation safely without duplicate history',async()=>{
 const f=fixture(),edit=await opened(f);f.h.behavior='lost';f.h.readFailure=true;
 await assert.rejects(saveTextEdit(f.state,edit,'my edit'));assert.equal(f.state.activities[0].summary,base.summary);
 f.h.behavior='';f.h.readFailure=false;await saveTextEdit(f.state,edit,'my edit');assert.equal(f.h.row.version,8);assert.equal(f.h.row.data.crmTextEdits.length,1);assert.equal(f.state.activities[0].summary,'my edit');
});
test('changed draft after uncertain attempt stays pending and cannot acknowledge old text or write',async()=>{
 const f=fixture(),edit=await opened(f);f.h.behavior='lost';f.h.readFailure=true;
 await assert.rejects(saveTextEdit(f.state,edit,'old draft'));f.h.readFailure=false;
 await assert.rejects(saveTextEdit(f.state,edit,'new draft'),/앞선 저장 결과/);await assert.rejects(saveTextEdit(f.state,edit,base.summary),/앞선 저장 결과/);assert.equal(f.h.writes.length,1);assert.equal(f.state.activities[0].summary,base.summary);
});
test('same edit ID with different history payload is never treated as accepted',async()=>{
 const f=fixture(),edit=await opened(f);f.h.row={...f.h.row,version:8,data:{...base,crmTextEdits:[{editId:edit.editId,field:'summary',before:'different',after:'other',baseVersion:7}]}};
 await assert.rejects(saveTextEdit(f.state,edit,'mine'),e=>e.code==='conflict');assert.equal(f.state.activities[0].summary,base.summary);
});
test('deleted rows, RLS rejection, missing auth and read-only are failures without local state changes',async()=>{
 for(const behavior of ['deleted','denied','offline','auth','view']){const f=fixture(),edit=await opened(f);if(behavior==='deleted')f.h.row=null;else if(behavior==='auth')f.state.userId=null;else if(behavior==='view')f.state.canWrite=false;else f.h.behavior=behavior;
 await assert.rejects(saveTextEdit(f.state,edit,'new'));assert.equal(f.state.activities[0].summary,base.summary);assert.equal(f.h.applied.length,0);}
});
test('history malformed/count/byte caps fail closed and never prune or write',async()=>{
 for(const history of [{bad:true},[null],Array.from({length:200},(_,i)=>({editId:String(i),field:'summary',before:'x',after:'y'})),[{editId:'old',field:'summary',before:'x'.repeat(1024*1024),after:'y'}]]){
 const f=fixture({...base,crmTextEdits:history}),edit=await opened(f);await assert.rejects(saveTextEdit(f.state,edit,'change'));assert.equal(f.h.writes.length,0);assert.deepEqual(f.h.row.data.crmTextEdits,history);}
});
test('existing revision entries retained and company/task edits change exact original fields in demo only',async()=>{
 const f=fixture({...base,crmTextEdits:[{editId:'old',field:'summary',before:'older',after:base.summary}]}),edit=await opened(f);await saveTextEdit(f.state,edit,'new');assert.equal(f.h.row.data.crmTextEdits[0].editId,'old');assert.equal(f.h.row.data.crmTextEdits.length,2);
 f.state.demo=true;for(const [collection,id,field] of [['companies','c','nextAction'],['tasks','t','title']]){const e=captureTextEdit(f.state,collection,id,field);await saveTextEdit(f.state,e,'  new\nraw ');assert.equal(f.state[collection][0][field],'  new\nraw ');assert.equal(f.state[collection].length,1);}assert.equal(f.h.writes.length,1);
});

test('fresh source change never silently remaps editing to another activity field',async()=>{
 const f=fixture();f.h.row.data.summary='';await assert.rejects(opened(f),/원본이 변경/);assert.equal(f.h.writes.length,0);
});
test('malformed non-text revision and duplicate operation IDs are blocked',async()=>{
 for(const history of [[{editId:'old',field:'summary',before:{secret:'unexpected'},after:'x'}],[{editId:'same',field:'summary',before:'x',after:'y'},{editId:'same',field:'summary',before:'y',after:'z'}]]){
  const f=fixture({...base,crmTextEdits:history}),edit=await opened(f);await assert.rejects(saveTextEdit(f.state,edit,'new'),/이력/);assert.equal(f.h.writes.length,0);
 }
});

test('reconciled latest snapshot hydrates version-ordered cache; delayed older event cannot regress it',async()=>{
 const f=fixture(),edit=await opened(f);f.h.behavior='lost-after-newer';await saveTextEdit(f.state,edit,'mine');
 const putCode=source.slice(source.indexOf('  function put(s, r) {'),source.indexOf('\n  function emit('));
 const put=new Function(putCode+';return put;')(),cache={rows:new Map()};
 put(cache,f.h.applied[0]);put(cache,{path:'activities/a',data:{summary:'stale realtime'},version:8});
 assert.equal(cache.rows.get('activities/a').version,9);assert.equal(cache.rows.get('activities/a').data.summary,'someone later');
});


test('explicit nested report edits preserve summary, equipment, siblings and all metadata',async()=>{
 const reportFields=['purpose','decisionMaker','problem','proposal','reaction','blockers'];
 const report={equipment:[{id:'kept',name:'[가상] 장비',qty:2}],other:{nested:'preserved'},...Object.fromEntries(reportFields.map(field=>[field,'  old '+field+'\n']))};
 for(const key of reportFields){
  const f=fixture({...base,issue:'original issue',report}),field='report.'+key;
  const edit=await loadTextEdit(f.state,'activities','a',field,{directField:true});
  assert.equal(edit.value,report[key]);const value='\n  revised '+key+'\n\t ';
  await saveTextEdit(f.state,edit,value);const saved=f.h.row.data;
  assert.equal(saved.summary,base.summary);assert.equal(saved.issue,'original issue');assert.equal(saved.report[key],value);
  for(const [name,prior] of Object.entries(report))if(name!==key)assert.deepEqual(saved.report[name],prior,name);
  for(const [name,prior] of Object.entries(base))if(name!=='report')assert.deepEqual(saved[name],prior,name);
  assert.equal(saved.crmTextEdits[0].field,field);assert.equal(saved.crmTextEdits[0].before,report[key]);assert.equal(saved.crmTextEdits[0].after,value);
  const follow=await loadTextEdit(f.state,'activities','a',field,{directField:true});await saveTextEdit(f.state,follow,'another '+key);
  assert.equal(f.h.row.data.crmTextEdits.length,2,'new report fields remain valid revision history');
 }
});
test('direct report purpose opts out of source remapping only for its explicit control',async()=>{
 const f=fixture();await assert.rejects(loadTextEdit(f.state,'activities','a','report.purpose'),/원본이 변경/);
 const direct=await loadTextEdit(f.state,'activities','a','report.purpose',{directField:true});
 await saveTextEdit(f.state,direct,'');assert.equal(f.h.row.data.report.purpose,'');assert.equal(f.h.row.data.summary,base.summary);
 f.h.row.data.summary='';f.h.row.data.content='current display';
 await assert.rejects(loadTextEdit(f.state,'activities','a','summary',{directField:true}),/원본이 변경/);
});
test('malformed report containers and arbitrary/prototype paths are rejected before any write',async()=>{
 for(const report of ['do not flatten',42,['do not convert']]){
  const f=fixture({...base,report});await assert.rejects(loadTextEdit(f.state,'activities','a','report.problem',{directField:true}),/보고서 형식/);assert.equal(f.h.writes.length,0);
 }
 const f=fixture();for(const field of ['report.equipment','report.__proto__','report.constructor','report.problem.deep','owner','date']){
  await assert.rejects(loadTextEdit(f.state,'activities','a',field,{directField:true}),/여기서 수정/);
  assert.throws(()=>textPatch({collection:'activities',record:base,field,value:'x'},'y'),/여기서 수정/);
 }assert.equal(f.h.writes.length,0);
});
test('activity issue uses original field and company memo fields preserve unrelated data/history',async()=>{
 const f=fixture({...base,issue:'  issue\n'}),edit=await loadTextEdit(f.state,'activities','a','issue');
 await saveTextEdit(f.state,edit,'  revised issue\n');assert.equal(f.h.row.data.issue,'  revised issue\n');assert.equal(f.h.row.data.summary,base.summary);
 f.state.demo=true;const fields=['nextAction','needs','memo','bizDetail','scale','checkNote'];
 f.state.companies[0]={_id:'c',...Object.fromEntries(fields.map(field=>[field,'old '+field])),name:'[가상] 업체',owner:'keep owner',stage:'keep stage',nextDate:'2026-11-30',equipment:[{keep:true}]};
 for(const field of fields){const before=structuredClone(f.state.companies[0]),e=await loadTextEdit(f.state,'companies','c',field);await saveTextEdit(f.state,e,'\n  new '+field+'\n ');const saved=f.state.companies[0];
  assert.equal(saved[field],'\n  new '+field+'\n ');for(const [key,value] of Object.entries(before))if(![field,'updatedAt','crmTextEdits'].includes(key))assert.deepEqual(saved[key],value,key);
  assert.equal(saved.crmTextEdits.at(-1).field,field);assert.equal(saved.crmTextEdits.at(-1).before,before[field]);
 }assert.equal(f.state.companies[0].crmTextEdits.length,fields.length);assert.equal(f.h.writes.length,1);
});


test('successful result exposes pure server record and version separately from UI identity',async()=>{
 const f=fixture({...base,_id:'actual-server-field',_raw:{historical:'actual-server-field'}}),edit=await opened(f);
 const result=await saveTextEdit(f.state,edit,'revised');assert.equal(result.version,8);assert.deepEqual(result.recordData,f.h.row.data);
 assert.equal(result.recordData._id,'actual-server-field');assert.deepEqual(result.recordData._raw,{historical:'actual-server-field'});assert.equal(f.state.activities[0]._id,'a');
 result.recordData.report.decision='caller mutation';assert.equal(f.h.row.data.report.decision,'keep');assert.equal(f.state.activities[0].report.decision,'keep');
});
test('save completion cannot overwrite newer local snapshot or server metadata',async()=>{
 const f=fixture(),edit=await opened(f),originalDoc=f.state.db.doc;
 f.state.db={doc:path=>{const ref=originalDoc(path);return {...ref,updateIfVersion:async(...args)=>{
  const response=await ref.updateIfVersion(...args);f.state.docVersions['activities/a']=9;f.state.docUpdatedAt={'activities/a':'later-at'};f.state.docUpdatedBy={'activities/a':'later-editor'};
  f.state.activities[0]={...f.state.activities[0],summary:'newer local text'};return response;
 }}}};edit.db=f.state.db;
 const result=await saveTextEdit(f.state,edit,'my text');assert.equal(result.version,8);assert.equal(result.recordData.summary,'my text');assert.equal(result.subsequentlyChanged,true);
 assert.equal(f.state.activities[0].summary,'newer local text');assert.equal(f.state.docVersions['activities/a'],9);assert.equal(f.state.docUpdatedBy['activities/a'],'later-editor');assert.equal(f.state.docUpdatedAt['activities/a'],'later-at');
});

test('CAS verifies actual auth account rather than cached me/history attribution',async()=>{
 for(const mode of ['different','signed-out','error']){const f=fixture(),edit=await opened(f);if(mode==='different')f.h.authId='other';if(mode==='signed-out')f.h.authId=null;if(mode==='error')f.h.authError=true;
  await assert.rejects(()=>saveTextEdit(f.state,edit,'draft'),/로그인 계정/);assert.equal(f.h.writes.length,0);assert.equal(f.h.row.version,7);assert.equal(f.h.me.id,'editor');assert.equal(f.h.listeners,0);
 }
});
test('CAS rejects account change while fresh auth read is pending and unsubscribes',async()=>{
 const f=fixture(),edit=await opened(f);f.h.holdAuth=true;const saving=saveTextEdit(f.state,edit,'draft');
 for(let i=0;i<10&&!f.h.authReads;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(f.h.authReads,1);f.h.switchAuth('other');f.h.releaseAuth();await assert.rejects(()=>saving,/로그인 계정/);assert.equal(f.h.writes.length,0);assert.equal(f.h.listeners,0);
});
test('confirmed CAS and lost-response reconciliation use no extra post-save auth request',async()=>{
 for(const behavior of ['', 'lost']){const f=fixture(),edit=await opened(f);f.h.behavior=behavior;await saveTextEdit(f.state,edit,'draft');assert.equal(f.h.authReads,1);assert.equal(f.h.listeners,0);assert.equal(f.h.row.version,8);}
});

test('CAS abort guard stops account switch during dispatch without applying foreign state',async()=>{
 const f=fixture(),edit=await opened(f);f.h.behavior='switch-before-write';await assert.rejects(()=>saveTextEdit(f.state,edit,'draft'),/로그인 계정/);assert.equal(f.h.row.version,7);assert.equal(f.h.applied.length,0);assert.equal(f.h.listeners,0);
});
