import {sourceHash,sourcePreview,documentKind,stripEmailHtml} from './crm2-intake-core.mjs?v=20261030-intake-1';

export function createIntakeUI({state,render,toast,showModal,reload}){
 const ui={sources:[],demoSources:[],counts:{pending:0,approved:0,ignored:0},filter:'pending',connection:null,error:'',busy:false,loaded:false,more:false};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const id=c=>c._id||c.id, sb=()=>window.dmSupabase;
 const labels={email:'메일',meeting:'미팅 메모',document:'문서'},statusLabels={pending:'검토 대기',approved:'등록 완료',ignored:'제외'};
 const localDate=value=>{const d=new Date(value||Date.now());if(Number.isNaN(d.getTime()))return '';const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;};
 const time=value=>value?new Intl.DateTimeFormat('ko-KR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'미확인';
 const companyOptions=value=>'<option value="">업체를 확인해 선택하세요</option>'+state.companies.map(c=>`<option value="${esc(id(c))}" ${value===id(c)?'selected':''}>${esc(c.name)}</option>`).join('');
 async function mail(action,data={}){
  const {data:result,error}=await sb().functions.invoke('crm-mail-sync',{body:{action,...data}});
  if(error){let message='메일 연결 요청을 완료하지 못했습니다.';try{message=(await error.context.json()).error||message;}catch{}throw new Error(message);}
  if(result?.error)throw new Error(result.error);return result;
 }
 async function load(append=false){
  if(!state.canWrite)return;
  ui.busy=true;ui.error='';
  try{
   if(state.demo){ui.sources=ui.demoSources.filter(s=>s.status===ui.filter);for(const k of Object.keys(ui.counts))ui.counts[k]=ui.demoSources.filter(s=>s.status===k).length;ui.loaded=true;return;}
   const offset=append?ui.sources.length:0;
   const request=sb().from('crm_intake_sources').select('id,owner_id,source_key,source_type,title,occurred_at,company_id,metadata,status,result,created_at').eq('status',ui.filter).order('created_at',{ascending:false}).range(offset,offset+99);
   const results=await Promise.all([request,...['pending','approved','ignored'].map(status=>sb().from('crm_intake_sources').select('id',{head:true,count:'exact'}).eq('status',status)),mail('status')]);
   for(const r of results.slice(0,4))if(r.error)throw r.error;
   ui.sources=append?[...ui.sources,...results[0].data]:results[0].data;ui.more=results[0].data.length===100;
   ['pending','approved','ignored'].forEach((k,i)=>ui.counts[k]=results[i+1].count||0);
   ui.connection=results[4].connection;ui.loaded=true;
  }catch(error){ui.error='자료를 불러오지 못했습니다. '+(error.message||'잠시 후 다시 시도하세요.');}
  finally{ui.busy=false;}
 }
 function view(){
  if(!state.canWrite)return '<section class="panel panel-body"><h1>자료 업데이트</h1><p>메일 원문과 새 자료는 영업담당 이상 권한에서 확인할 수 있습니다.</p></section>';
  const c=ui.connection;
  return `<div class="page-heading"><div><p class="eyebrow">DMILLION / SALES CRM</p><h1 class="page-title">자료 업데이트</h1><p class="subtitle">메일·미팅 메모·문서를 업체별로 정리하고 확인한 내용만 CRM에 등록합니다.</p></div>
    <div class="heading-actions"><button class="btn primary" data-intake="new">＋ 자료 추가</button><button class="btn secondary" data-intake="refresh">새로고침</button></div></div>
   <section class="panel panel-body intake-connection"><div><h2 class="panel-title">다음메일 자동 수집 ${c?.enabled?'<span class="pill ok">연결됨</span>':'<span class="pill outline">연결 필요</span>'}</h2>
     <p>${c?.enabled?`${esc(c.email)} · 30분마다 수집 · 마지막 완료 ${esc(time(c.lastSync))}`:'메일 계정을 한 번 연결하면 최근 7일부터 받은메일·보낸메일을 확인합니다.'}</p>
     <p class="small muted">등록된 고객 연락처와 일치하는 메일을 개인 검토함에 모읍니다. 메일을 보내거나 읽음 상태를 바꾸지 않습니다.</p>
     ${c?.lastError?`<p class="coverage-alert">${esc(c.lastError)}</p>`:''}</div>
     <div class="heading-actions">${c?.enabled?'<button class="btn secondary" data-intake="sync">지금 수집</button><button class="btn secondary" data-intake="disconnect">수집 중지</button>':'<button class="btn secondary" data-intake="connect">다음메일 연결</button>'}</div></section>
   ${state.demo?'<p class="notice">데모: 서버 저장과 실제 메일 수집 없이 자료 정리·등록 흐름을 체험할 수 있습니다.</p>':''}
   ${ui.error?`<p class="notice warning" role="alert">${esc(ui.error)}</p>`:''}
   <div class="filter-chips intake-tabs">${Object.entries(statusLabels).map(([key,label])=>`<button type="button" data-intake="filter" data-value="${key}" class="${ui.filter===key?'active':''}">${label} ${ui.counts[key]}</button>`).join('')}</div>
   <section class="panel"><div class="panel-head"><h2 class="panel-title">${statusLabels[ui.filter]}</h2><span class="small muted">${ui.busy?'불러오는 중…':`${ui.sources.length}건 표시`}</span></div>
    <div class="table-scroll"><table class="table intake-table"><thead><tr><th>종류 · 일시</th><th>자료</th><th>연결 업체</th><th>처리</th></tr></thead><tbody>
    ${ui.sources.map(s=>`<tr><td>${labels[s.source_type]}<div class="coverage-sub">${esc(time(s.occurred_at||s.created_at))}</div></td><td><strong>${esc(s.title)}</strong><div class="coverage-sub">${esc(s.metadata?.direction==='sent'?'보낸 메일':s.metadata?.direction==='received'?'받은 메일':s.metadata?.documentKind||'')}${s.metadata?.attachments?.length?` · 첨부 ${s.metadata.attachments.length}개 (원문에서 확인)`:''}${s.metadata?.bodyTruncated?' · 본문 일부만 수집':''}</div></td>
    <td>${esc(state.companies.find(c=>id(c)===s.company_id)?.name||'업체 확인 필요')}</td>
    <td><div class="intake-row-actions"><button class="btn secondary" data-intake="review" data-id="${esc(s.id)}">${s.status==='pending'?'검토·등록':'원문 보기'}</button>${s.metadata?.objectPath?`<button class="btn secondary" data-intake="file" data-id="${esc(s.id)}">원본 파일</button>`:''}${s.status==='pending'?`<button class="btn ghost" data-intake="ignore" data-id="${esc(s.id)}">제외</button>`:s.status==='ignored'?`<button class="btn ghost" data-intake="restore" data-id="${esc(s.id)}">재검토</button>`:''}</div></td></tr>`).join('')||'<tr><td colspan="4"><div class="empty-state"><strong>아직 자료가 없습니다.</strong><p>다음메일을 연결하거나 미팅 메모·문서를 추가하세요.</p></div></td></tr>'}
    </tbody></table></div>${ui.more?'<div class="panel-body"><button class="btn secondary" data-intake="more">100개 더 보기</button></div>':''}</section>
   <p class="intake-footnote">원문은 본인 검토함에 보관됩니다. CRM에 등록한 정리본·업무·업체 문서는 기존 영업관리 권한으로 공유됩니다. 업체 단계·금액·계약 상태는 자동 변경하지 않습니다.</p>`;
 }
 async function addModal(){
  showModal('자료 추가','미팅 메모를 붙여 넣거나 문서를 첨부하세요. 저장 후 업체 연결과 후속업무를 검토할 수 있습니다.',
   `<label>자료 종류<select name="sourceType"><option value="meeting">미팅 메모</option><option value="email">메일 원문</option><option value="document">문서</option></select></label>
    <label>연결 업체 (선택)<select name="companyId">${companyOptions('')}</select></label>
    <label>제목<input name="title" maxlength="300" placeholder="예: 가온정밀 자동화 미팅"></label>
    <label>자료 일시 (미확정이면 비워 두세요)<input name="occurredAt" type="datetime-local"></label>
    <label>파일 (선택, 최대 20MB)<input name="file" type="file"><small>EML·TXT·PDF·DOCX 본문을 읽습니다. 스캔 문서나 그 외 파일은 원본을 보관하고 제목으로 분류합니다.</small></label>
    <label>메모·본문<textarea name="body" rows="7" maxlength="140000" placeholder="후속업무는 '할 일: 제안서 송부'처럼 적으면 후보로 추출됩니다."></textarea></label>`,async fd=>{
     let sourceType=String(fd.get('sourceType')),title=String(fd.get('title')||'').trim(),body=String(fd.get('body')||'').trim();
     const file=fd.get('file');const hasFile=file&&file.size>0;
     if(hasFile&&file.size>20*1024*1024)throw new Error('파일은 20MB 이하로 올려 주세요.');
     let occurred=String(fd.get('occurredAt')||''),metadata={},fileText='';
     if(hasFile){
      title=title||file.name;metadata={fileName:file.name,mimeType:file.type,size:file.size,documentKind:documentKind(file.name)};
      const ext=file.name.split('.').pop().toLowerCase();
      if(ext==='eml'){
       const {default:PostalMime}=await import('https://cdn.jsdelivr.net/npm/postal-mime@4.2.0/dist/esm/postal-mime.js');
       const parsed=await PostalMime.parse(await file.arrayBuffer());sourceType='email';title=String(fd.get('title')||parsed.subject||file.name).slice(0,300);
       fileText=parsed.text||stripEmailHtml(parsed.html);occurred=occurred||parsed.date||'';
       metadata={...metadata,from:parsed.from?.address||'',to:(parsed.to||[]).flatMap(x=>x.group||[x]).map(x=>x.address).filter(Boolean).join(', '),messageId:parsed.messageId||'',attachments:(parsed.attachments||[]).map(x=>({name:x.filename||'첨부',mimeType:x.mimeType}))};
      }else if(['txt','md','csv'].includes(ext))fileText=await file.text();
      else if(ext==='pdf'){
       const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
       pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
       const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
       try{const pages=[];for(let i=1;i<=Math.min(pdf.numPages,30);i++){const page=await pdf.getPage(i);const content=await page.getTextContent();pages.push(content.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join(''));}fileText=pages.join('\n\n');metadata.bodyTruncated=pdf.numPages>30;}finally{await pdf.destroy();}
      }else if(ext==='docx'){
       if(!window.mammoth)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';script.onload=resolve;script.onerror=reject;document.head.append(script);});
       fileText=(await window.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()})).value;
      }
     }
     body=[body,fileText].filter(Boolean).join('\n\n');metadata.bodyTruncated=!!metadata.bodyTruncated||body.length>150000;body=body.slice(0,150000);
     if(!title||(!body&&!hasFile))throw new Error('제목과 메모 또는 파일을 입력하세요.');
     let occurredAt=null;if(occurred){const date=new Date(occurred);if(!Number.isFinite(date.getTime()))throw new Error('자료 일시를 확인하세요.');occurredAt=date.toISOString();}
     let hashInput=sourceType+'|'+title+'|'+body+'|'+(occurredAt||'');
     if(hasFile)hashInput=await sourceHash(await file.arrayBuffer());
     const hash=await sourceHash(metadata.messageId?'email|'+metadata.messageId:hashInput);
     const sourceKey=(metadata.messageId?'mail:':'manual:')+hash;
     if(state.demo&&ui.demoSources.some(s=>s.source_key===sourceKey))return {message:'이미 추가한 자료입니다.'};
     if(!state.demo){const {data,error}=await sb().from('crm_intake_sources').select('id').eq('source_key',sourceKey).maybeSingle();if(error)throw error;if(data)return {message:'이미 추가한 자료입니다.'};}
     const source={id:crypto.randomUUID(),owner_id:state.userId,source_key:sourceKey,source_type:sourceType,title,body,occurred_at:occurredAt,
       company_id:String(fd.get('companyId')||'')||null,metadata,status:'pending',created_at:new Date().toISOString()};
     const preview=sourcePreview(source,state.companies,state.contacts);source.company_id=source.company_id||preview.companyId||null;
     if(hasFile&&!state.demo){const path=state.userId+'/'+source.id+'/'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const {error}=await sb().storage.from('crm-intake').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});if(error)throw error;source.metadata.objectPath=path;}
     if(state.demo){ui.demoSources.unshift(source);ui.filter='pending';await load();}
     else{const {error}=await sb().from('crm_intake_sources').insert(source);if(error)throw error;ui.filter='pending';await load();}
     return {message:'검토함에 추가했습니다. 검토·등록에서 업체와 업무를 확인하세요.'};
   });
 }
 async function review(sourceId){
  let source=ui.sources.find(s=>s.id===sourceId);if(!source)return;
  if(!state.demo){const {data,error}=await sb().from('crm_intake_sources').select('*').eq('id',sourceId).single();if(error)throw error;source=data;}
  if(source.status!=='pending'){
   showModal(source.title,'원문과 등록 결과를 확인합니다.',`<label>원문<textarea readonly rows="12">${esc(source.body)}</textarea></label><p>${esc(statusLabels[source.status])}</p>`,async()=>({message:'확인했습니다.'}));return;
  }
  const preview=sourcePreview(source,state.companies,state.contacts),summary=String(source.body||'');
  const taskFields=preview.tasks.map((t,i)=>`<div class="intake-task"><label class="intake-check"><input type="checkbox" name="taskUse" value="${i}"> 업무로 등록</label><label>업무<input name="taskTitle${i}" maxlength="180" value="${esc(t.title)}"></label><label>기한<input type="date" name="taskDue${i}" value="${esc(t.dueAt)}"></label><small>근거: ${esc(t.evidence)}</small></div>`).join('');
  showModal('자료 검토·CRM 등록','저장하면 아래 본문과 선택한 업무가 CRM에 공유됩니다. 공유하지 않을 연락처·기밀정보는 본문에서 지워 주세요. 원문은 개인 검토함에 남습니다.',
   `<details><summary>원문 확인</summary><label>자료 원문<textarea readonly rows="10">${esc(source.body)}</textarea></label></details>
    <label>업체<select name="companyId" required>${companyOptions(preview.companyId)}</select><small>${esc(preview.candidates.map(c=>c.name+' ('+c.reason+')').join(', ')||'등록 업체 중 직접 선택해 주세요.')}</small></label>
    <label>등록 제목<input name="title" required maxlength="160" value="${esc(source.title.slice(0,160))}"></label>
    <label>실제 자료·미팅 일시<input name="date" type="datetime-local" required value="${esc(source.occurred_at?localDate(source.occurred_at):'')}"></label>
    ${source.source_type==='meeting'?'<label>미팅 유형<select name="meetingType"><option>미팅</option><option>첫 미팅</option><option>현장 방문</option><option>내방</option><option>화상</option><option>제안·발표</option></select></label>':''}
    ${source.metadata?.bodyTruncated?'<p class="notice warning" role="alert">수집 용량 제한으로 원문 일부만 보관된 자료입니다. 메일은 다음메일에서, 문서는 원본 파일에서 전체 내용을 확인하세요.</p>':''}
    <label>CRM에 등록할 본문<textarea class="intake-review-body" name="summary" required maxlength="150000" rows="12">${esc(summary)}</textarea><small>수집된 본문 전체를 불러왔습니다 (${summary.length.toLocaleString('ko-KR')}자). 아래로 스크롤하면 끝까지 확인할 수 있습니다. 필요한 내용을 수정한 뒤 저장하세요.</small></label>
    ${source.source_type==='document'&&source.metadata?.objectPath?`<label class="intake-check"><input type="checkbox" name="linkFile"> 원본을 기존 업체 문서함에도 등록 (${esc(preview.kind)})</label><small>선택하면 원본 파일이 기존 문서함 권한으로 공유됩니다.</small>`:''}
    <div class="section-label">후속업무 후보 · 확인한 항목만 체크</div>${taskFields||'<p class="small muted">명시된 업무 항목이 없습니다. 아래에 직접 입력할 수 있습니다.</p>'}
    <label>추가 업무 (한 줄에 하나)<textarea name="extraTasks" rows="3" placeholder="예: 샘플 수령 확인"></textarea></label>
    <label>추가 업무 공통 기한 (선택)<input type="date" name="extraDue"></label>`,async fd=>{
     const companyId=String(fd.get('companyId')||'');if(!state.companies.some(c=>id(c)===companyId))throw new Error('등록 업체를 선택하세요.');
     const date=new Date(String(fd.get('date')));if(!Number.isFinite(date.getTime())||date.getTime()>Date.now()+300000)throw new Error('실제 완료된 자료·미팅 일시를 입력하세요.');
     const record={title:String(fd.get('title')).trim(),summary:String(fd.get('summary')).trim(),date:date.toISOString(),type:source.source_type==='email'?'메일':source.source_type==='document'?'자료 등록':String(fd.get('meetingType'))};
     if(!record.summary||record.summary.length>150000)throw new Error('등록할 본문을 15만 자 이내로 입력하세요.');
     const tasks=fd.getAll('taskUse').map(i=>({title:String(fd.get('taskTitle'+i)).trim(),dueAt:String(fd.get('taskDue'+i)||'')||null}));
     for(const title of String(fd.get('extraTasks')||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean))tasks.push({title,dueAt:String(fd.get('extraDue')||'')||null});
     if(tasks.length>20||tasks.some(t=>!t.title||t.title.length>180))throw new Error('후속업무는 20개 이내, 각 180자 이내로 입력하세요.');
     if(state.demo){
      const aId='intake-'+source.id;state.activities.push({_id:aId,companyId,...record,status:'완료',source:'crm-intake'});
      tasks.forEach((t,i)=>state.tasks.push({_id:aId+'-'+i,companyId,...t,status:'todo',sourceActivityId:aId}));
      source.status='approved';await load();
     }else{
      let document=null;
      if(fd.get('linkFile')==='on'&&source.metadata?.objectPath){
       const {data:blob,error:downloadError}=await sb().storage.from('crm-intake').download(source.metadata.objectPath);if(downloadError)throw downloadError;
       const ext=source.metadata.fileName.match(/\.[a-z0-9]{1,8}$/i)?.[0]||'';const target='intake-'+source.id+ext;
       const {error:uploadError}=await sb().storage.from('files').upload(target,blob,{contentType:source.metadata.mimeType||'application/octet-stream',upsert:false});
       if(uploadError&&String(uploadError.statusCode)!=='409')throw uploadError;
       document={id:target,name:source.metadata.fileName,kind:preview.kind,size:source.metadata.size};
      }
      const {error}=await sb().rpc('crm_intake_approve',{p_id:source.id,p_company:companyId,p_record:record,p_tasks:tasks,p_document:document});if(error)throw error;
      await reload();await load();
     }
     return {message:'업체 이력과 후속업무를 등록했습니다. 고객 관리 현황에도 반영됩니다.'};
   });
 }
 function connect(){
  if(state.demo)return toast('데모에서는 실제 메일 계정을 연결하지 않습니다.');
  showModal('다음메일 연결','본인 메일 주소와 앱 비밀번호를 입력하세요. 연결 정보는 서버의 암호화 저장소에 보관됩니다.',
   `<label>메일 주소<input type="email" name="email" required autocomplete="email"></label>
    <label>IMAP 로그인 ID<input name="login" placeholder="비워 두면 메일 주소 사용"><small>스마트워크 등에서 별도 Daum ID를 쓰면 입력하세요.</small></label>
    <label>앱 비밀번호<input type="password" name="password" required autocomplete="off"><small>평소 로그인 비밀번호가 아닌 IMAP용 앱 비밀번호입니다.</small></label>
    <p class="small">연결 후 30분마다 최근 7일부터 받은메일·보낸메일을 확인하고, 등록 고객 연락처와 일치하는 메일을 개인 검토함에 보관합니다. 미등록 연락처의 메일은 자동 수집에서 제외됩니다.</p>
    <p class="small"><a target="_blank" rel="noopener" href="https://mail.daum.net/setting/POP3IMAP">다음메일 IMAP 설정 열기</a> · <a target="_blank" rel="noopener" href="https://hanmail-notice.daum.net/list/907">앱 비밀번호 안내</a></p>`,async fd=>{
      await mail('connect',{email:String(fd.get('email')).trim(),login:String(fd.get('login')).trim(),password:String(fd.get('password'))});await load();return {message:'연결했습니다. 지금 수집을 누르면 첫 자료를 가져옵니다.'};
    });
 }
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-intake]');if(!button||!state.canWrite)return;
  const action=button.dataset.intake;button.disabled=true;
  try{
   if(action==='new')await addModal();else if(action==='review')await review(button.dataset.id);else if(action==='connect')connect();
   else if(action==='filter'){ui.filter=button.dataset.value;await load();render();}
   else if(action==='refresh'||action==='more'){await load(action==='more');render();}
   else if(action==='ignore'||action==='restore'){
    const status=action==='ignore'?'ignored':'pending';
    if(state.demo){const s=ui.demoSources.find(s=>s.id===button.dataset.id);if(s)s.status=status;}
    else{const {error}=await sb().from('crm_intake_sources').update({status,updated_at:new Date().toISOString()}).eq('id',button.dataset.id).eq('status',action==='ignore'?'pending':'ignored');if(error)throw error;}
    await load();render();
   }else if(action==='file'){
    const s=ui.sources.find(s=>s.id===button.dataset.id);if(!s?.metadata?.objectPath)return;
    const opened=window.open('about:blank','_blank');
    const {data,error}=await sb().storage.from('crm-intake').createSignedUrl(s.metadata.objectPath,120);
    if(error){opened?.close();throw error;}if(opened)opened.location.href=data.signedUrl;else toast('팝업을 허용한 뒤 원본 파일을 다시 눌러 주세요.',true);
   }
   else if(action==='sync'){
    if(state.demo)toast('데모: 실제 메일 수집은 운영 화면에서 연결 후 사용할 수 있습니다.');
    else{toast('메일을 확인하고 있습니다…');const result=await mail('sync');await load();render();const errors=result.results?.map(r=>r.error).filter(Boolean)||[];toast(errors.length?errors.join(' '):`새 자료 ${result.results?.reduce((n,r)=>n+r.count,0)||0}건을 검토함에 추가했습니다.`,!!errors.length);}
   }else if(action==='disconnect'){
    await mail('disconnect');await load();render();toast('자동 수집을 중지했습니다. 기존 자료는 보관됩니다.');
   }
  }catch(error){toast(error.message||'요청을 완료하지 못했습니다.',true);}finally{button.disabled=false;}
 });
 document.addEventListener('change',event=>{
  if(!event.target.matches('#dialogForm input[name="file"]'))return;
  const file=event.target.files?.[0],form=event.target.form;if(!file||!form)return;
  form.elements.sourceType.value=/\.eml$/i.test(file.name)?'email':'document';
  if(!form.elements.title.value)form.elements.title.value=file.name;
 });
 setInterval(()=>{
  if(state.screen!=='intake'||state.demo||!state.canWrite||ui.busy||document.visibilityState!=='visible'||!document.getElementById('modalLayer')?.classList.contains('hidden'))return;
  load().then(()=>{if(state.screen==='intake')render();});
 },60000);
 return {render:view,load};
}
