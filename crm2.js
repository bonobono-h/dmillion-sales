import {STAGES,STAGE_LABEL,MARKETS,ACTION_GROUPS,normalizeCompanyName,safeText,plain,
  sheetRowsToRecords,getImportPreview,countImportResults,profileFromRow,nextActionFor,
  latestActivity,relatedProjects,groupStats,filteredAccounts,programCategories,taskGroups,
  buildImportPlan,formatNeedsForCRM,needsItems,splitActionItems,remainingLegacyActions,isOpportunityOpen,moneyKRW,activityDate} from './crm2-core.mjs?v=20261029-action-cards-1';

const $=id=>document.getElementById(id);
const el=(tag,cls='')=>{const x=document.createElement(tag);if(cls)x.className=cls;return x;};
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const attr=esc;
const asDate=s=>{if(!s)return '일정 미정';const d=new Date(s);return Number.isNaN(d.getTime())?esc(s):new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'}).format(d);};
const fmtDateTime=s=>{if(!s)return '날짜 미정';const d=new Date(s);return Number.isNaN(d.getTime())?esc(s):new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d);};
const tag=(s,cls='')=>`<span class="pill ${cls}">${esc(s||'미분류')}</span>`;
const blank=v=>plain(v)?esc(v):'<span class="empty-inline">정보 없음</span>';
const cid=c=>c._id||c.id;
const uid=()=>typeof crypto!=='undefined' && crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
const cc=name=>state.companies.find(x=>cid(x)===name);
const cname=id=>cc(id)?.name||'업체 정보 없음';
// Sensitive details come only from the authenticated contact collection or the current Excel preview.
// Do not copy contact names, phone numbers or emails into crm2Profiles or public source files.
const contactText=value=>{
  if(Array.isArray(value))return value.map(contactText).filter(Boolean).join(' / ');
  if(value && typeof value==='object')return contactText(value.name??value.value??value.email??value.phone??'');
  return String(value??'').trim();
};
function contactFor(company){
  if(!state.canWrite)return {person:'',phone:'',email:'',restricted:true};
  const id=cid(company),p=state.profiles[id]||{},stored=state.contacts[id]||{};
  const latest=state.importRows.find(r=>normalizeCompanyName(r.name)===normalizeCompanyName(company.name));
  const pick=(...values)=>values.map(contactText).find(Boolean)||'';
  return {
    // An uploaded spreadsheet is session-only and may be newer than the existing site values.
    person:pick(latest?.contactName,stored.contactPerson,stored.person,stored.name,company.contactPerson,p.contactName,company.contactName),
    phone:pick(latest?.phone,stored.phone,stored.phones,company.phone),
    email:pick(latest?.email,stored.email,stored.emails,company.email)
  };
}
function contactDisplay(value,type='name'){
  const display=contactText(value);
  if(!display)return '<span class="empty-inline">미등록</span>';
  let href='';
  if(type==='phone'){
    const normalized=display.replace(/[\s().-]/g,'');
    if(/^\+?[0-9]{7,16}$/.test(normalized))href='tel:'+normalized;
  }
  if(type==='email' && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(display))href='mailto:'+encodeURIComponent(display);
  return href?`<a class="crm-contact-link" href="${attr(href)}">${esc(display)}</a>`:
    `<span class="crm-contact-data">${esc(display)}</span>`;
}
function contactPanel(company){
  const contact=contactFor(company);
  const value=(v,t)=>contact.restricted?'<span class="empty-inline">영업 담당자 이상 열람</span>':contactDisplay(v,t);
  return `<section class="crm-contact-card" aria-label="고객사 담당자와 연락처">
    <div class="crm-contact-title"><strong>고객 담당자 · 연락처</strong><span>${state.demo?'가상 데이터':contact.restricted?'권한 제한':'기존 연락처 연결'}</span></div>
    <div class="crm-contact-grid">
      <div class="crm-contact-item"><div class="crm-contact-label">고객 담당자</div>${value(contact.person,'name')}</div>
      <div class="crm-contact-item"><div class="crm-contact-label">전화번호</div>${value(contact.phone,'phone')}</div>
      <div class="crm-contact-item"><div class="crm-contact-label">이메일</div>${value(contact.email,'email')}</div>
    </div>
  </section>`;
}
const $main=$('main');

const state={
  demo:!!window.CRM2_DEMO,role:'pending',isAdmin:false,canWrite:false,db:null,userId:null,
  screen:new URLSearchParams(location.search).get('view')==='import'?'import':'accounts',companyTab:'overview',selectedId:null,
  companies:[],profiles:{},activities:[],projects:[],opportunities:[],tasks:[],contacts:{},categories:[],
  filters:{q:'',grade:'',market:'',group:'',stage:'',sort:'name',hasTask:false},
  oppFilter:'all',activityFilter:'all',importFilter:'all',
  importRows:[],importPreview:[],importFileName:'',importSessionApplied:false,
  importSelected:new Set(),importNewIds:{},importTaskIds:{},
  importOptions:{replaceContacts:false,includeTasks:false},importBackup:null,
  importBackupSaved:false,importApplying:false,importResult:'',
  loading:false,connected:false,legacyImporting:false
};
const navNames={accounts:'업체 관리',home:'오늘의 영업',opportunities:'영업 기회',activities:'영업 활동',manager:'관리자 분석',import:'엑셀 비교·가져오기'};
function categoryChoices() {
  const candidates=[...MARKETS,...state.categories.map(x=>x.name),
    ...Object.values(state.profiles).flatMap(p=>[...programCategories(p),p.market2027])];
  const choices=[],seen=new Set();
  for (const raw of candidates) {
    const name=safeText(raw),key=name.normalize('NFKC').toLocaleLowerCase('ko');
    if(name&&!seen.has(key)){choices.push(name);seen.add(key);}
  }
  return choices;
}

async function loadDemo(){
  const {demoData}=await import('./crm2-demo.mjs?v=20261029-multilist');
  state.companies=structuredClone(demoData.companies);
  state.profiles=structuredClone(demoData.profiles);
  state.activities=structuredClone(demoData.activities);
  state.projects=structuredClone(demoData.projects);
  state.opportunities=structuredClone(demoData.opportunities);
  state.tasks=structuredClone(demoData.tasks);
  state.isAdmin=true;state.canWrite=true;state.userId='demo-user';state.role='admin';state.connected=false;state.contacts=structuredClone(demoData.contacts||{});state.categories=[];
  $('modePill').textContent='데모 · 가상 업체';$('modePill').classList.add('demo');
}
async function getDocs(db,path) {
  const snap=await db.collection(path).get();
  return snap.docs.map(d=>({_id:d.id,...(d.data()||{})}));
}
async function loadLive(){
  if(!window.claude){throw new Error('기존 영업관리의 로그인 연결을 찾지 못했습니다. 파일을 기존 저장소 루트에 넣었는지 확인하세요.');}
  const [db,user]=await Promise.all([window.claude.use('db'),window.claude.use('user')]);
  state.db=db;
  state.canWrite=await user.can('data.write');state.isAdmin=await user.isOwner();state.userId=await user.id();
  state.role=window.dmSync?.whoami()?.role || (state.isAdmin?'admin':state.canWrite?'sales':'view');
  const names=['companies','activities','projects','crm2Profiles','opportunities','tasks','crm2Categories'];
  const data=await Promise.all(names.map(x=>getDocs(db,x).catch(e=>{throw new Error(`${x} 데이터 조회에 실패했습니다: ${e.message}`);} )));
  state.companies=data[0];state.activities=data[1];state.projects=data[2];
  state.profiles=Object.fromEntries(data[3].map(x=>[x._id,x]));
  state.opportunities=data[4];state.tasks=data[5];state.categories=data[6];state.connected=true;
  const protectedContacts=state.canWrite?await getDocs(db,'data/contacts/items'):[];
  state.contacts=Object.fromEntries(protectedContacts.map(x=>[x._id,x]));
  $('modePill').textContent=state.isAdmin?'운영 데이터 · 관리자':state.canWrite?'운영 데이터 · 영업담당':'운영 데이터 · 보기전용';
  $('modePill').classList.remove('demo');
}
async function refresh(){
  if(state.loading)return;
  state.loading=true;$('refreshBtn').disabled=true;
  try{
    if(state.demo)await loadDemo();else await loadLive();
    if(!cc(state.selectedId))state.selectedId=state.companies[0]?cid(state.companies[0]):null;
    render();toast(`${state.companies.length}개 업체를 불러왔습니다.`);
  }catch(e){console.error(e);toast('불러오기 실패: '+e.message,true);}finally{state.loading=false;$('refreshBtn').disabled=false;}
}
async function boot(){
  try{
    if(state.demo)await loadDemo();else await loadLive();
    state.selectedId=state.companies[0]?cid(state.companies[0]):null;
    $('loadingScreen').classList.add('hidden');
    render();
  }catch(e){
    console.error(e);$('loadingText').textContent='연결 오류: '+e.message;
    $('loadingDemo').classList.remove('hidden');$('loadingDemo').onclick=()=>location.href='crm2.html?demo=1';
  }
}
function toast(msg,error=false){const t=$('toast');t.textContent=msg;t.style.background=error?'#b33a47':'#1c2d4d';t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),4200);}
function heading(title,subtitle,actions=''){return `<div class="page-heading"><div><p class="eyebrow">DMILLION / SALES CRM</p><h1 class="page-title">${esc(title)}</h1><p class="subtitle">${esc(subtitle)}</p></div>${actions?`<div class="heading-actions">${actions}</div>`:''}</div>`;}
function btn(action,label,cls='secondary',extra=''){return `<button type="button" class="btn ${cls}" data-action="${attr(action)}" ${extra}>${label}</button>`;}
function stat(label,num,foot,icon){return `<div class="stat"><div class="stat-row"><span class="label">${esc(label)}</span><span class="stat-icon">${icon}</span></div><div class="number">${esc(num)}</div><span class="foot">${esc(foot)}</span></div>`;}
function empty(msg,sub=''){return `<div class="empty-state"><div class="symbol">◇</div><strong>${esc(msg)}</strong>${sub?`<p>${esc(sub)}</p>`:''}</div>`;}
function render(){
  // Preserve the scroll position of both independently scrollable panes whenever
  // the account page must be re-rendered (e.g. a task was completed or edited).
  const accountList=state.screen==='accounts'?$main.querySelector('.account-layout .table-scroll'):null;
  const detailBody=state.screen==='accounts'?$main.querySelector('.account-layout .detail-scroll'):null;
  const listScroll=accountList?{top:accountList.scrollTop,left:accountList.scrollLeft}:null;
  const detailScroll=detailBody?detailBody.scrollTop:null;
  document.querySelectorAll('[data-nav]').forEach(x=>x.classList.toggle('active',x.dataset.nav===state.screen));
  $('crumb').textContent=navNames[state.screen]||state.screen;
  const body={accounts:renderAccounts,home:renderHome,opportunities:renderOpportunities,activities:renderActivities,manager:renderManager,import:renderImport}[state.screen];
  $main.innerHTML=body?body():renderAccounts();
  if(listScroll){
    const next=$main.querySelector('.account-layout .table-scroll');
    if(next){next.scrollTop=listScroll.top;next.scrollLeft=listScroll.left;}
  }
  if(detailScroll!==null){
    const next=$main.querySelector('.account-layout .detail-scroll');
    if(next)next.scrollTop=detailScroll;
  }
}
/**
 * Update only the right-hand company detail pane when selecting a row or tab.
 * Replacing the whole #main used to recreate .table-scroll and jump the list
 * back to its first row. This also preserves keyboard focus on the chosen row.
 */
