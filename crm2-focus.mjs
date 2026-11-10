/* Read-only customer focus model. No inferred contact, deadlines or waiting states. */
import {plain, remainingLegacyActions, isMeetingActivity, isOpportunityOpen, relatedProjects} from './crm2-core.mjs';
import {dayKey} from './crm2-coverage.mjs';
import {matchesKoreanSearch} from './crm2-search.mjs';
import {PROGRESS_STAGES} from './crm2-timeline.mjs';

const CONTACT_TYPES = new Set(['메일','이메일','통화','전화','문자']);
// Empty status is the existing legacy completed-activity convention.
const COMPLETED_CONTACT = new Set(['','완료','done','completed']);
const CLOSED_TASK = new Set(['done','completed','cancelled','canceled','deleted','완료','취소','삭제']);
const PLANNED = new Set(['예정','planned','scheduled']);
const ACTIVE_STAGE = new Set(['컨택 중','첫 미팅','현장 방문','요구 확인','과제신청 준비','제안','제안·견적','협상','계약','선정','수행 중','수행','qualification','proposal','negotiation']);
const ACTIVE_PROGRESS_STAGE = new Set(['meeting','visit','qualification','proposal','negotiation','won']);
const PROGRESS_LABELS = Object.fromEntries(PROGRESS_STAGES);
const ACTIVE_PROJECT = new Set(['진행','진행 중','수행','수행 중','신청 중','준비 중','진행중','수행중','active','ongoing','in_progress']);
const idOf = row => row?._id || row?.id || null;
const statusOf = row => plain(row.status).toLowerCase();
const cmp = (a,b) => String(a??'').localeCompare(String(b??''),'ko');
const byCompany = rows => {
  const index = new Map();
  for (const row of rows) {
    if (!index.has(row.companyId)) index.set(row.companyId,[]);
    index.get(row.companyId).push(row);
  }
  return index;
};
const actionOrder = (a,b) => cmp(a.due||'9999',b.due||'9999') || cmp(a.title,b.title) || cmp(a.id,b.id);
const action = (title,due,source,raw,extras={}) => ({
  title:plain(title), id:idOf(raw), taskId:source==='task'?idOf(raw):null,
  status:plain(raw?.status)||null, due:dayKey(due), dueAt:dayKey(due),
  rawDue:due||null, source, raw, ...extras
});

/**
 * buildFocusRows(state, {today, query='', filter='all'}) -> {rows, allRows, counts}.
 * all is the focus pool (contact in last 30 days OR explicit current work),
 * action is customers with a pending action, contacted is any actual contact.
 * Partners are excluded from all three. Counts are after query, before filter.
 * Rows retain original records; this function never mutates state.
 * next/actions: {title,id,taskId,status,due,dueAt,rawDue,source,raw}; dates are
 * validated Seoul day keys or null. rawDue preserves missing/invalid source data.
 * priority: 0 overdue, 1 due today, 2 due within 7 days, 3 undated action,
 * 4 later dated action, 5 no action. summary belongs only to latestContact, never a newer note/edit.
 */
