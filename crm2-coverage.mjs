import {plain, remainingLegacyActions, isMeetingActivity, programCategories} from './crm2-core.mjs?v=20261030-coverage-1';

export const COVERAGE_STATES = [
  ['all','전체 고객'],['uncontacted','접촉 기록 없음'],['stale','장기 미접촉'],
  ['followup','후속 조치 필요'],['healthy','관리 정상'],['waiting','보류·재접촉 대기'],
  ['review','기록 확인 필요']
];
export const BUSINESS_GROUPS = [['lead','신규 발굴'],['qualification','니즈 확인'],
  ['proposal','제안·견적'],['delivery','계약·수행'],['hold','보류·종료'],['unknown','분류 확인']];
const CONTACT_TYPES = new Set(['첫 미팅','현장 방문','내방','화상','화상 미팅','대면 미팅','미팅','제안·발표','메일','이메일','통화','전화','문자']);
const CLOSED_TASKS = new Set(['done','cancelled','deleted']);
const idOf = x => x._id || x.id;

export function dayKey(value) {
  if (!value) return null;
  const text = String(value), match = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (!match || !Number.isFinite(Date.parse(text))) return null;
  if (new Date(match[0]+'T00:00:00Z').toISOString().slice(0,10)!==match[0]) return null;
  // Date-only values stay local dates; timestamp values use the business timezone.
  if (text.length === 10 || !/(?:Z|[+-]\d\d:\d\d)$/.test(text)) return match[0];
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(text));
}
export function businessGroup(company) {
  const stage = plain(company.stage);
  if (['보류','드랍·탈락','실패','종료'].includes(stage)) return 'hold';
  if (['계약','선정','수행 중','수행','완료'].includes(stage)) return 'delivery';
  if (['제안','제안·견적','협상'].includes(stage)) return 'proposal';
  if (['컨택 중','첫 미팅','현장 방문','요구 확인','과제신청 준비'].includes(stage)) return 'qualification';
  if (['리드','발굴'].includes(stage)) return 'lead';
  return 'unknown';
}
const indexByCompany = rows => {
  const map = new Map();
  for (const row of rows) {const list=map.get(row.companyId)||[];list.push(row);map.set(row.companyId,list);}
  return map;
};