function updateCompanyDetailOnly(){
  if(state.screen!=='accounts')return false;
  const panel=$main.querySelector('.account-layout > aside.panel');
  if(!panel)return false;
  panel.innerHTML=renderCompanyDetail();
  $main.querySelectorAll('tr[data-action="select-company"]').forEach(row=>{
    const selected=row.dataset.id===state.selectedId;
    row.classList.toggle('selected',selected);
    row.setAttribute('aria-current',selected?'true':'false');
  });
  return true;
}
function selectCompany(id,updateInPlace=true){
  if(!cc(id))return;
  state.selectedId=id;
  state.companyTab='overview';
  if(updateInPlace&&updateCompanyDetailOnly())return;
  state.screen='accounts';
  render();
}
function activeAccountList(){return filteredAccounts(state.companies,state.profiles,state.opportunities,state.tasks,state.filters);}
function options(items,v,placeholder='전체'){
  return `<option value="">${esc(placeholder)}</option>`+items.map(x=>{const [value,label]=Array.isArray(x)?x:[x,x];return `<option value="${attr(value)}" ${v===value?'selected':''}>${esc(label)}</option>`;}).join('');
}
function renderAccounts(){
  const list=activeAccountList(),st=groupStats(state.companies,state.profiles,state.opportunities,state.tasks),f=state.filters;
  return `${heading('고객사 중심 영업관리','업체의 맥락, 영업 기회, 다음 행동을 한 화면에서 관리합니다.',
    `${btn('new-opportunity','＋ 영업 기회','secondary')}${btn('new-task','＋ 후속 업무','primary')}`)}
  <div class="stats">${stat('등록된 업체',st.total+'개','협력사 포함 전체','▦')}${stat('A등급 고객사',st.a+'개','기존 또는 최신 분류 기준','★')}${stat('후속 업무 있는 업체',st.follow+'개','기존 다음 액션 포함','◷')}${stat('진행 중 영업 기회',st.openOpps+'건','제안 건별로 별도 집계','◇')}</div>
  <div class="account-layout">
  <section class="panel">
    <div class="panel-head"><div><h2 class="panel-title">업체 리스트</h2><p class="panel-subtitle">${list.length}개 결과 · 업체 선택 시 상세정보 표시</p></div>${btn('open-import','⇩ 최신 엑셀 비교','secondary')}</div>
    <div class="toolbar">
      <input id="f-q" class="field search-input" placeholder="업체, 니즈, 담당자, 메모 검색" value="${attr(f.q)}" aria-label="업체 검색">
      <select id="f-grade" class="select" aria-label="고객사 등급">${options(['A','B','C'],f.grade,'등급 전체')}</select>
      <select id="f-market" class="select" aria-label="지원공고사업분류">${options(categoryChoices(),f.market,'지원공고사업분류 전체')}</select>
      <select id="f-group" class="select" aria-label="연락 분류">${options(ACTION_GROUPS.map(s=>[s,s]),f.group,'활동 분류 전체')}</select>
      <select id="f-sort" class="select" aria-label="정렬">${options([['name','업체명순'],['grade','등급순'],['action','다음 일정순'],['opportunities','영업 기회순']],f.sort,'정렬')}</select>
      <label class="small muted"><input type="checkbox" id="f-task" ${f.hasTask?'checked':''}> 후속 업무 있음</label>
    </div>
    <div class="table-scroll"><table class="table"><thead><tr><th>업체</th><th>등급·사업분류</th><th>현재 단계</th><th>다음 행동</th></tr></thead><tbody>
      ${list.map(c=>{
        const p=state.profiles[cid(c)]||{},n=nextActionFor(c,state.tasks),selected=state.selectedId===cid(c),contact=contactFor(c),activeCount=taskGroups(cid(c),state.tasks).active.length;
        return `<tr data-action="select-company" data-id="${attr(cid(c))}" class="${selected?'selected':''}" tabindex="0" aria-current="${selected?'true':'false'}" aria-label="${attr(c.name)} 업체 상세">
          <td><div class="company-name">${esc(c.name||'업체명 없음')}</div><div class="tiny muted truncate">${esc(c.industry||c.bizDetail||c.region||'업종 미입력')}</div>
            ${state.canWrite?`<div class="crm-contact-brief"><span>고객 담당: ${esc(contact.person||'미등록')}</span><span>전화: ${contactDisplay(contact.phone,'phone')}</span><span>메일: ${contactDisplay(contact.email,'email')}</span></div>`:''}</td>
          <td>${tag(p.accountGrade||'미분류',(p.accountGrade||'').toLowerCase())}<div class="tiny muted" style="margin-top:5px">${esc(programCategories(p).slice(0,2).join(' · ')||'분류 미지정')}${programCategories(p).length>2?` 외 ${programCategories(p).length-2}개`:''}</div></td>
          <td>${tag(c.stage||'기록 없음','outline')}</td>
          <td><div class="tiny truncate">${esc(n?.title||'등록된 액션 없음')}</div><div class="tiny muted">${n?.dueAt?asDate(n.dueAt):''}${activeCount>1?` · 진행 중 ${activeCount}건`:''}</div></td></tr>`;
      }).join('')||`<tr><td colspan="4">${empty('조건에 맞는 업체가 없습니다.','검색 조건을 다시 확인해 주세요.')}</td></tr>`}
    </tbody></table></div><div class="sort-note">업체 상태와 영업 기회 단계는 별도 관리됩니다. · 고객 연락처는 이 화면의 공개 코드에 저장하지 않습니다.</div>
  </section>
  <aside class="panel">${renderCompanyDetail()}</aside>
  </div>`;
}
function taskRow(task,kind='active',index=0){
  const taskId=attr(cid(task));
  const label=kind==='deleted'?'삭제됨':kind==='completed'?(task.status==='cancelled'?'취소':'완료'):'진행 중';
  const actions=state.canWrite?(kind==='active'
    ?btn('complete-task','완료','secondary',`data-id="${taskId}"`)+btn('delete-task','삭제','danger',`data-id="${taskId}"`)
    :kind==='deleted'?btn('restore-task','복구','secondary',`data-id="${taskId}"`):''):'';
  const parts=splitActionItems(task.title);
  const content=parts.length>1
    ?`<div class="crm-task-sublist">${parts.map((p,i)=>`<div><span class="crm-task-subnum">${String(i+1).padStart(2,'0')}</span><span>${esc(p.text)}</span></div>`).join('')}</div>`
    :`<strong class="crm-task-title">${esc(parts[0]?.text||task.title||'내용 없음')}</strong>`;
  return `<article class="crm-task-row ${kind}" aria-label="후속 업무 ${index+1}">
    <div class="crm-task-row-main">
      <span class="crm-task-number" aria-hidden="true">${String(index+1).padStart(2,'0')}</span>
      <div class="crm-task-content">${content}
        <div class="crm-task-date">${task.dueAt?'기한 '+asDate(task.dueAt):'기한 미정'}${task.createdAt?' · 등록 '+asDate(task.createdAt):''}</div>
      </div>
    </div>
    <div class="crm-task-row-actions">${tag(label,kind==='active'?'outline':'ok')}${actions}</div>
  </article>`;
}
function renderLegacyActions(items){
  if(!items.length)return '';
  return `<section class="crm-legacy-block" aria-label="기존 영업관리 후속 업무">
    <div class="crm-legacy-heading">
      <div><strong>기존 영업관리 기록 · ${items.length}항목</strong><p>번호별로 구분해 표시했습니다. 원문은 변경하지 않습니다.</p></div>
      <div class="crm-legacy-actions">
        ${state.canWrite?btn('convert-legacy-actions',state.legacyImporting?'등록 중…':'항목별 업무로 등록','secondary',state.legacyImporting?'disabled':''):''}
        <a class="btn secondary" href="index.html#list">기존 화면에서 수정</a>
      </div>
    </div>
    <div class="crm-legacy-list">${items.map(part=>`<div class="crm-legacy-item">
      <span class="crm-task-number" aria-hidden="true">${String(part.index+1).padStart(2,'0')}</span>
      <div class="crm-legacy-text">${esc(part.text)}</div>
    </div>`).join('')}</div>
    ${state.canWrite?'<p class="crm-legacy-help">개별 완료·삭제는 ‘항목별 업무로 등록’한 뒤 가능합니다. 기존 원문은 그대로 유지됩니다.</p>':''}
  </section>`;
}
function renderNeedsList(items) {
  return `<ul class="crm-needs-list">${items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`;
}
function renderNeedsView(company,profile) {
  const raw=typeof profile.needsSource==='string'?profile.needsSource:(company.needs||profile.statusSummary||'');
  const summary=safeText(profile.needsSummary),items=needsItems(summary||raw);
  if(!items.length)return '<span class="empty-inline">등록된 고객 요구사항이 없습니다.</span>';
  const main=items.slice(0,4),extra=items.slice(4);
  return `<div class="crm-needs-view">${renderNeedsList(main)}
    ${extra.length?`<details class="crm-needs-more"><summary>추가 요구사항 ${extra.length}건 보기</summary>${renderNeedsList(extra)}</details>`:''}
    <div class="crm-needs-origin">${summary?'담당자 검토 정리본':'기존 원문 기반 항목 정돈 · 사실관계 검토 후 저장 가능'}</div>
  </div>`;
}
const detailTabs=[['overview','개요'],['people','담당자'],['opportunities','영업 기회'],['activities','접촉 이력'],['projects','수행 과제'],['documents','문서']];
function renderCompanyDetail(){
  const c=cc(state.selectedId);if(!c)return empty('업체를 선택해 주세요.','왼쪽 목록에서 업체를 선택하면 상세 정보가 표시됩니다.');
  const p=state.profiles[cid(c)]||{},opp=state.opportunities.filter(x=>x.companyId===cid(c)),
    acts=state.activities.filter(x=>x.companyId===cid(c)).sort((a,b)=>activityDate(b).localeCompare(activityDate(a))),
    t=state.tasks.filter(x=>x.companyId===cid(c)),projects=relatedProjects(cid(c),state.projects),contact=contactFor(c);
  const {active:activeTasks,completed:completedTasks,deleted:deletedTasks}=taskGroups(cid(c),t);
  const legacyItems=remainingLegacyActions(c,t);
  const overview=`<div class="section-label">업체 핵심정보</div>
    <dl class="info-grid"><dt>산업·업종</dt><dd>${blank(c.industry)}</dd><dt>주요 사업</dt><dd>${blank(c.bizDetail)}</dd><dt>영업 담당</dt><dd>${blank(c.owner)}</dd><dt>관계 단계</dt><dd>${blank(c.stage)}</dd><dt>고객 담당</dt><dd>${state.canWrite?contactDisplay(contact.person):'<span class="empty-inline">영업 담당자만 열람</span>'}</dd><dt>지역</dt><dd>${blank(c.region||p.region)}</dd></dl>
    <div class="divider"></div><div class="crm-needs-heading"><div class="section-label">고객의 핵심 니즈</div>
      ${state.canWrite?btn('edit-needs','니즈 정리·편집','secondary'):''}</div>
    ${renderNeedsView(c,p)}
    ${p.contactReason?`<div class="insight"><strong>↗ 연락 명분·시점</strong><p>${esc(p.contactReason)}</p></div>`:''}
    ${p.salesComment?`<div class="insight"><strong>✎ 영업 메모</strong><p>${esc(p.salesComment)}</p></div>`:''}
    ${p.stallReason?`<div class="insight"><strong>⚠ 정체·드랍 사유</strong><p>${esc(p.stallReason)}</p></div>`:''}
    <div class="divider"></div>
    <div class="crm-task-heading"><div class="section-label">다음 해야 할 일 · ${activeTasks.length+legacyItems.length}항목</div>${state.canWrite?btn('new-task','＋ 추가','primary'):''}</div>
    <div class="crm-task-list">${activeTasks.map((x,i)=>taskRow(x,'active',i)).join('')}</div>
    ${renderLegacyActions(legacyItems)}
    ${!activeTasks.length&&!legacyItems.length?empty('진행 중인 업무가 없습니다.','새 업무를 추가하면 업체별로 누적됩니다.'):''}
    ${completedTasks.length?`<details class="crm-task-history"><summary>완료·취소 이력 ${completedTasks.length}건</summary><div class="crm-task-list">${completedTasks.map((x,i)=>taskRow(x,'completed',i)).join('')}</div></details>`:''}
    ${deletedTasks.length?`<details class="crm-task-history"><summary>삭제한 업무 ${deletedTasks.length}건 · 복구 가능</summary><div class="crm-task-list">${deletedTasks.map((x,i)=>taskRow(x,'deleted',i)).join('')}</div></details>`:''}`;
  const showContact=(value,type)=>state.canWrite?contactDisplay(value,type):'<span class="empty-inline">영업 담당자만 열람</span>';
  const people=`<div class="section-label">고객 담당자 · 연락처</div><dl class="info-grid"><dt>담당자</dt><dd>${showContact(contact.person,'name')}</dd>
    <dt>전화번호</dt><dd>${showContact(contact.phone,'phone')}</dd>
    <dt>이메일</dt><dd>${showContact(contact.email,'email')}</dd></dl>
    <div class="divider"></div><div class="notice">전화번호·이메일은 기존 앱의 보호된 <b>data/contacts</b> 저장소에서 읽습니다. 최신 고객사 엑셀을 업로드하면 이 브라우저에서만 최신 값을 우선 표시하며, 확인 전에는 서버 정보를 덮어쓰지 않습니다.</div>
    <div class="detail-actions"><a class="btn secondary" href="index.html#list">기존 시스템에서 연락처 수정 ↗</a></div>`;
  const opportunities=`<div class="section-label">진행 중 / 종료 영업 기회 · ${opp.length}건</div><div class="mini-list">${opp.map(o=>`<div class="mini-item"><div class="mini-head"><h3 class="mini-title">${esc(o.title)}</h3>${tag(STAGE_LABEL[o.stage]||o.stage,'outline')}</div><p class="mini-desc">${esc(o.solution||o.solutionTags?.join(', ')||'분야 미입력')} · ${moneyKRW(o.estimatedAmount)} · ${esc(o.owner||'담당 미지정')}</p>
    ${state.canWrite?`<div class="detail-actions">${btn('edit-opportunity','영업 기회 편집','secondary',`data-id="${attr(cid(o))}"`)}</div>`:''}</div>`).join('')||empty('등록된 영업 기회가 없습니다.','업체당 여러 제안을 별도 관리할 수 있습니다.')}</div>
    <div class="detail-actions">${state.canWrite?btn('new-opportunity','＋ 영업 기회 추가','primary'):''}</div>`;
  const activities=`<div class="section-label">접촉 이력 · ${acts.length}건</div><div class="mini-list">${acts.map(a=>`<div class="act-line"><h4>${esc(a.type||a.activityType||a.purpose||'영업 활동')} · <span class="muted">${fmtDateTime(activityDate(a))}</span></h4><p>${esc(a.purpose||a.summary||a.memo||a.notes||'상세 기록 없음')}</p></div>`).join('')||empty('기록된 활동이 없습니다.')}</div><div class="detail-actions"><a class="btn secondary" href="index.html#list">기존 활동 기록 열기 ↗</a></div>`;
  const projectsHtml=`<div class="section-label">연계 사업·과제 · ${projects.length}건</div><div class="mini-list">${projects.map(r=>`<div class="mini-item"><div class="mini-head"><h3 class="mini-title">${esc(r.name||r.title||'과제명 미입력')}</h3>${tag(r.status||r.stage||'진행정보 없음','outline')}</div><p class="mini-desc">${esc(r.programName||r.program||'')} ${r.deadline?'· '+asDate(r.deadline):''}</p></div>`).join('')||empty('등록된 연계 과제가 없습니다.')}</div><div class="notice" style="margin-top:15px">기존 <b>projects.companyIds</b>를 재사용합니다. 정부과제의 선정은 수주로 자동 집계하지 않습니다.</div><div class="detail-actions"><a class="btn secondary" href="index.html#proj">기존 과제 관리 열기 ↗</a></div>`;
  const documents=`<div class="section-label">견적·제안서·계약서</div><div class="callout"><h4>기존 문서함 연결</h4><p>파일 권한·원가 자료 보호를 유지하기 위해 문서를 새 화면으로 복사하지 않습니다. 기존 업체 상세의 '문서·구성표'에서 작업하세요.</p></div><div class="detail-actions"><a class="btn secondary" href="index.html#list">기존 업체 문서함 열기 ↗</a></div>`;
  const map={overview,people,opportunities,activities,projects:projectsHtml,documents};
  return `<div class="panel-body"><div class="detail-top"><div>${tag(p.accountGrade?`${p.accountGrade}등급`:'등급 미지정',(p.accountGrade||'').toLowerCase())}<h2 class="detail-name">${esc(c.name)}</h2><p class="detail-meta">${esc(c.industry||c.kind||'산업 분류 없음')} · ${esc(c.region||p.region||'지역 미입력')}</p></div>${state.canWrite?`<button type="button" class="btn secondary" data-action="edit-profile">편집</button>`:''}</div>
    <div class="badge-row"><span class="tiny muted">지원공고사업분류</span>${programCategories(p).length?programCategories(p).map(name=>tag(name,'outline')).join(''):tag('미지정','outline')}${tag(c.stage||'단계 미입력','outline')}${p.outreachBucket?tag(p.outreachBucket,'warning'):''}</div>
    ${contactPanel(c)}
    <div class="divider"></div><div class="mini-list" style="grid-template-columns:repeat(3,1fr)"><div><strong>${opp.length}</strong><p class="tiny muted">영업 기회</p></div><div><strong>${acts.length}</strong><p class="tiny muted">활동 기록</p></div><div><strong>${projects.length}</strong><p class="tiny muted">연계 과제</p></div></div></div>
    <div class="tabs" role="tablist">${detailTabs.map(([k,v])=>`<button class="tab ${state.companyTab===k?'active':''}" role="tab" aria-selected="${state.companyTab===k}" data-action="company-tab" data-tab="${k}">${v}</button>`).join('')}</div>
    <div class="panel-body detail-scroll">${map[state.companyTab]||overview}</div>`;
}
function renderHome(){
  const todo=state.tasks.filter(t=>!['done','cancelled','deleted'].includes(t.status)).sort((a,b)=>(a.dueAt||'9999').localeCompare(b.dueAt||'9999'));
  const nextLegacy=state.companies.flatMap(c=>remainingLegacyActions(c,state.tasks).map(part=>({companyId:cid(c),title:part.text,dueAt:c.nextDate||null,origin:'legacy'})));
  const all=[...todo,...nextLegacy].sort((a,b)=>(a.dueAt||'9999').localeCompare(b.dueAt||'9999'));
  const now=new Date(),today=now.toISOString().slice(0,10),overdue=all.filter(t=>t.dueAt && t.dueAt.slice(0,10)<today),undated=all.filter(t=>!t.dueAt);
  const priorities=state.companies.filter(c=>['모르겠음 — 담당자 확인','기록 없음 — 메일 확보 후 일괄'].includes(state.profiles[cid(c)]?.outreachBucket));
  return `${heading('오늘의 영업','고객사 중심으로 오늘 연락할 업체와 후속 업무를 정리합니다.',btn('new-task','＋ 업무 추가','primary'))}
  <div class="stats">${stat('후속 업무',all.length+'건','기존 다음 액션 포함','◷')}${stat('기한 지난 업무',overdue.length+'건','미완료 기준','!')}${stat('일정 미정',undated.length+'건','담당자 확인 필요','?')}${stat('관계 확인 필요',priorities.length+'개','엑셀 기준 영업 분류','▦')}</div>
  <div class="two-cols">
    <section class="panel"><div class="panel-head"><div><h2 class="panel-title">다음 영업 행동</h2><p class="panel-subtitle">마감일 빠른 순서 · ${all.length}건</p></div></div>
      <div class="panel-body flow-list">${all.slice(0,30).map(t=>{
      const expired=t.dueAt&&t.dueAt<today;
      return `<div class="flow-card"><div><h3>${esc(cname(t.companyId))}</h3><p class="crm-home-action-text">${esc(splitActionItems(t.title)[0]?.text||t.title)} · ${t.dueAt?asDate(t.dueAt):'일정 미정'}</p></div><div class="flow-detail">${tag(t.origin==='legacy'?'기존 액션':expired?'기한 지남':'진행 중',expired?'bad':'outline')}${state.canWrite&&t._id?btn('complete-task','완료 처리','secondary',`data-id="${attr(cid(t))}"`):''}${state.canWrite&&t._id?btn('delete-task','삭제','danger',`data-id="${attr(cid(t))}"`):''}<button class="btn secondary" type="button" data-action="go-company" data-id="${attr(t.companyId)}">업체 보기</button></div></div>`;
    }).join('')||empty('등록된 후속 업무가 없습니다.','업체에서 후속 업무를 만들어 보세요.')}</div></section>
    <div style="display:grid;gap:17px;align-content:start"><section class="panel"><div class="panel-head"><h2 class="panel-title">확인이 필요한 고객사</h2></div><div class="panel-body mini-list">${priorities.slice(0,10).map(c=>`<div class="mini-item"><div class="mini-head"><strong class="mini-title">${esc(c.name)}</strong>${tag(state.profiles[cid(c)]?.accountGrade||'미분류')}</div><p class="mini-desc">${esc(state.profiles[cid(c)]?.outreachBucket||'')}</p><div class="detail-actions"><button class="btn secondary" data-action="go-company" data-id="${attr(cid(c))}">업체 상세</button></div></div>`).join('')||empty('확인 대상이 없습니다.')}</div></section>
    <section class="callout"><h4>영업 업무 운영 원칙</h4><p>새로운 CRM 후속 업무가 있으면 기존 업체의 nextAction과 중복해서 표시하지 않습니다. 완료되지 않은 업무는 숨기지 않으며, 기한이 정해지지 않은 업무에 임의 날짜를 넣지 않습니다.</p></section></div>
  </div>`;
}
function renderOpportunities(){
  const filtered=state.opportunities.filter(o=>state.oppFilter==='all'||(state.oppFilter==='open'&&isOpportunityOpen(o))||o.stage===state.oppFilter);
  const open=state.opportunities.filter(isOpportunityOpen),won=state.opportunities.filter(o=>o.stage==='won');
  const estimated=open.filter(o=>Number.isFinite(Number(o.estimatedAmount))).reduce((s,o)=>s+Number(o.estimatedAmount||0),0);
  return `${heading('영업 기회 관리','한 업체의 여러 제안·견적·협상을 개별 건으로 추적합니다.',btn('new-opportunity','＋ 영업 기회 등록','primary'))}
  <div class="stats">${stat('전체 영업 기회',state.opportunities.length+'건','수주·실패·보류 포함','◇')}${stat('진행 중',open.length+'건','종료되지 않은 기회','▤')}${stat('수주',won.length+'건','확정된 영업 건만','✓')}${stat('진행 기회 금액',moneyKRW(estimated),'금액이 입력된 건만 합산','₩')}</div>
  <section class="panel"><div class="panel-head"><h2 class="panel-title">영업 파이프라인</h2><span class="muted tiny">선정된 과제는 자동으로 수주 처리하지 않습니다.</span></div>
  <div class="toolbar"><select id="opp-filter" class="select" aria-label="영업 단계 필터">${options([['all','전체'],['open','진행 중'],...STAGES],state.oppFilter,'전체')}</select></div>
  <div class="table-scroll"><table class="table"><thead><tr><th>고객사 / 영업 건</th><th>단계</th><th>예상금액</th><th>담당</th><th>예상 계약</th><th></th></tr></thead><tbody>
  ${filtered.map(o=>`<tr><td><div class="company-name">${esc(o.title||'제안명 미입력')}</div><div class="muted tiny">${esc(cname(o.companyId))}</div></td><td>${tag(STAGE_LABEL[o.stage]||o.stage,'outline')}</td><td>${moneyKRW(o.estimatedAmount)}</td><td>${esc(o.owner||'미정')}</td><td>${o.expectedCloseDate?asDate(o.expectedCloseDate):'미정'}</td><td>${state.canWrite?btn('edit-opportunity','편집','secondary',`data-id="${attr(cid(o))}"`):''}</td></tr>`).join('')||`<tr><td colspan="6">${empty('등록된 영업 기회가 없습니다.','새로운 영업 제안이나 견적 건을 등록하세요.')}</td></tr>`}</tbody></table></div></section>`;
}
function renderActivities(){
  const acts=state.activities.slice().sort((a,b)=>activityDate(b).localeCompare(activityDate(a)));
  const filtered=state.activityFilter==='all'?acts:acts.filter(a=>(a.status||'완료')===state.activityFilter);
  return `${heading('영업 활동 기록','기존 시스템의 미팅·방문·통화 이력을 그대로 읽어옵니다.',`<a class="btn secondary" href="index.html#list">기존 화면에서 활동 추가 ↗</a>`)}
  <section class="panel"><div class="panel-head"><div><h2 class="panel-title">접촉 이력</h2><p class="panel-subtitle">총 ${state.activities.length}건 · 기록 최신순</p></div></div>
    <div class="toolbar"><select id="activity-filter" class="select">${options([['all','전체'],['완료','완료'],['예정','예정'],['취소','취소']],state.activityFilter)}</select></div>
    <div class="table-scroll"><table class="table"><thead><tr><th>날짜</th><th>업체</th><th>유형 / 목적</th><th>결과</th><th>상태</th></tr></thead><tbody>${filtered.slice(0,160).map(a=>`<tr data-action="go-company" data-id="${attr(a.companyId)}"><td>${fmtDateTime(activityDate(a))}</td><td><span class="company-name">${esc(cname(a.companyId))}</span></td><td>${esc(a.type||a.activityType||a.purpose||'영업 활동')}<div class="tiny muted truncate">${esc(a.purpose||'')}</div></td><td><div class="tiny truncate">${esc(a.summary||a.notes||a.memo||'')}</div></td><td>${tag(a.status||'완료','outline')}</td></tr>`).join('')||`<tr><td colspan="5">${empty('등록된 영업 활동이 없습니다.')}</td></tr>`}</tbody></table></div>
  </section>`;
}
function renderManager(){
  const items=state.opportunities,open=items.filter(isOpportunityOpen),won=items.filter(o=>o.stage==='won');
  const total=won.reduce((n,o)=>n+(Number(o.estimatedAmount)||0),0);
  const stageData=STAGES.map(([k,label])=>({key:k,label,n:items.filter(o=>o.stage===k).length}));
  const max=Math.max(1,...stageData.map(s=>s.n));
  const grades=['A','B','C','미분류'].map(g=>({name:g,n:state.companies.filter(c=>(state.profiles[cid(c)]?.accountGrade||'미분류')===g).length}));
  const due=state.tasks.filter(t=>!['done','cancelled','deleted'].includes(t.status)&&t.dueAt&&new Date(t.dueAt)<new Date()).length;
  return `${heading('영업 현황 · 관리자','기존 업체 현황과 별도 영업 기회를 합쳐 봅니다. 현재 버전의 매출은 영업 기회 금액 기준입니다.')}
  ${state.isAdmin?'':`<div class="notice warning" style="margin-bottom:15px">이 화면은 예비 분석 화면입니다. 관리자 전용 금액·원가 자료는 불러오지 않으며, 권한 확대 없이 기존 정책을 따릅니다.</div>`}
  <div class="stats">${stat('관리 업체',state.companies.length+'곳','협력사 포함 전체','▦')}${stat('진행 중 기회',open.length+'건','수주·실패 제외','◇')}${stat('확정 수주 금액',moneyKRW(total),'영업기회에 기록된 금액 합계','₩')}${stat('기한 경과 후속 업무',due+'건','CRM 2.0 미완료 업무 기준','!')}</div>
  <div class="two-cols"><section class="panel wide-panel"><h2 class="panel-title">영업 단계별 진행 건수</h2><p class="top-desc">하나의 고객사에서 여러 영업 기회가 발생할 수 있습니다.</p><div class="barlist">${stageData.map(r=>`<div class="bar-item"><span>${esc(r.label)}</span><div class="bar-bg"><div class="bar-fill" style="width:${100*r.n/max}%"></div></div><strong>${r.n}건</strong></div>`).join('')}</div></section>
  <section class="panel wide-panel"><h2 class="panel-title">고객사 등급 분포</h2><p class="top-desc">업체 기본정보에 적용된 CRM 분류 기준</p><div class="barlist">${grades.map(r=>`<div class="bar-item"><span>${esc(r.name)}</span><div class="bar-bg"><div class="bar-fill" style="width:${100*r.n/Math.max(1,state.companies.length)}%"></div></div><strong>${r.n}곳</strong></div>`).join('')}</div></section></div>
  <div class="callout" style="margin-top:16px"><h4>집계 기준</h4><p>영업 기회의 '수주'만 수주 건으로 집계합니다. 과제의 '선정'과 계약 실적, 매출 인식 시점은 자동으로 동일하게 취급하지 않습니다. 실제 매출·마진 분석은 기존 관리자 권한과 증빙 데이터를 연결한 후 별도 구현해야 합니다.</p></div>`;
}
function importList(){
  return state.importPreview.filter(x=>state.importFilter==='all'||x.status===state.importFilter);
}