export function buildFocusRows(state={}, {today,query='',filter='all'}={}) {
  today=dayKey(today)||dayKey(new Date().toISOString());
  const tasksBy=byCompany(state.tasks||[]), actsBy=byCompany(state.activities||[]);
  const oppsBy=byCompany(state.opportunities||[]);
  const candidates=(state.companies||[]).filter(c=>c.kind!=='협력사').map(company=>{
    const id=idOf(company), tasks=tasksBy.get(id)||[], acts=actsBy.get(id)||[];
    const contacts=acts.filter(a=>COMPLETED_CONTACT.has(statusOf(a)) &&
      (CONTACT_TYPES.has(a.type)||isMeetingActivity(a)) &&
      dayKey(a.date||a.at) && dayKey(a.date||a.at)<=today)
      .sort((a,b)=>cmp(dayKey(b.date||b.at),dayKey(a.date||a.at)) ||
        cmp(b.date||b.at,a.date||a.at) || cmp(idOf(a),idOf(b)));
    const latestContact=contacts[0]||null;
    const lastContact=latestContact?dayKey(latestContact.date||latestContact.at):null;
    const days=lastContact?Math.round((Date.parse(today)-Date.parse(lastContact))/86400000):null;
    const recent=days!==null&&days>=0&&days<=30;
    const activeTasks=tasks.filter(t=>!CLOSED_TASK.has(statusOf(t)));
    const actions=activeTasks.map(t=>action(t.title,t.dueAt,'task',t));
    const legacy=remainingLegacyActions(company,tasks);
    for(const part of legacy) actions.push(action(part.text,legacy.length===1?company.nextDate:null,'legacy',company,{id:part.key,status:null}));
    for(const a of acts) {
      const title=plain(a.nextAction), date=dayKey(a.date||a.at);
      if(!COMPLETED_CONTACT.has(statusOf(a))||a.nextDone||!title||!date||date>today) continue;
      // Check ALL tasks, including completed/deleted conversions, to avoid resurrection.
      if(tasks.some(t=>(idOf(a)&&t.sourceActivityId===idOf(a))||plain(t.title)===title)) continue;
      if(actions.some(t=>t.title===title)) continue;
      actions.push(action(title,a.nextDue,'activity',a));
    }
    const meetings=acts.filter(a=>PLANNED.has(statusOf(a))&&isMeetingActivity(a)&&
      dayKey(a.date||a.at)&&dayKey(a.date||a.at)>=today);
    for(const a of meetings) actions.push(action(a.title||a.type,a.date||a.at,'meeting',a));
    actions.sort(actionOrder);
    const next=actions[0]||null;
    const overdue=actions.filter(a=>a.source!=='meeting'&&a.due&&a.due<today).length;
    const openOpportunityCount=(oppsBy.get(id)||[]).filter(o=>isOpportunityOpen(o)&&
      !['hold','보류','완료','종료','실패'].includes(plain(o.stage))&&
      !CLOSED_TASK.has(statusOf(o))).length;
    const activeProjectCount=relatedProjects(id,state.projects||[]).filter(p=>ACTIVE_PROJECT.has(plain(p.status||p.stage).toLowerCase())).length;
    const progress=state.profiles?.[id]?.yearProgress?.[today.slice(0,4)];
    const savedStage=!!progress&&Object.prototype.hasOwnProperty.call(progress,'stage');
    const activeStage=savedStage?ACTIVE_PROGRESS_STAGE.has(plain(progress.stage)):ACTIVE_STAGE.has(plain(company.stage));
    const stageLabel=savedStage?(PROGRESS_LABELS[plain(progress.stage)]||plain(progress.stage)):plain(company.stage);
    const inFocus=recent||actions.length>0||openOpportunityCount>0||activeProjectCount>0||activeStage;
    const reasons=[overdue?`기한 지난 업무 ${overdue}건`:'',
      activeTasks.length?`진행 업무 ${activeTasks.length}건`:'',
      meetings.length?`예정 미팅 ${meetings.length}건`:'',
      actions.some(a=>['legacy','activity'].includes(a.source))?'기존 후속 조치':'',
      openOpportunityCount?`진행 영업 기회 ${openOpportunityCount}건`:'',
      activeProjectCount?`진행 과제 ${activeProjectCount}건`:'',
      recent?`최근 접촉 ${days}일 전`:'',activeStage?`진행 단계: ${stageLabel}`:''].filter(Boolean);
    return {id,companyId:id,company,name:plain(company.name),latestContact,
      summary:latestContact?plain(latestContact.summary)||plain(latestContact.content)||plain(latestContact.report?.purpose)||plain(latestContact.purpose):'',
      lastContact,days,contactCount:contacts.length,recent,inFocus,next,actions,overdue,
      activeTaskCount:activeTasks.length,openOpportunityCount,activeProjectCount,
      reason:reasons.join(' · ')||(lastContact?'과거 접촉 기록':''),
      priority:overdue?0:next?.due===today?1:next?.due&&Math.round((Date.parse(next.due)-Date.parse(today))/86400000)<=7?2:next&&!next.due?3:next?4:5};
  });
  const allRows=candidates;
  const matching=candidates.filter(row=>matchesKoreanSearch([row.name,row.company.owner,row.company.stage,row.summary,row.reason,...row.actions.map(a=>a.title)].join(' '),query));
  const counts={focus:matching.filter(r=>r.inFocus).length,action:matching.filter(r=>r.next).length,
    contacted:matching.filter(r=>r.contactCount>0).length,overdue:matching.filter(r=>r.overdue>0).length,shown:0};
  counts.all=counts.focus;
  const rows=matching.filter(r=>filter==='contacted'?r.contactCount>0:filter==='action'?!!r.next:r.inFocus)
    .sort((a,b)=>a.priority-b.priority||cmp(a.next?.due||'9999',b.next?.due||'9999')||
      cmp(b.lastContact,a.lastContact)||cmp(a.name,b.name)||cmp(a.id,b.id));
  counts.shown=rows.length;
  return {rows,allRows,counts};
}
