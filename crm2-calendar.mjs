// Work Center schedules are read-only plans, never completed sales activities.
const clean=value=>String(value??'').trim();
const escape=value=>clean(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const validDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const validTime=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function seoulDay(now=new Date()){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function calendarEvent(raw){
  const sourceId=clean(raw.sourceId),startDate=clean(raw.startDate),endDate=clean(raw.endDate)||startDate;
  if(!/^[0-9]+$/.test(sourceId)||!clean(raw.title)||!validDay(startDate)||!validDay(endDate)||endDate<startDate)return null;
  const allDay=raw.allDay===true;
  return {source:'workcenter',sourceId,title:clean(raw.title),startDate,endDate,
    startTime:!allDay&&validTime(clean(raw.startTime))?clean(raw.startTime):'',
    endTime:!allDay&&validTime(clean(raw.endTime))?clean(raw.endTime):'',allDay,
    attendees:[...new Set((Array.isArray(raw.attendees)?raw.attendees:[]).map(clean).filter(Boolean))]};
}
export function calendarRows(events,{period='week',attendee='',today=seoulDay()}={}){
  const end=new Date(today+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+6);
  const until=period==='today'?today:end.toISOString().slice(0,10),unique=new Map();
  for(const raw of events){const event=calendarEvent(raw);if(event)unique.set(event.sourceId,event);}
  return [...unique.values()].filter(e=>(!attendee||e.attendees.includes(attendee))&&(period==='all'||e.endDate>=today&&e.startDate<=until))
    .sort((a,b)=>a.startDate.localeCompare(b.startDate)||(a.allDay?'':a.startTime||'99:99').localeCompare(b.allDay?'':b.startTime||'99:99')||a.sourceId.localeCompare(b.sourceId));
}
export function calendarWhen(event){
  const dates=event.startDate===event.endDate?event.startDate:`${event.startDate} ~ ${event.endDate}`;
  return `${dates} · ${event.allDay?'종일':event.startTime?event.startTime+(event.endTime?' ~ '+event.endTime:' (종료 미정)'):'시간 미정'}`;
}
export function calendarHealth(sync,now=new Date()){
  if(!sync?.lastSuccess)return '아직 가져온 일정이 없습니다.';
  const last=new Date(sync.lastSuccess),age=now-last;
  if(Number.isNaN(last.getTime()))return '최근 확인 시각을 확인할 수 없습니다.';
  const time=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(last);
  const warning=sync.lastError?' · 최근 수집 실패 — 원본 확인 필요':age>24*60*60*1000?' · 하루 이상 지난 일정 — 원본 확인 필요':'';
  return `최근 확인 ${time}${warning}`;
}
export function renderCalendar({events=[],sync=null,error='',period='week',attendee='',demo=false}={}){
  const names=[...new Set(events.flatMap(e=>Array.isArray(e.attendees)?e.attendees:[]).concat(attendee?[attendee]:[]))].sort((a,b)=>a.localeCompare(b,'ko'));
  const rows=calendarRows(events,{period,attendee});
  const coverage=sync?.coverageStart&&sync?.coverageEnd?` · 수집 범위 ${escape(sync.coverageStart)} ~ ${escape(sync.coverageEnd)}`:'';
  return `<section class="panel crm-calendar" aria-label="팀 일정"><div class="panel-head"><div><h2 class="panel-title">팀 일정</h2><p class="panel-subtitle">${demo?'가상 일정 예시':escape(calendarHealth(sync))}${coverage}</p></div><a class="btn secondary" href="https://workcenter.52.78.54.36.sslip.io/calendar" target="_blank" rel="noopener noreferrer">업무센터 원본 보기</a></div>
    <div class="panel-body"><div class="crm-calendar-filters"><label>기간<select id="calendar-period" aria-label="기간"><option value="today"${period==='today'?' selected':''}>오늘</option><option value="week"${period==='week'?' selected':''}>오늘부터 7일</option><option value="all"${period==='all'?' selected':''}>가져온 전체 일정</option></select></label><label>참석자<select id="calendar-attendee" aria-label="참석자"><option value="">팀 전체</option>${names.map(name=>`<option value="${escape(name)}"${attendee===name?' selected':''}>${escape(name)}</option>`).join('')}</select></label><span class="muted tiny">${rows.length}건 · 일정 경과만으로 완료 처리하지 않습니다.</span></div>
    ${error?'<p role="alert" class="muted">일정 조회에 실패했습니다. 새로고침하거나 업무센터 원본을 확인해 주세요.</p>':''}
    <div class="flow-list">${rows.map(event=>`<article class="flow-card"><div><h3>${escape(event.title)}</h3><p>${escape(calendarWhen(event))}</p><p class="muted tiny">참석자: ${escape(event.attendees.join(', ')||'미지정')}</p></div><span class="pill outline">등록 일정</span></article>`).join('')||`<div class="empty-state"><p>${error?'일정을 확인할 수 없습니다.':!sync?.lastSuccess&&!demo?'팀 캘린더를 아직 가져오지 않았습니다.':'선택한 범위에 가져온 일정이 없습니다.'}</p><p class="muted tiny">${attendee?'참석자가 지정되지 않은 공통 일정은 팀 전체에서 확인하세요.':'원본의 신규·변경 일정은 다음 동기화 후 표시됩니다.'}</p></div>`}</div>
    <p class="muted tiny">외부 일정만 표시합니다. 과제의 행정 일정·아젠다는 기존 수행 과제에서 확인합니다. 미팅 결과는 활동 이력에 별도로 기록해 주세요.</p></div></section>`;
}
