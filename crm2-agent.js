import {buildRuleAgentDraft,matchAgentCompanies,sanitizeAgentDraft} from './crm2-agent-core.mjs?v=20261103-agent-3';
import {sourceHash} from './crm2-intake-core.mjs?v=20261030-intake-1';

export function createSalesAgentUI({state,render,toast,reload,newCompany,openCompany}){
  const ui={transcript:'',draft:null,busy:false,listening:false,recognition:null,result:null,error:'',analysisNotice:''};
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const id=company=>company?._id||company?.id||'';
  const sb=()=>window.dmSupabase;
  const localDateTime=value=>{
    const date=new Date(value||Date.now());if(Number.isNaN(date.getTime()))return '';
    const p=n=>String(n).padStart(2,'0');return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
  };
  const companyOptions=value=>'<option value="">업체를 선택하세요</option>'+state.companies.map(company=>`<option value="${esc(id(company))}" ${value===id(company)?'selected':''}>${esc(company.name)}</option>`).join('');
  const items=(values,empty)=>values?.length?`<ul>${values.map(value=>`<li>${esc(value)}</li>`).join('')}</ul>`:`<p class="small muted">${esc(empty)}</p>`;
  function draftView(){
    const draft=ui.draft;if(!draft)return '';
    const selected=draft.companyId||draft.companyCandidates?.[0]?.id||'';
    return `<section class="panel panel-body agent-review" aria-label="AI 분석 검토">
      <div class="agent-review-head"><div><p class="eyebrow">검토 후에만 저장</p><h2 class="panel-title">CRM 반영 초안</h2></div><span class="pill ${draft.mode==='ai'?'ok':'warning'}">${draft.mode==='ai'?'AI 구조화 분석':'기본 규칙 분석'}</span></div>
      <form id="agentApprovalForm" class="agent-review-form">
        <div class="agent-field-grid">
          <label>업체<select name="companyId" required>${companyOptions(selected)}</select><small>${esc(draft.companyCandidates?.map(candidate=>candidate.name+' · '+candidate.reason).join(', ')||'업체명이 자동으로 확인되지 않았습니다.')}</small><button type="button" class="btn secondary" data-agent="new-company">＋ 신규 업체 등록</button></label>
          <label>활동 일시<input name="occurredAt" type="datetime-local" required value="${esc(localDateTime(draft.occurredAt))}"><small>${esc(draft.dateBasis||'저장 전 확인')}</small></label>
          <label>활동 유형<select name="activityType">${['전화','미팅','첫 미팅','현장 방문','내방','화상','제안·발표'].map(value=>`<option ${value===draft.activityType?'selected':''}>${value}</option>`).join('')}</select></label>
          <label>등록 제목<input name="title" required maxlength="160" value="${esc(draft.title)}"></label>
        </div>
        <label>CRM 활동 요약<textarea name="summary" required maxlength="150000" rows="7">${esc(draft.summary)}</textarea><small>고객이 말한 사실과 내부 판단이 섞이지 않았는지 확인하세요.</small></label>
        <div class="agent-evidence-grid">
          <section><strong>직접 전달된 사실</strong>${items(draft.confirmedFacts,'별도 사실 항목 없음')}</section>
          <section class="agent-unknowns"><strong>확인 필요</strong>${items(draft.unknowns,'추가 확인 항목 없음')}</section>
        </div>
        <div class="agent-stage-note"><span>단계 제안</span><strong>${esc(draft.stageSuggestion||'현재 단계 유지')}</strong><small>참고용이며 업체 단계·금액·계약 상태는 자동 변경하지 않습니다.</small></div>
        <div class="section-label">후속업무 후보</div>
        <div class="agent-task-list">${draft.tasks.length?draft.tasks.map((task,index)=>`<div class="intake-task">
          <label class="intake-check"><input type="checkbox" name="taskUse" value="${index}" ${task.use===false?'':'checked'}> 업무로 등록</label>
          <label>업무<input name="taskTitle${index}" maxlength="180" value="${esc(task.title)}"></label>
          <label>기한<input type="date" name="taskDue${index}" value="${esc(task.dueAt)}"></label>
          <small>근거: ${esc(task.evidence||'입력 내용')}</small>
        </div>`).join(''):'<p class="small muted">명확하게 약속한 후속업무를 찾지 못했습니다. 필요하면 자료 업데이트에서 직접 추가하세요.</p>'}</div>
        ${draft.warnings?.length?`<div class="notice warning">${draft.warnings.map(esc).join('<br>')}</div>`:''}
        <div class="agent-consent"><strong>승인 시 저장되는 내용</strong><span>원문은 개인 검토함에, 승인한 활동·업무만 기존 CRM에 저장됩니다.</span></div>
        <div class="heading-actions"><button type="button" class="btn ghost" data-agent="reanalyze">다시 분석</button><button type="submit" class="btn primary" ${ui.busy?'disabled':''}>${ui.busy?'반영 중…':'승인하고 CRM에 반영'}</button></div>
      </form>
    </section>`;
  }
  function view(){
    if(!state.canWrite)return '<section class="panel panel-body"><h1>AI 영업 Agent</h1><p>영업담당 이상 권한에서 사용할 수 있습니다.</p></section>';
    if(ui.result)return `<div class="page-heading"><div><p class="eyebrow">DMILLION / SALES AGENT</p><h1 class="page-title">CRM 반영 완료</h1><p class="subtitle">승인한 활동과 후속업무가 중앙 DB에 저장되었습니다.</p></div></div>
      <section class="panel panel-body agent-success"><div class="agent-success-mark">✓</div><h2>${esc(ui.result.companyName)} 기록 완료</h2><p>활동 1건 · 후속업무 ${ui.result.taskCount}건을 저장하고 최신 CRM 데이터를 다시 불러왔습니다.</p><div class="heading-actions"><button class="btn secondary" data-agent="company" data-id="${esc(ui.result.companyId)}">업체 상세 보기</button><button class="btn primary" data-agent="reset">새 영업활동 말하기</button></div></section>`;
    const speechSupported=!!(window.SpeechRecognition||window.webkitSpeechRecognition);
    return `<div class="page-heading"><div><p class="eyebrow">DMILLION / SALES AGENT</p><h1 class="page-title">말하면 정리되는 영업 기록</h1><p class="subtitle">핸드폰으로 영업활동을 말하면 업체·활동·후속업무 초안을 만들고, 승인한 내용만 CRM에 반영합니다.</p></div></div>
      <section class="panel panel-body agent-capture">
        <div class="agent-capture-main">
          <button type="button" class="agent-mic ${ui.listening?'listening':''}" data-agent="mic" aria-pressed="${ui.listening}"><span>${ui.listening?'■':'●'}</span><strong>${ui.listening?'듣기 중지':'음성으로 말하기'}</strong><small>${speechSupported?'한국어 음성 인식':'이 브라우저는 음성 인식을 지원하지 않습니다'}</small></button>
          <div class="agent-input-wrap"><label for="agentTranscript">영업활동 내용</label><textarea id="agentTranscript" rows="8" maxlength="12000" placeholder="예: 오늘 케이블루 담당자와 통화했어. 비전검사에 관심이 있고 다음 주에 공고 자료를 보내주기로 했어.">${esc(ui.transcript)}</textarea><div class="agent-input-foot"><span>연락처·주민번호 등 불필요한 개인정보는 입력하지 마세요.</span><span id="agentCount">${ui.transcript.length.toLocaleString('ko-KR')} / 12,000</span></div></div>
        </div>
        ${ui.error?`<p class="notice warning" role="alert">${esc(ui.error)}</p>`:''}
        ${ui.analysisNotice?`<p class="notice">${esc(ui.analysisNotice)}</p>`:''}
        <div class="agent-flow"><span><b>1</b> 말하기</span><i>→</i><span><b>2</b> 초안 확인</span><i>→</i><span><b>3</b> 승인</span><i>→</i><span><b>4</b> CRM 반영</span></div>
        <div class="heading-actions"><button type="button" class="btn secondary" data-agent="new-company">＋ 신규 업체 등록</button><button type="button" class="btn secondary" data-agent="example">예시 넣기</button><button type="button" class="btn primary" data-agent="analyze" ${ui.busy?'disabled':''}>${ui.busy?'분석 중…':'내용 분석하기'}</button></div>
      </section>
      <section class="agent-guardrails"><article><strong>승인 전 저장 안 함</strong><span>분석만으로 운영 DB를 바꾸지 않습니다.</span></article><article><strong>확정과 추정 분리</strong><span>미정 일정과 내부 검토는 확인 항목으로 표시합니다.</span></article><article><strong>핵심 상태 보호</strong><span>단계·금액·계약 상태는 자동 변경하지 않습니다.</span></article></section>
      ${draftView()}`;
  }
  function stopRecognition(){try{ui.recognition?.stop();}catch{}ui.recognition=null;ui.listening=false;}
  function startRecognition(){
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition){toast('Chrome 또는 Edge에서 음성 입력을 이용해 주세요.',true);return;}
    if(ui.listening){stopRecognition();render();return;}
    const recognition=new Recognition();ui.recognition=recognition;ui.listening=true;ui.error='';
    recognition.lang='ko-KR';recognition.continuous=true;recognition.interimResults=true;
    let completed=ui.transcript.trim();
    recognition.onresult=event=>{
      let finalText='',interim='';for(let i=event.resultIndex;i<event.results.length;i++){const value=event.results[i][0]?.transcript||'';if(event.results[i].isFinal)finalText+=value+' ';else interim+=value;}
      if(finalText){completed=[completed,finalText.trim()].filter(Boolean).join(' ').slice(0,12000);ui.transcript=completed;}
      const area=document.getElementById('agentTranscript');if(area)area.value=[ui.transcript,interim].filter(Boolean).join(' ');
      const count=document.getElementById('agentCount');if(count)count.textContent=(area?.value.length||0).toLocaleString('ko-KR')+' / 12,000';
    };
    recognition.onerror=event=>{ui.error=event.error==='not-allowed'?'마이크 권한이 필요합니다. 브라우저 주소창에서 마이크를 허용해 주세요.':'음성을 인식하지 못했습니다. 직접 입력하거나 다시 시도해 주세요.';stopRecognition();render();};
    recognition.onend=()=>{if(ui.listening){ui.listening=false;ui.recognition=null;render();}};
    recognition.start();render();
  }
  async function analyze(){
    const area=document.getElementById('agentTranscript');ui.transcript=String(area?.value||ui.transcript).trim();
    if(ui.transcript.length<5)throw new Error('영업활동 내용을 5자 이상 입력해 주세요.');
    stopRecognition();ui.busy=true;ui.error='';ui.analysisNotice='';render();
    const candidates=matchAgentCompanies(ui.transcript,state.companies),fallback=buildRuleAgentDraft(ui.transcript,{now:new Date(),candidates});
    try{
      if(state.demo){ui.draft=fallback;ui.analysisNotice='데모에서는 외부 AI 호출 없이 기본 규칙으로 분석했습니다.';return;}
      const safeCandidates=candidates.slice(0,5).map(candidate=>({id:candidate.id,name:candidate.name,reason:candidate.reason}));
      const {data,error}=await sb().functions.invoke('crm-agent-extract',{body:{transcript:ui.transcript,companyCandidates:safeCandidates,clientNow:new Date().toISOString()}});
      if(error){let message='AI 분석 서버를 사용할 수 없어 기본 분석으로 전환했습니다.';try{message=(await error.context.json()).error||message;}catch{}ui.analysisNotice=message;ui.draft=fallback;return;}
      ui.draft=sanitizeAgentDraft({...data?.draft,mode:data?.mode==='ai'?'ai':'rules'},fallback);
      ui.draft.companyCandidates=candidates.slice(0,5);ui.analysisNotice=data?.mode==='ai'?'AI가 초안을 만들었습니다. 저장 전 사실과 일정은 반드시 확인하세요.':'AI 키가 설정되지 않아 기본 규칙으로 분석했습니다. 기능은 정상 사용 가능하지만 정리 품질은 제한됩니다.';
    }finally{ui.busy=false;render();}
  }
  async function approve(form){
    const data=new FormData(form),companyId=String(data.get('companyId')||''),company=state.companies.find(item=>id(item)===companyId);
    if(!company)throw new Error('업체를 선택해 주세요.');
    const occurredAt=String(data.get('occurredAt')||''),date=new Date(occurredAt);
    if(Number.isNaN(date.getTime())||date>Date.now()+5*60*1000)throw new Error('완료된 활동의 실제 일시를 확인해 주세요.');
    const title=String(data.get('title')||'').trim(),summary=String(data.get('summary')||'').trim(),activityType=String(data.get('activityType')||'전화');
    if(!title||!summary)throw new Error('등록 제목과 활동 요약을 확인해 주세요.');
    const selected=new Set(data.getAll('taskUse').map(Number)),tasks=(ui.draft?.tasks||[]).flatMap((task,index)=>selected.has(index)?[{
      title:String(data.get('taskTitle'+index)||'').trim(),dueAt:String(data.get('taskDue'+index)||''),evidence:task.evidence
    }]:[]).filter(task=>task.title);
    if(!confirm(`${company.name}에 활동 1건과 후속업무 ${tasks.length}건을 실제 CRM에 반영할까요?\n\n업체 단계·금액·계약 상태는 변경하지 않습니다.`))return;
    ui.busy=true;render();
    try{
      if(state.demo){
        const activityId='agent-demo-'+crypto.randomUUID();state.activities.push({_id:activityId,companyId,date:date.toISOString(),type:activityType,title,summary,status:'완료',source:'crm-agent'});
        tasks.forEach((task,index)=>state.tasks.push({_id:activityId+'-task-'+(index+1),companyId,title:task.title,dueAt:task.dueAt,status:'todo',sourceActivityId:activityId,source:'crm-agent'}));
      }else{
        const key='agent:'+await sourceHash([companyId,date.toISOString(),ui.transcript].join('|'));
        let {data:existing,error:findError}=await sb().from('crm_intake_sources').select('id,status,result').eq('source_key',key).maybeSingle();if(findError)throw findError;
        if(existing?.status==='approved')throw new Error('이미 CRM에 반영한 영업활동입니다.');
        let sourceId=existing?.id;
        if(!sourceId){
          sourceId=crypto.randomUUID();const source={id:sourceId,owner_id:state.userId,source_key:key,source_type:'meeting',title,body:ui.transcript,occurred_at:date.toISOString(),company_id:companyId,
            metadata:{captureMode:'voice-or-text',collector:'crm-agent',analysisMode:ui.draft?.mode||'rules',confirmedFacts:ui.draft?.confirmedFacts||[],unknowns:ui.draft?.unknowns||[],stageSuggestion:ui.draft?.stageSuggestion||'현재 단계 유지'},status:'pending'};
          const {error}=await sb().from('crm_intake_sources').insert(source);if(error)throw error;
        }
        const {error}=await sb().rpc('crm_intake_approve',{p_id:sourceId,p_company:companyId,p_record:{title,summary,date:date.toISOString(),type:activityType},p_tasks:tasks.map(({title,dueAt})=>({title,dueAt})),p_document:null});if(error)throw error;
        await reload();
      }
      ui.result={companyId,companyName:company.name,taskCount:tasks.length};ui.draft=null;ui.transcript='';toast('승인한 영업활동을 CRM에 반영했습니다.');
    }finally{ui.busy=false;render();}
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-agent]');if(!button||!state.canWrite)return;
    const action=button.dataset.agent;button.disabled=true;
    try{
      if(action==='mic')startRecognition();
      else if(action==='example'){ui.transcript='오늘 케이블루 담당자와 통화했어. 비전검사에 관심은 있는데 예산이 부족하대. 내년에 스마트공장 지원사업으로 추진하고 싶다고 했고, 다음 주에 내가 공고 자료를 보내주기로 했어.';ui.draft=null;render();}
      else if(action==='analyze'||action==='reanalyze')await analyze();
      else if(action==='reset'){ui.result=null;ui.draft=null;ui.transcript='';ui.error='';ui.analysisNotice='';render();}
      else if(action==='company')openCompany(button.dataset.id,false);
      else if(action==='new-company'){
        stopRecognition();
        ui.transcript=document.getElementById('agentTranscript')?.value||ui.transcript;
        const form=document.getElementById('agentApprovalForm');
        if(form&&ui.draft){const values=new FormData(form),selectedTasks=new Set(values.getAll('taskUse').map(Number));ui.draft={...ui.draft,companyId:String(values.get('companyId')||''),title:String(values.get('title')||''),summary:String(values.get('summary')||''),occurredAt:String(values.get('occurredAt')||''),activityType:String(values.get('activityType')||'전화')};ui.draft.tasks=ui.draft.tasks.map((task,i)=>({...task,use:selectedTasks.has(i),title:String(values.get('taskTitle'+i)||task.title),dueAt:String(values.get('taskDue'+i)||'')}));}
        newCompany(company=>{if(ui.draft){ui.draft.companyId=id(company);ui.draft.unknowns=ui.draft.unknowns.filter(x=>x!=='업체를 직접 선택해야 합니다.');ui.draft.companyCandidates=[{id:id(company),name:company.name,reason:'직접 신규 등록'}];}ui.analysisNotice=`${company.name} 업체를 등록했습니다. 활동 기록은 확인 후 별도로 승인해 주세요.`;});
      }
    }catch(error){ui.error=error.message||'요청을 완료하지 못했습니다.';toast(ui.error,true);render();}finally{button.disabled=false;}
  });
  document.addEventListener('input',event=>{
    if(event.target.id!=='agentTranscript')return;ui.transcript=event.target.value.slice(0,12000);const count=document.getElementById('agentCount');if(count)count.textContent=ui.transcript.length.toLocaleString('ko-KR')+' / 12,000';
  });
  document.addEventListener('submit',async event=>{
    if(event.target.id!=='agentApprovalForm')return;event.preventDefault();
    try{await approve(event.target);}catch(error){ui.error=error.message||'CRM 반영을 완료하지 못했습니다.';toast(ui.error,true);render();}
  });
  return {render:view,stop:stopRecognition};
}