/** A read-only view of existing records. No persistence or inferred customer facts. */
export function buildCoverage(companies, profiles={}, activities=[], tasks=[], settings={}) {
  const today=dayKey(settings.today)||dayKey(new Date().toISOString());
  const threshold=[14,30,60,90].includes(Number(settings.threshold))?Number(settings.threshold):30;
  const actsBy=indexByCompany(activities),tasksBy=indexByCompany(tasks);
  const rows=companies.map(company=>{
    const id=idOf(company), profile=profiles[id]||{}, acts=actsBy.get(id)||[], companyTasks=tasksBy.get(id)||[];
    const group=businessGroup(company), owner=plain(company.owner), issues=[];
    const contacts=acts.filter(a=>{
      if (['예정','취소','cancelled','deleted'].includes(a.status)) return false;
      if (!CONTACT_TYPES.has(a.type)&&!a.meetingRecord) return false;
      const date=dayKey(a.date||a.at);
      if (!date) {issues.push('접촉 기록 날짜 확인');return false;}
      if (date>today) {issues.push('완료 접촉일이 미래 날짜');return false;}
      return true;
    }).sort((a,b)=>dayKey(b.date||b.at).localeCompare(dayKey(a.date||a.at)));
    const lastContact=contacts.length?dayKey(contacts[0].date||contacts[0].at):null;
    const days=lastContact?Math.round((Date.parse(today)-Date.parse(lastContact))/86400000):null;
    const activeTasks=companyTasks.filter(t=>!CLOSED_TASKS.has(t.status));
    const pending=activeTasks.map(t=>({title:plain(t.title)||'내용 확인 필요',due:dayKey(t.dueAt),source:'task',raw:t}));
    // All unconverted legacy actions remain visible even when a newer task exists.
    const legacy=remainingLegacyActions(company,companyTasks);
    for (const part of legacy) pending.push({title:part.text,due:legacy.length===1?dayKey(company.nextDate):null,source:'legacy'});
    // Legacy activity follow-ups may exist independently of CRM tasks.
    for (const activity of acts) {
      if (['취소','cancelled','deleted','예정'].includes(activity.status)||activity.nextDone||!plain(activity.nextAction)) continue;
      const date=dayKey(activity.date||activity.at);
      if (!date||date>today) continue;
      if (companyTasks.some(t=>(idOf(activity)&&t.sourceActivityId===idOf(activity))||plain(t.title)===plain(activity.nextAction))) continue;
      if (pending.some(p=>p.title===plain(activity.nextAction))) continue;
      pending.push({title:plain(activity.nextAction),due:dayKey(activity.nextDue),source:'activity'});
    }
    const meetings=acts.filter(a=>a.status==='예정'&&isMeetingActivity(a)&&dayKey(a.date||a.at)>=today)
      .map(a=>({title:a.title||a.type||'예정 미팅',due:dayKey(a.date||a.at),source:'meeting'}));
    const actions=[...pending,...meetings].sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
    const overdue=pending.filter(p=>p.due&&p.due<today).length;
    const undated=pending.filter(p=>!p.due).length;
    const holdReason=plain(profile.stallReason)||[plain(company.outcomeReason),plain(company.outcomeNote)].filter(Boolean).join(' · ');
    const waiting=group==='hold'||profile.outreachBucket==='차년도 공고 때 연락';
    if (!lastContact&&group!=='lead'&&group!=='unknown'&&group!=='hold') issues.push('진행 단계는 있으나 접촉 기록 없음');
    if (group==='unknown') issues.push('영업 분류 확인');
    let status,reason;
    if (issues.length) {status='review';reason=[...new Set(issues)].join(' · ');}
    else if (overdue) {status='followup';reason=`기한 지난 업무 ${overdue}건`;}
    else if (waiting) {
      status='waiting';reason=holdReason?`사유: ${holdReason}`:plain(profile.contactReason)||'보류·재접촉 사유 확인 필요';
      if (!actions.length) reason+=' · 재접촉 여부·시점 확인';
    }
    else if (!lastContact) {status='uncontacted';reason='완료된 고객 접촉 기록 없음 · 실제 접촉 여부 확인';}
    else if (days>threshold) {status='stale';reason=`마지막 접촉 후 ${days}일 · 기준 ${threshold}일 초과`;}
    else if (!owner||undated||!actions.length) {
      status='followup';reason=[!owner?'내부 담당 미지정':'',undated?`기한 없는 업무 ${undated}건`:'',!actions.length?'다음 할 일·일정 없음':''].filter(Boolean).join(' · ');
    }
    else {status='healthy';reason='담당 배정 · 최근 접촉 · 다음 일정 등록 · 기한 초과 없음';}
    return {company,id,profile,owner,group,status,reason,lastContact,days,contactCount:contacts.length,
      actions,overdue,undated,threshold,categories:programCategories(profile)};
  });
  return rows;
}

export function filterCoverage(rows,filters={}) {
  return rows.filter(r=>{
    if (filters.kind!=='all'&&(filters.kind==='partner'?r.company.kind!=='협력사':r.company.kind==='협력사')) return false;
    if (filters.status&&filters.status!=='all'&&r.status!==filters.status) return false;
    if (filters.group&&r.group!==filters.group) return false;
    if (filters.owner==='__none'&&r.owner) return false;
    if (filters.owner&&filters.owner!=='__none'&&r.owner!==filters.owner) return false;
    if (filters.market&&!r.categories.includes(filters.market)) return false;
    const q=String(filters.q||'').trim().toLocaleLowerCase('ko');
    return !q||[r.company.name,r.owner,r.company.industry,r.company.stage,...r.categories,r.reason,...r.actions.map(a=>a.title)].join(' ').toLocaleLowerCase('ko').includes(q);
  }).sort((a,b)=>{
    if(filters.sort==='name') return String(a.company.name).localeCompare(String(b.company.name),'ko');
    if(filters.sort==='last') return (a.lastContact||'0000').localeCompare(b.lastContact||'0000')||String(a.company.name).localeCompare(String(b.company.name),'ko');
    const rank={review:0,uncontacted:1,followup:2,stale:3,healthy:4,waiting:5};
    return rank[a.status]-rank[b.status]||b.overdue-a.overdue||(b.days??-1)-(a.days??-1)||String(a.company.name).localeCompare(String(b.company.name),'ko');
  });
}
