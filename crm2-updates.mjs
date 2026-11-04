import {seoulDay} from './crm2-calendar.mjs?v=20261104-calendar-1';
import {PROGRESS_STAGES} from './crm2-timeline.mjs?v=20261104-records-1';

const text=v=>String(v??'').trim();
const esc=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id=x=>text(x._id||x.id);
const cleanStatus=x=>text(x.status).toLowerCase();
const deleted=x=>['deleted','삭제','삭제됨'].includes(cleanStatus(x));
const closedTask=x=>deleted(x)||['done','completed','cancelled','canceled','완료','취소','취소됨'].includes(cleanStatus(x));
const validStamp=value=>{const s=text(value);if(!s)return null;const day=s.slice(0,10),dayTime=Date.parse(day+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(dayTime)||new Date(dayTime).toISOString().slice(0,10)!==day)return null;const n=Date.parse(s.length===10?s+'T00:00:00+09:00':s);return Number.isFinite(n)?n:null;};
const stampFor=(state,path,row,extra=[])=>[state.docUpdatedAt?.[path],row.updatedAt,row.createdAt,...extra].map(validStamp).filter(x=>x!==null).sort((a,b)=>b-a)[0]??null;
const typedLabel={mail:'메일 기록',activity:'활동 기록',task:'후속업무',opportunity:'제안·견적',project:'수행 과제',info:'업체 정보'};
const priority={mail:0,activity:1,task:2,opportunity:3,project:4,info:5};
export function buildRecentUpdates(state,{period='week',type='all',limit=8,now=new Date()}={}){
  const today=seoulDay(now),sinceDate=new Date(today+'T00:00:00+09:00');
  if(period==='week')sinceDate.setUTCDate(sinceDate.getUTCDate()-6);
  else if(period==='month')sinceDate.setUTCDate(sinceDate.getUTCDate()-29);
  const since=period==='all'?-Infinity:sinceDate.getTime(),until=Number(now)+300000;
  const companies=new Map((state.companies||[]).map(c=>[id(c),c])),events=[];
  function add(companyId,path,row,kind,title,summary,tab,{extra=[],fallback='',nextAction=''}={}){
    if(!companies.has(companyId)||deleted(row))return;
    let at=stampFor(state,path,row,extra),basis='recorded';
    if(at===null){at=validStamp(fallback);basis='activity';}
    if(at===null||at<since||at>until||type!=='all'&&kind!==type&&!(type==='activity'&&kind==='mail'))return;
    events.push({companyId,path,recordId:id(row),kind,title:text(title),summary:text(summary),tab,at,basis,nextAction:text(nextAction),activityDate:text(row.date||row.datetime),status:text(row.status)});
  }
  for(const a of state.activities||[]){
    const mail=/메일|이메일|email/i.test(a.type||'');
    add(a.companyId,'activities/'+id(a),a,mail?'mail':'activity',a.title||a.type||'활동 기록',a.summary||a.report?.purpose||a.purpose,'activities',{fallback:a.date||a.datetime,nextAction:a.nextAction});
  }
  for(const t of state.tasks||[])add(t.companyId,'tasks/'+id(t),t,'task',t.title||'후속업무',closedTask(t)?'후속업무 처리 상태가 변경되었습니다.':'진행할 후속업무가 등록·수정되었습니다.','tasks',{extra:[t.completedAt,t.doneAt]});
  for(const o of state.opportunities||[])add(o.companyId,'opportunities/'+id(o),o,'opportunity',o.title||'제안·견적',o.solution||o.solutionTags?.join(', ')||'제안·견적 기록이 등록·수정되었습니다.','opportunities',{extra:(o.stageHistory||[]).map(h=>h.at)});
  for(const p of state.projects||[])for(const companyId of p.companyIds||[])add(companyId,'projects/'+id(p),p,'project',p.name||p.title||'수행 과제',p.stageNote||'연결된 과제의 일정·아젠다가 업데이트되었습니다.','projects');
  for(const c of companies.values()){
    add(id(c),'companies/'+id(c),c,'info','업체 정보 업데이트','업체 기본정보가 등록·수정되었습니다.','overview');
    const profile=state.profiles?.[id(c)];
    if(profile)add(id(c),'crm2Profiles/'+id(c),{...profile,_id:id(c)},'info','진행 현황·관리 정보 업데이트','업체 진행 현황 또는 관리 정보가 수정되었습니다.','progress');
    const contact=state.contacts?.[id(c)];
    if(contact)add(id(c),'data/contacts/items/'+id(c),{...contact,_id:id(c)},'info','고객 연락처 업데이트','고객 담당자·연락처 정보가 수정되었습니다.','overview');
  }
  events.sort((a,b)=>b.at-a.at||priority[a.kind]-priority[b.kind]||a.path.localeCompare(b.path));
  const grouped=new Map();
  for(const e of events){if(!grouped.has(e.companyId))grouped.set(e.companyId,[]);grouped.get(e.companyId).push(e);}
  const allCards=[...grouped].map(([companyId,changes])=>{
    const company=companies.get(companyId),activeTasks=(state.tasks||[]).filter(t=>t.companyId===companyId&&!closedTask(t)).sort((a,b)=>text(a.dueAt||'9999').localeCompare(text(b.dueAt||'9999')));
    const latestAction=changes.find(e=>e.nextAction),nextAction=latestAction?.nextAction||activeTasks[0]?.title||company.nextAction||'';
    const year=today.slice(0,4),saved=state.profiles?.[companyId]?.yearProgress?.[year]?.stage,stageLabel=Object.fromEntries(PROGRESS_STAGES)[saved];
    return {companyId,companyName:company.name||'업체명 미등록',stage:stageLabel||company.stage||'단계 미정',stageYear:stageLabel?year:'',owner:company.owner||'담당 미지정',latest:changes[0],changes,nextAction:text(nextAction),activeTaskCount:activeTasks.length,
      followup:activeTasks.length?'업무 진행 중':nextAction?'다음 행동 있음':'후속 확인'};
  });
  return {cards:allCards.slice(0,Math.max(1,limit)),totalCompanies:allCards.length,totalChanges:events.length,hasMore:allCards.length>limit};
}
function updateTime(event){
  const time=event.basis==='recorded'?{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}:{};
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',...time}).format(new Date(event.at));
}
export function renderRecentUpdates(state,options={}){
  const {period='week',type='all'}=options,model=buildRecentUpdates(state,options);
  const selected=(a,b)=>a===b?' selected':'';
  return `<section class="crm-recent panel" aria-label="최근 영업 업데이트"><div class="panel-head"><div><h2 class="panel-title">최근 영업 업데이트</h2><p class="panel-subtitle">${model.totalCompanies}개 업체 · ${model.totalChanges}개 기록 변경 · 최근 반영 순</p></div><div class="crm-recent-filters"><label>기간<select id="recent-period" aria-label="최근 업데이트 기간">${[['today','오늘'],['week','최근 7일'],['month','최근 30일'],['all','전체 기간']].map(([v,l])=>`<option value="${v}"${selected(v,period)}>${l}</option>`).join('')}</select></label><label>업데이트 종류<select id="recent-type" aria-label="업데이트 종류">${[['all','전체'],['mail','메일'],['activity','전체 활동'],['task','후속업무'],['opportunity','제안·견적'],['project','수행 과제'],['info','업체 정보']].map(([v,l])=>`<option value="${v}"${selected(v,type)}>${l}</option>`).join('')}</select></label></div></div>
    <div class="panel-body"><div class="crm-recent-grid">${model.cards.map(c=>{
      const e=c.latest,recorded=e.basis==='recorded',kind=typedLabel[e.kind],preview=c.changes.slice(1,3);
      return `<article class="crm-recent-card" data-recent-company="${esc(c.companyId)}"><div class="crm-recent-card-top"><span class="crm-recent-kind ${esc(e.kind)}">${esc(kind)}</span><span class="crm-recent-work">${esc(c.followup)}</span></div>
        <h3>${esc(c.companyName)}</h3><div class="crm-recent-meta">${c.stageYear?esc(c.stageYear)+'년 ':''}영업 단계: ${esc(c.stage)} · ${esc(c.owner)}</div><div class="crm-recent-time">${recorded?'CRM 반영':'활동 날짜'} ${esc(updateTime(e))}${recorded?'':' · 반영 시각 미기록'}</div>
        <h4>${esc(e.title)}</h4><p class="crm-recent-summary">${esc(e.summary||'변경 내용을 상세에서 확인하세요.')}</p>
        ${preview.length?`<details class="crm-recent-more"><summary>함께 바뀐 기록 ${c.changes.length-1}건</summary>${c.changes.slice(1).map(x=>`<button type="button" data-action="recent-open" data-id="${esc(c.companyId)}" data-tab="${esc(x.tab)}" data-record="${esc(x.recordId)}">${esc(typedLabel[x.kind])} · ${esc(x.title)}</button>`).join('')}</details>`:''}
        <div class="crm-recent-next"><span>다음 행동</span><p>${esc(c.nextAction||'등록된 다음 행동 없음')}</p></div><button class="btn secondary" type="button" data-action="recent-open" data-id="${esc(c.companyId)}" data-tab="${esc(e.tab)}" data-record="${esc(e.recordId)}">변경 내용 보기 →</button></article>`;
    }).join('')||'<div class="empty-state"><strong>선택한 기간에 업데이트된 기록이 없습니다.</strong><p>기간이나 업데이트 종류를 바꿔 확인하세요.</p></div>'}</div>
    ${model.hasMore?'<button class="btn secondary crm-recent-load" type="button" data-action="recent-more">업데이트된 업체 더 보기</button>':''}<p class="crm-recent-note">카드는 최근 관리 기록을 보여줍니다. 업체의 영업 단계는 저장된 값을 유지하며, CRM 반영 시각은 실제 통화·메일 발송 시각과 구분합니다.</p></div></section>`;
}