function importPlan(){
  return buildImportPlan(state.importPreview,{
    selected:state.importSelected,profiles:state.profiles,contacts:state.contacts,
    tasks:state.tasks,newIds:state.importNewIds,taskIds:state.importTaskIds,
    includeNew:true,replaceContacts:state.importOptions.replaceContacts,
    includeTasks:state.importOptions.includeTasks
  });
}
function invalidateImportBackup(){
  state.importBackup=null;state.importBackupSaved=false;
}
function renderImport(){
  const summary=countImportResults(state.importPreview),lst=importList(),plan=importPlan();
  const eligible=state.isAdmin&&!state.demo;
  const selected=state.importSelected.size;
  return `${heading('최신 고객사 엑셀 · 실제 반영',
    '기존 고객사와 대조해 선택한 항목만 안전하게 병합합니다. 파일만 선택하면 운영 DB는 변경되지 않습니다.',
    `${btn('pick-file','엑셀·CSV 선택','primary')}${state.importRows.length?btn('export-diff','비교안 JSON 저장','secondary'):''}`)}
  <div class="notice">원본 영업 이력·계약·진행 단계·기존 후속 업무는 그대로 유지합니다. 연락처는 <b>보호된 연락처 저장소</b>에만 쓰고, 엑셀의 '없음'은 정상 연락처를 덮어쓰지 않습니다. 신규 업체는 직접 선택해야 추가됩니다.</div>
  <input type="file" id="import-file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" class="hidden">
  <div class="import-row">
    <div class="import-chip"><div class="num">${state.importRows.length}</div><div class="label">엑셀 업체</div></div>
    <div class="import-chip"><div class="num">${summary.new||0}</div><div class="label">신규 업체 후보</div></div>
    <div class="import-chip"><div class="num">${summary.conflict||0}</div><div class="label">이름 충돌</div></div>
    <div class="import-chip"><div class="num">${selected}</div><div class="label">선택한 업체</div></div>
  </div>
  ${state.importRows.length?`
  <section class="panel" style="margin-bottom:16px">
    <div class="panel-head"><div><h2 class="panel-title">반영할 내용</h2><p class="panel-subtitle">기존 데이터와의 차이점만 기록합니다. 처리 대상 ${plan.ops.length}개 문서</p></div></div>
    <div class="panel-body">
      <div class="import-actionbar">
        ${btn('import-select-matched','기존 업체만 선택','secondary')}
        ${btn('import-select-all','신규 포함 전체 선택','secondary')}
        ${btn('import-select-clear','선택 해제','secondary')}
      </div>
      <div class="import-options">
        <label><input id="import-replace-contacts" type="checkbox" ${state.importOptions.replaceContacts?'checked':''}> 기존 연락처도 유효한 엑셀 값으로 갱신하기</label>
        <label><input id="import-include-tasks" type="checkbox" ${state.importOptions.includeTasks?'checked':''}> 엑셀 '사이트 다음 액션'을 새 후속 업무로 추가하기</label>
      </div>
      <div class="import-actionbar">
        ${tag('업체 문서 '+plan.counts.companies,'outline')}
        ${tag('분류·메모 '+plan.counts.profiles,'outline')}
        ${tag('연락처 '+plan.counts.contacts,'outline')}
        ${tag('새 후속 업무 '+plan.counts.tasks,'outline')}
      </div>
      <p class="small muted">기존 연락처 갱신을 선택하지 않으면 비어 있는 정보만 채웁니다. 후속 업무 추가는 기본적으로 꺼져 있으며, 선택하더라도 동일 제목의 기존 업무는 중복 생성하지 않습니다.</p>
      ${!eligible?'<div class="notice warning">운영 DB 일괄 반영은 관리자 계정에서만 가능합니다. 데모에서는 저장할 수 없습니다.</div>':''}
      <div class="import-actionbar import-safety-buttons">
        <button type="button" class="btn secondary" data-action="import-backup" ${!eligible||!plan.ops.length||state.importApplying?'disabled':''}>① 변경 전 데이터 백업 다운로드</button>
        <label><input id="import-backup-saved" type="checkbox" ${state.importBackupSaved?'checked':''} ${!state.importBackup?'disabled':''}> 백업 파일 보관을 확인했어요</label>
        <button type="button" class="btn primary" data-action="import-commit" ${!eligible||!state.importBackup||!state.importBackupSaved||state.importApplying?'disabled':''}>② 선택한 업체 운영 DB 반영</button>
      </div>
      <div id="import-status" class="small muted" role="status">${esc(state.importResult||'백업 파일을 다운로드하고 보관 확인 후 반영할 수 있습니다.')}</div>
      <p class="small muted">백업 JSON에는 연락처가 포함될 수 있습니다. 회사 내부에서 안전하게 보관하고 공개 저장소에 올리지 마세요.</p>
    </div>
  </section>`:''}
  <section class="panel"><div class="panel-head"><div><h2 class="panel-title">업체별 반영 대상 선택</h2>
     <p class="panel-subtitle">${state.importFileName?esc(state.importFileName):'파일을 먼저 선택하세요.'} · 기존 업체만 기본 선택</p></div>
     ${state.importSessionApplied?tag('브라우저 임시 반영','warning'):''}</div>
    <div class="toolbar"><select id="import-filter" class="select">${options([['all','전체'],['new','신규 후보'],['change','분류 변경'],['same','분류 동일'],['conflict','중복·충돌']],state.importFilter)}</select>
      <span class="small muted">표시 ${lst.length}건</span></div>
    <div class="table-scroll"><table class="table import-table"><thead><tr><th>적용</th><th>No</th><th>업체명</th><th>대조 결과</th><th>등급 / 지원공고사업분류</th><th>연락 분류</th><th>변경 항목</th></tr></thead><tbody>
    ${lst.map(x=>`<tr>
      <td><input type="checkbox" data-import-index="${x.index}" aria-label="${attr(x.row.name)} 반영" ${state.importSelected.has(x.index)?'checked':''} ${x.status==='conflict'||state.importApplying?'disabled':''}></td>
      <td>${x.index+1}</td><td><span class="company-name">${esc(x.row.name)}</span></td>
      <td>${tag({new:'사이트 미등록',change:'분류 변경',same:'분류 일치',conflict:'중복 확인 필요'}[x.status],{new:'warning',change:'b',same:'ok',conflict:'bad'}[x.status])}</td>
      <td>${esc(x.row.accountGrade||'-')} / ${esc(x.row.market2027||'-')}</td>
      <td>${esc(x.row.outreachBucket||'-')}</td>
      <td>${esc(Object.keys(x.changes).length?Object.keys(x.changes).join(', '):'변경 비교 필요')}</td>
    </tr>`).join('')||`<tr><td colspan="7">${empty('엑셀 파일을 올려 주세요.','전체 시트의 업체명·등급·담당자·연락처를 확인합니다.')}</td></tr>`}
    </tbody></table></div>
  </section>
  ${state.importRows.length?'<div class="notice" style="margin-top:14px">충돌 업체는 자동 반영하지 않습니다. 회사명이 유사해도 다른 법인일 수 있으므로 신규 후보는 확인한 뒤 체크하세요.</div>':''}`;
}
function showModal(title,desc,fields,onSubmit){
  const layer=$('modalLayer');layer.classList.remove('hidden');layer.setAttribute('aria-hidden','false');
  $('modal').innerHTML=`<button class="modal-close" type="button" data-close="1" aria-label="닫기">×</button><h2>${esc(title)}</h2><p>${esc(desc)}</p>
    <form id="dialogForm" class="form">${fields}<div class="modal-actions"><button type="button" class="btn secondary" data-close="1">취소</button><button type="submit" class="btn primary" id="dialogSave">저장</button></div></form>`;
  const form=$('dialogForm');
  form.onsubmit=async e=>{
    e.preventDefault();const save=$('dialogSave');save.disabled=true;save.textContent='저장 중…';
    try{await onSubmit(new FormData(form));closeModal();render();toast(state.demo?'시연 화면에 적용했습니다. (서버 저장 없음)':'저장했습니다.');}
    catch(e){toast('저장 실패: '+e.message,true);}
    finally{save.disabled=false;save.textContent='저장';}
  };
  form.querySelector('input,select,textarea')?.focus();
}
function closeModal(){$('modalLayer').classList.add('hidden');$('modalLayer').setAttribute('aria-hidden','true');$('modal').innerHTML='';}
async function saveDoc(collection,id,patch,base=null){
  if(!state.canWrite)throw new Error('수정 권한이 없습니다.');
  if(state.demo)return;
  const ref=state.db.doc(`${collection}/${id}`);
  if(base){await ref.update(patch);}
  else await ref.set(patch);
}
async function ensureCategory(raw){
  const name=safeText(raw);
  if(!name||name.length>60)throw new Error('새 분류 이름은 1~60자로 입력해 주세요.');
  const key=name.normalize('NFKC').toLocaleLowerCase('ko');
  const existing=categoryChoices().find(x=>x.normalize('NFKC').toLocaleLowerCase('ko')===key);
  if(existing)return existing;
  const id=uid(),data={name,createdAt:new Date().toISOString(),createdBy:state.userId||null};
  await saveDoc('crm2Categories',id,data);
  state.categories.push({_id:id,...data});
  return name;
}
function profileModal(){
  const c=cc(state.selectedId);if(!c)return toast('업체를 선택해 주세요.',true);
  if(!state.canWrite)return toast('수정 권한이 없습니다.',true);
  const p=state.profiles[cid(c)]||{};
  const field=(n,key,v='',opts={})=>`<label>${esc(n)}${opts.select?`<select name="${key}">${options(opts.select,plain(v),'선택 안 함')}</select>`:
    opts.textarea?`<textarea name="${key}" rows="${opts.rows||3}">${esc(v)}</textarea>`:`<input name="${key}" value="${attr(v)}">`}</label>`;
  showModal(`${c.name} · 고객정보 정리`,'기존 업체 레코드를 건드리지 않고 crm2Profiles에 별도로 저장합니다.',
    `<div class="form-row">${field('고객사 등급','accountGrade',p.accountGrade,{select:['A','B','C']})}
      <div class="crm-category-helper">지원공고사업분류는 복수 선택할 수 있어요. 업체별로 체크된 항목만 저장됩니다.</div></div>
    <div class="crm-categories-box">
      <div class="crm-category-title">지원공고사업분류 <span class="muted tiny">현재 ${programCategories(p).length}개 선택</span></div>
      <div class="crm-category-grid" role="group" aria-label="지원공고사업분류 여러 개 선택">
        ${categoryChoices().map(value=>`<label class="crm-category-choice"><input type="checkbox" name="programCategory" value="${attr(value)}" ${programCategories(p).includes(value)?'checked':''}><span>${esc(value)}</span></label>`).join('')}
      </div>
      <small>선택한 항목은 누적됩니다. 체크 해제하고 저장하면 해당 업체에서만 제거됩니다.</small>
    </div>
    <label>새 분류 추가 (선택 사항)
      <input name="newCategories" maxlength="260" placeholder="예: 제조로봇 지원사업, 스마트제조 AX·DX" autocomplete="off">
      <small>${state.demo?'데모 데이터는 새로고침하면 초기화됩니다.':'쉼표로 구분해 여러 개 추가 가능 · 새 분류는 다른 담당자에게도 표시됩니다.'}</small>
    </label>
    ${field('영업 분류','outreachBucket',p.outreachBucket,{select:ACTION_GROUPS})}
    ${field('연락 명분 및 시점','contactReason',p.contactReason,{textarea:true})}
    ${field('고객사 현황','statusSummary',p.statusSummary,{textarea:true})}
    ${field('정체·드랍 사유','stallReason',p.stallReason,{textarea:true})}
    ${field('영업 메모','salesComment',p.salesComment,{textarea:true})}`,
    async fd=>{
      const patch=Object.fromEntries(['accountGrade','outreachBucket','contactReason','statusSummary','stallReason','salesComment'].map(k=>[k,safeText(fd.get(k))]));
      const names=fd.getAll('programCategory').map(safeText).filter(Boolean);
      const extras=safeText(fd.get('newCategories')).split(/[,，;\n]/).map(safeText).filter(Boolean);
      if([...names,...extras].some(n=>n.length>60))throw new Error('분류 이름은 각각 60자 이하로 입력해 주세요.');
      if(names.length+extras.length>60)throw new Error('선택할 수 있는 분류는 최대 60개입니다.');
      for(const raw of extras)names.push(await ensureCategory(raw));
      const seen=new Set();
      patch.programCategories=names.filter(value=>{
        const key=value.normalize('NFKC').toLocaleLowerCase('ko');
        if(seen.has(key))return false;
        seen.add(key);return true;
      });
      patch.market2027=patch.programCategories[0]||''; // Legacy compatibility only.
      patch.updatedAt=new Date().toISOString();
      const exists=!!state.profiles[cid(c)]?._id;
      await saveDoc('crm2Profiles',cid(c),patch,exists);
      state.profiles[cid(c)]={...p,...patch,_id:cid(c)};
    });
}
function updateNeedsPreview(){
  const target=$('crm2NeedsPreview'),raw=$('crm2NeedsSource'),summary=$('crm2NeedsSummary');
  if(!target||!raw||!summary)return;
  const value=safeText(summary.value)||formatNeedsForCRM(raw.value);
  const items=needsItems(value);
  target.innerHTML=items.length?renderNeedsList(items):'<span class="empty-inline">원문을 입력하거나 정리본을 작성하면 미리보기가 표시됩니다.</span>';
}
function needsModal(){
  const c=cc(state.selectedId);
  if(!c)return toast('업체를 먼저 선택해 주세요.',true);
  if(!state.canWrite)return toast('고객 정보 수정 권한이 없습니다.',true);
  const p=state.profiles[cid(c)]||{};
  const source=typeof p.needsSource==='string'?p.needsSource:(c.needs||p.statusSummary||'');
  const summary=safeText(p.needsSummary);
  showModal(c.name+' · 핵심 니즈 정리',
    '원문을 보존하고, CRM 표시용 정리본만 별도 저장합니다. 작성 후 미리보기를 확인하세요.',
    `<div class="crm-needs-guide"><strong>영업관리 작성 기준</strong>
      <span>확인된 현장 이슈와 고객 요청을 중심으로 기재 · 사양·수치 유지 · 추정·성과 과장 금지 · 미확정 사항은 [확인 필요]로 구분</span>
    </div>
    <label>고객사 요구사항 원문
      <textarea name="needsSource" id="crm2NeedsSource" rows="7" placeholder="현장 미팅 내용, 고객의 실제 요구사항을 원문 그대로 입력하세요.">${esc(source)}</textarea>
      <small>기존 업체의 원본 메모는 변경하지 않습니다.</small>
    </label>
    <div class="crm-needs-toolbar">${btn('format-needs','번호·줄바꿈 정돈하기','secondary')}
      <span class="small muted">사실관계를 바꾸지 않는 규칙 기반 정돈입니다.</span></div>
    <label>고객에게 확인된 핵심 니즈 · 정리본
      <textarea name="needsSummary" id="crm2NeedsSummary" rows="6"
       placeholder="정돈하기 버튼을 누른 뒤 문장을 수정하세요. 빈칸이면 원문을 항목화해 표시합니다.">${esc(summary)}</textarea>
      <small>업체 상세화면에는 이 정리본이 우선 표시됩니다. 원문은 보존됩니다.</small>
    </label>
    <div class="crm-needs-preview-title">업체 상세화면 미리보기</div>
    <div id="crm2NeedsPreview" class="crm-needs-preview"></div>`,
    async fd=>{
      const sourceValue=safeText(fd.get('needsSource')),summaryValue=safeText(fd.get('needsSummary'));
      if(sourceValue.length>40000||summaryValue.length>20000)throw new Error('원문은 4만 자, 정리본은 2만 자 이내로 입력해 주세요.');
      const patch={};
      if(sourceValue!==safeText(source))patch.needsSource=sourceValue;
      if(summaryValue!==summary)patch.needsSummary=summaryValue;
      if(!Object.keys(patch).length)return;
      patch.needsEditedAt=new Date().toISOString();
      patch.needsEditedBy=state.userId||null;
      await saveDoc('crm2Profiles',cid(c),patch,!!p._id);
      state.profiles[cid(c)]={...p,...patch,_id:cid(c)};
    });
  updateNeedsPreview();
}
function opportunityModal(id=null){
  if(!state.canWrite)return toast('수정 권한이 없습니다.',true);
  const current=state.opportunities.find(o=>cid(o)===id),c=cc(state.selectedId);
  const names=state.companies.filter(x=>x.kind!=='협력사').sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  const selectedCo=current?.companyId||cid(c)||'';
  const selectedStage=current?.stage||'discovery';
  showModal(current?'영업 기회 편집':'새 영업 기회','각 업체마다 제안·견적을 여러 건 등록할 수 있습니다.',
    `<label>고객사 <select required name="companyId">${names.map(x=>`<option value="${attr(cid(x))}" ${selectedCo===cid(x)?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>
    <label>영업 기회명 <input required maxlength="120" name="title" value="${attr(current?.title||'')}" placeholder="예: 검사공정 비전 자동화"></label>
    <div class="form-row"><label>진행 단계 <select name="stage">${STAGES.map(([k,v])=>`<option value="${k}" ${selectedStage===k?'selected':''}>${v}</option>`).join('')}</select></label>
    <label>예상 금액 (원)<input name="estimatedAmount" type="number" min="0" step="1" value="${attr(current?.estimatedAmount??'')}" placeholder="미정이면 빈칸"></label></div>
    <div class="form-row"><label>담당자 <input name="owner" value="${attr(current?.owner||'')}"></label>
    <label>예상 계약일 <input name="expectedCloseDate" type="date" value="${attr(current?.expectedCloseDate||'')}"></label></div>
    <label>제안 분야 <input name="solution" value="${attr(current?.solution||'')}" placeholder="예: 로봇·자동화 / 제조AI"></label>
    <label>고객 니즈 / 제안 메모 <textarea name="notes">${esc(current?.notes||'')}</textarea></label>` ,
    async fd=>{
      const amount=fd.get('estimatedAmount');
      const patch={companyId:String(fd.get('companyId')),title:safeText(fd.get('title')),stage:String(fd.get('stage')),
        estimatedAmount:amount===''?null:Number(amount),owner:safeText(fd.get('owner')),
        expectedCloseDate:safeText(fd.get('expectedCloseDate'))||null,solution:safeText(fd.get('solution')),
        notes:safeText(fd.get('notes')),updatedAt:new Date().toISOString()};
      if(!patch.companyId||!patch.title)throw new Error('고객사와 영업 기회명을 입력해 주세요.');
      const newId=id||uid();
      const data={...current,...patch,...(!id?{createdAt:new Date().toISOString()}:{} )};
      await saveDoc('opportunities',newId,patch,id?true:null);
      if(id)Object.assign(current,patch);else state.opportunities.push({_id:newId,...data});
      state.selectedId=patch.companyId;state.companyTab='opportunities';
    });
}
function taskModal(){
  if(!state.canWrite)return toast('수정 권한이 없습니다.',true);
  const companies=state.companies.filter(x=>x.kind!=='협력사').sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  showModal('후속 업무 등록','하나의 업무를 원본으로 관리하며 업체 화면에 자동으로 표시합니다.',
    `<label>업체 <select required name="companyId" id="modalCompany">${companies.map(c=>`<option value="${attr(cid(c))}" ${state.selectedId===cid(c)?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>
    <label>해야 할 일 <input required name="title" maxlength="180" placeholder="예: 고객 요구사항 확인 통화"></label>
    <div class="form-row"><label>마감일 <input name="dueAt" type="date"><small>일정이 정해지지 않았다면 비워 두세요.</small></label>
      <label>우선순위 <select name="priority">${options([['normal','일반'],['high','높음'],['low','낮음']],'normal','일반')}</select></label></div>`,
    async fd=>{
      const data={companyId:String(fd.get('companyId')),title:safeText(fd.get('title')),status:'todo',
        dueAt:safeText(fd.get('dueAt'))||null,priority:safeText(fd.get('priority'))||'normal',
        assigneeId:state.userId||null,createdAt:new Date().toISOString()};
      if(!data.companyId||!data.title)throw new Error('업체와 업무 내용을 입력해 주세요.');
      const id=uid();await saveDoc('tasks',id,data,null);state.tasks.push({_id:id,...data});state.selectedId=data.companyId;
    });
}
async function completeTask(id){
  const t=state.tasks.find(x=>cid(x)===id);if(!t||!state.canWrite||['done','cancelled','deleted'].includes(t.status))return;
  if(!confirm(`${t.title}\n완료 처리할까요?`))return;
  const patch={status:'done',completedAt:new Date().toISOString()};
  try{await saveDoc('tasks',id,patch,true);Object.assign(t,patch);render();toast('업무를 완료 처리했습니다.');}catch(e){toast('저장 실패: '+e.message,true);}
}
async function deleteTask(id){
  const task=state.tasks.find(x=>cid(x)===id);
  if(!task||!state.canWrite||['done','cancelled','deleted'].includes(task.status))return;
  if(!confirm(`후속 업무 "${task.title}"을(를) 삭제할까요?\n삭제된 업무는 화면에서 숨겨지며 복구를 위한 기록은 남습니다.`))return;
  const patch={status:'deleted',deletedAt:new Date().toISOString(),deletedBy:state.userId||null};
  try{
    await saveDoc('tasks',id,patch,true);
    Object.assign(task,patch);
    render();toast('후속 업무를 삭제했습니다.');
  }catch(error){console.error(error);toast('삭제 실패: '+error.message,true);}
}
async function restoreTask(id){
  const task=state.tasks.find(x=>cid(x)===id);
  if(!task||!state.canWrite||task.status!=='deleted')return;
  const patch={status:'todo',deletedAt:null,deletedBy:null,updatedAt:new Date().toISOString()};
  try{
    await saveDoc('tasks',id,patch,true);
    Object.assign(task,patch);
    render();toast('삭제한 업무를 복구했습니다.');
  }catch(error){console.error(error);toast('복구 실패: '+error.message,true);}
}
async function convertLegacyActions(){
  const company=cc(state.selectedId);
  if(!company||!state.canWrite||state.legacyImporting)return;
  const pieces=remainingLegacyActions(company,state.tasks);
  if(!pieces.length)return toast('등록할 기존 항목이 없습니다.');
  if(!confirm(`기존 영업관리 기록의 ${pieces.length}개 항목을 개별 후속 업무로 등록할까요?\n기존 원문을 변경하지 않으며, 등록 후 각 항목을 완료·삭제할 수 있습니다.\n여러 항목에 임의 기한은 지정하지 않습니다.`))return;
  state.legacyImporting=true;
  let added=0;
  try{
    for(const piece of pieces){
      if(!remainingLegacyActions(company,state.tasks).some(x=>x.key===piece.key))continue;
      const id=uid();
      const data={companyId:cid(company),title:piece.text,
        source:'legacy-nextAction',sourceActionKey:piece.key,
        status:'todo',priority:'normal',dueAt:null,
        createdAt:new Date().toISOString(),assigneeId:state.userId||null};
      await saveDoc('tasks',id,data);
      state.tasks.push({_id:id,...data});
      added++;
    }
    toast(`${added}개 항목을 개별 업무로 등록했습니다.`);
  }catch(error){
    console.error(error);
    toast(`일부만 등록됐습니다 (${added}/${pieces.length}). 다시 누르면 남은 항목만 등록합니다. ${error.message}`,true);
  }finally{
    state.legacyImporting=false;
    render();
  }
}
function csvParse(text){
  const rows=[];let cur=[],field='',quote=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],n=text[i+1];
    if(quote){if(ch==='"'&&n==='"'){field+='"';i++;}else if(ch==='"')quote=false;else field+=ch;}
    else if(ch==='"')quote=true;
    else if(ch===','){cur.push(field);field='';}
    else if(ch==='\n'){cur.push(field.replace(/\r$/,''));rows.push(cur);cur=[];field='';}
    else field+=ch;
  }
  if(field||cur.length){cur.push(field);rows.push(cur);}
  if(rows.length&&rows[0][0])rows[0][0]=rows[0][0].replace(/^\uFEFF/,'');
  return rows;
}
async function needXlsx(){
  if(window.XLSX)return window.XLSX;
  const src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('엑셀 읽기 도구를 불러오지 못했습니다. 인터넷 연결을 확인하거나 CSV로 저장해서 올려 주세요.'));document.head.append(s);});
  return window.XLSX;
}
async function readImportFile(file){
  if(!file)return;
  const ext=(file.name.split('.').at(-1)||'').toLowerCase();let rows;
  if(ext==='csv')rows=csvParse(await file.text());
  else if(['xlsx','xls'].includes(ext)){
    const XLSX=await needXlsx();const buf=await file.arrayBuffer();const book=XLSX.read(buf,{type:'array'});
    const sn=book.SheetNames.includes('전체')?'전체':book.SheetNames.find(x=>x.includes('전체'))||book.SheetNames[0];
    rows=XLSX.utils.sheet_to_json(book.Sheets[sn],{header:1,defval:'',raw:false});
  }else throw new Error('xlsx, xls, csv 파일만 읽을 수 있습니다.');
  const mapped=sheetRowsToRecords(rows);
  if(!mapped.length)throw new Error('업체 정보가 없습니다. 시트 이름과 업체명 열을 확인해 주세요.');
  state.importRows=mapped;state.importPreview=getImportPreview(mapped,state.companies,state.profiles);
  state.importSelected=new Set(state.importPreview.filter(x=>x.company&&x.status!=='conflict').map(x=>x.index));
  state.importNewIds=Object.fromEntries(mapped.map((_,i)=>[i,uid()]));
  state.importTaskIds=Object.fromEntries(mapped.map((_,i)=>[i,uid()]));
  state.importFileName=file.name;state.importSessionApplied=false;state.importFilter='all';
  state.importOptions={replaceContacts:false,includeTasks:false};invalidateImportBackup();
  state.importResult='검토 중 · 서버 데이터 변경 없음';
  state.screen='import';render();toast(`${mapped.length}개 업체를 비교했습니다. 운영 DB는 변경하지 않았습니다.`);
}
function blobDownload(name,payload){
  const url=URL.createObjectURL(new Blob([payload],{type:'application/json;charset=utf-8'}));
  const a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function exportDiff(){
  if(!state.importPreview.length)return;
  const matched=state.importPreview.filter(x=>x.status==='change').map(x=>({companyId:cid(x.company),companyName:x.row.name,changes:x.changes,proposedProfile:profileFromRow(x.row)}));
  const newCandidates=state.importPreview.filter(x=>x.status==='new').map(x=>({name:x.row.name,proposedProfile:profileFromRow(x.row)}));
  const conflicts=state.importPreview.filter(x=>x.status==='conflict').map(x=>({name:x.row.name,reason:'중복·충돌 수동 검토'}));
  blobDownload('CRM2_고객사_병합검토안.json',JSON.stringify({
    kind:'review-only / NOT A DATABASE IMPORT',createdAt:new Date().toISOString(),sourceFile:state.importFileName,
    policy:'No live write. No personal email/phone. Never treat government selection as won.',matched,newCandidates,conflicts
  },null,2));
  toast('병합 검토안을 저장했습니다. 운영 데이터에는 반영되지 않았습니다.');
}

function importBackupFingerprint(plan){return JSON.stringify(plan.ops);}
async function downloadImportBackup(){
  if(!state.isAdmin||state.demo)throw new Error('관리자 계정에서만 운영 데이터를 반영할 수 있습니다.');
  if(state.importApplying)throw new Error('반영 중에는 백업을 다시 만들 수 없습니다.');
  const plan=importPlan();
  if(!plan.ops.length)throw new Error('변경할 문서가 없습니다. 선택 항목을 확인해 주세요.');
  const docs=[];
  for(const op of plan.ops){
    const snapshot=await state.db.doc(op.path).get();
    if(op.type==='create'&&snapshot.exists)throw new Error('신규 경로가 이미 등록되어 있습니다. 새로고침하고 비교해 주세요: '+op.path);
    if(op.type==='patch'&&!snapshot.exists)throw new Error('기존 기록이 확인되지 않습니다: '+op.path);
    docs.push({path:op.path,exists:!!snapshot.exists,previous:snapshot.exists?snapshot.data():null});
  }
  const backup={kind:'DMILLION CRM2 PRE-IMPORT BACKUP',createdAt:new Date().toISOString(),
    sourceFileName:state.importFileName,
    warning:'Contains confidential customer contacts; do not publish or share publicly.',
    records:plan.records,documents:docs};
  blobDownload('DMILLION_CRM2_import_backup_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(backup,null,2));
  state.importBackup={plan,docs,fingerprint:importBackupFingerprint(plan)};
  state.importBackupSaved=false;
  state.importResult=plan.ops.length+'개 변경 대상의 기존 데이터를 백업 파일로 내려받았습니다. 파일이 저장됐는지 확인해 주세요.';
  render();
}
async function commitImport(){
  if(!state.isAdmin||state.demo)throw new Error('관리자만 운영 데이터를 반영할 수 있습니다.');
  if(state.importApplying)throw new Error('다른 반영 작업이 진행 중입니다.');
  if(!state.importBackup||!state.importBackupSaved)throw new Error('백업 다운로드와 보관 확인이 필요합니다.');
  const currentPlan=importPlan();
  if(importBackupFingerprint(currentPlan)!==state.importBackup.fingerprint)
    throw new Error('선택한 항목이 바뀌었습니다. 백업을 다시 내려받아 주세요.');
  const {ops,counts}=currentPlan;
  if(!ops.length)throw new Error('반영할 내용이 없습니다.');
  if(!confirm(`선택된 ${counts.selected}개 업체의 ${ops.length}개 문서를 실제 운영 DB에 반영할까요?\n신규 업체 ${counts.new}곳, 연락처 문서 ${counts.contacts}건, 신규 업무 ${counts.tasks}건\n\n기존 업체·과제·미팅은 삭제하지 않습니다.`))return;
  state.importApplying=true;
  let completed=0;
  try{
    // Ensure the backup still describes the current DB state. Abort rather than overwrite other users' edits.
    for(const prev of state.importBackup.docs){
      const current=await state.db.doc(prev.path).get();
      if(!!current.exists!==prev.exists || (current.exists&&JSON.stringify(current.data())!==JSON.stringify(prev.previous)))
        throw new Error('다른 사용자가 변경한 데이터가 있습니다. 다시 비교·백업해 주세요: '+prev.path);
    }
    const progress=$('import-status');
    if(progress)progress.textContent='운영 DB 반영을 시작합니다…';
    for(const op of ops){
      const ref=state.db.doc(op.path);
      if(op.type==='patch')await ref.update(op.data);
      else await ref.set(op.data);
      completed++;
      if(progress)progress.textContent=`운영 DB 반영 중: ${completed} / ${ops.length}개 문서`;
    }
    state.importResult=`반영 완료: ${counts.selected}개 업체 · ${completed}개 문서. 원본 영업 이력은 유지했습니다.`;
    invalidateImportBackup();
    await loadLive();
    state.importPreview=getImportPreview(state.importRows,state.companies,state.profiles);
    state.importSelected.clear();
    toast('최신 고객사 자료를 운영 DB에 반영했습니다.');
  }catch(error){
    state.importResult=`반영 중단: ${completed}/${ops.length}개 처리. ${error.message} · 백업을 보관해 주세요.`;
    console.error('CRM import error',error);
    toast('운영 반영 오류: '+error.message,true);
  }finally{
    state.importApplying=false;
    render();
  }
}

function applyImportSession(){
  if(!state.importPreview.length)return;
  const summary=countImportResults(state.importPreview);
  if(!confirm(`${state.importRows.length}개 고객사의 분류를 브라우저 메모리에만 임시 반영합니다.\n신규 업체 ${summary.new}곳도 이 화면에만 추가되며, 서버에는 저장되지 않습니다. 계속할까요?`))return;
  let added=0;
  for(const item of state.importPreview){
    if(item.status==='change'||item.status==='same'){
      if(item.company){const id=cid(item.company);state.profiles[id]={...state.profiles[id],...profileFromRow(item.row),_id:id};}
    } else if(item.status==='new'){
      const id=`local-import-${item.index}`;
      if(!cc(id)){
        state.companies.push({_id:id,name:item.row.name,kind:'고객사',stage:item.row.excelStage||'리드',region:item.row.region});added++;
      }
      state.profiles[id]={...profileFromRow(item.row),_id:id};
    }
  }
  state.importSessionApplied=true;state.filters={q:'',grade:'',market:'',group:'',stage:'',sort:'name',hasTask:false};state.selectedId=state.companies.find(x=>x._id?.startsWith('local-import-'))?._id||state.selectedId;
  state.companyTab='overview';state.screen='accounts';render();toast(`브라우저에 임시 적용했습니다. 신규 ${added}곳 · 서버 DB 변경 없음.`);
}

// Event delegation keeps the UI functional after re-renders.
document.addEventListener('click',async e=>{
  const closer=e.target.closest('[data-close]');if(closer){closeModal();return;}
  const nav=e.target.closest('[data-nav]');
  if(nav){state.screen=nav.dataset.nav;state.companyTab='overview';document.querySelector('.sidebar').classList.remove('open');render();return;}
  if(e.target.closest('a[href^="tel:"], a[href^="mailto:"]'))return;
  const a=e.target.closest('[data-action]');if(!a)return;
  const action=a.dataset.action,id=a.dataset.id;
  try{
    if(action==='select-company')selectCompany(id,true);
    else if(action==='go-company')selectCompany(id,false);
    else if(action==='company-tab'){
      state.companyTab=a.dataset.tab;
      if(!updateCompanyDetailOnly())render();
    }
    else if(action==='open-import'){state.screen='import';render();}
    else if(action==='edit-profile')profileModal();
    else if(action==='edit-needs')needsModal();
    else if(action==='format-needs'){
      const raw=$('crm2NeedsSource'),summary=$('crm2NeedsSummary');
      if(raw&&summary){summary.value=formatNeedsForCRM(raw.value);updateNeedsPreview();summary.focus();}
    }
    else if(action==='new-opportunity')opportunityModal();
    else if(action==='edit-opportunity')opportunityModal(id);
    else if(action==='new-task')taskModal();
    else if(action==='convert-legacy-actions')await convertLegacyActions();
    else if(action==='complete-task')await completeTask(id);
    else if(action==='delete-task')await deleteTask(id);
    else if(action==='restore-task')await restoreTask(id);
    else if(action==='pick-file')$('import-file')?.click();
    else if(action==='export-diff')exportDiff();
    else if(action==='apply-session')applyImportSession();
    else if(action==='import-select-matched'){
      state.importSelected=new Set(state.importPreview.filter(x=>x.company&&x.status!=='conflict').map(x=>x.index));
      invalidateImportBackup();render();
    } else if(action==='import-select-all'){
      state.importSelected=new Set(state.importPreview.filter(x=>x.status!=='conflict').map(x=>x.index));
      invalidateImportBackup();render();
    } else if(action==='import-select-clear'){
      state.importSelected.clear();invalidateImportBackup();render();
    } else if(action==='import-backup')await downloadImportBackup();
    else if(action==='import-commit')await commitImport();
  }catch(error){console.error(error);toast(error.message,true);}
});
document.addEventListener('change',async e=>{
  const id=e.target.id;
  if(e.target.matches('[data-import-index]')){
    const index=Number(e.target.dataset.importIndex);
    if(e.target.checked)state.importSelected.add(index);else state.importSelected.delete(index);
    invalidateImportBackup();render();return;
  }
  if(id==='import-backup-saved'){
    state.importBackupSaved=e.target.checked;render();return;
  }
  if(id==='import-replace-contacts'||id==='import-include-tasks'){
    state.importOptions[id==='import-replace-contacts'?'replaceContacts':'includeTasks']=e.target.checked;
    invalidateImportBackup();render();return;
  }
  const filters={'f-grade':'grade','f-market':'market','f-group':'group','f-sort':'sort','f-task':'hasTask'};
  if(filters[id]){
    state.filters[filters[id]]=id==='f-task'?e.target.checked:e.target.value;
    render();
    const list=$main.querySelector('.account-layout .table-scroll');
    if(list)list.scrollTop=0; // Intentional: new filter results begin at first row.
    return;
  }
  if(id==='opp-filter'){state.oppFilter=e.target.value;render();}
  if(id==='activity-filter'){state.activityFilter=e.target.value;render();}
  if(id==='import-filter'){state.importFilter=e.target.value;render();}
  if(id==='import-file'){
    try{await readImportFile(e.target.files[0]);}
    catch(error){console.error(error);toast(error.message,true);}
    e.target.value='';
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='crm2NeedsSource'||e.target.id==='crm2NeedsSummary'){
    updateNeedsPreview();return;
  }
  if(e.target.id!=='f-q')return;
  const input=e.target,pos=input.selectionStart;state.filters.q=input.value;
  render();
  const list=$main.querySelector('.account-layout .table-scroll');
  if(list)list.scrollTop=0; // Intentional for a new search.
  const next=$('f-q');next?.focus();if(next&&pos!==null)next.setSelectionRange(pos,pos);
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeModal();document.querySelector('.sidebar').classList.remove('open');}
  if(e.key==='Enter'&&e.target.matches('tr[data-action="select-company"]')){
    e.preventDefault();selectCompany(e.target.dataset.id,true);
  }
});
$('refreshBtn').onclick=refresh;
$('mobileMenu').onclick=()=>document.querySelector('.sidebar').classList.toggle('open');

boot();