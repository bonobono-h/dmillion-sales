/* 영업 실적(목표 대비) 계산. 화면 표시용 읽기 전용 계산이며 DB에 쓰지 않습니다. */
import {activityDate,activityEventDate,canCountActivity} from './crm2-core.mjs?v=20261110-conversation-1';
import {timelineDay} from './crm2-timeline.mjs?v=20261110-conversation-1';

export const AGREED_STAGES = ['negotiation','won'];
export const GOAL_DOC_PREFIX = 'sales-';
const DAY_MS = 86400000;
const MEETING_TYPES = ['첫 미팅','현장 방문','요구 확인','내방','화상','화상 미팅','대면 미팅','미팅','제안·발표','발표'];

const norm = s => String(s ?? '').normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase('ko');
const num = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

function addDays(day, n) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0,10);
}

/** 서울 기준 월요일~일요일 */
export function weekRange(today) {
  const day = timelineDay(today) || timelineDay(new Date());
  const dow = new Date(day + 'T00:00:00Z').getUTCDay(); // 0=일
  const start = addDays(day, dow === 0 ? -6 : 1 - dow);
  return {start, end: addDays(start, 6)};
}

function inRange(value, start, end) {
  const d = timelineDay(value);
  return !!d && d >= start && d <= end;
}

/** targets 컬렉션에서 영업 목표 문서만 골라, 오늘이 포함된 기간 → 가장 최근 시작 순으로 정렬 */
export function pickGoal(goals = [], today) {
  const day = timelineDay(today) || timelineDay(new Date());
  const list = goals.filter(g => g && g.kind === 'salesGoal' && Array.isArray(g.programs));
  const current = list.filter(g => (!g.start || g.start <= day) && (!g.end || g.end >= day));
  const sorted = (current.length ? current : list).slice().sort((a,b) => String(b.start||'').localeCompare(String(a.start||'')));
  return sorted[0] || null;
}

export function programOf(opp = {}, goal = null) {
  const raw = String(opp.program ?? '').trim();
  if (!raw) return '';
  const match = goal?.programs?.find(p => norm(p.name) === norm(raw));
  return match ? match.name : raw;
}

function stageMovesInWeek(opportunities, start, end) {
  const out = [];
  for (const o of opportunities) {
    const hist = Array.isArray(o.stageHistory) ? o.stageHistory : [];
    for (const h of hist) {
      if (h && h.to && inRange(h.at, start, end)) out.push({opp: o, from: h.from || null, to: h.to, at: h.at});
    }
  }
  return out.sort((a,b) => String(a.at).localeCompare(String(b.at)));
}

export function buildPerformance({goal = null, opportunities = [], activities = [], tasks = [], today} = {}) {
  const day = timelineDay(today) || timelineDay(new Date());
  const week = weekRange(day);
  const nextWeek = {start: addDays(week.start, 7), end: addDays(week.end, 7)};
  const live = opportunities.filter(o => o && o.status !== 'deleted');

  const programs = (goal?.programs || []).map(p => {
    const mine = live.filter(o => norm(o.program) === norm(p.name));
    const agreed = mine.filter(o => AGREED_STAGES.includes(o.stage));
    const won = mine.filter(o => o.stage === 'won');
    const open = mine.filter(o => !['won','lost'].includes(o.stage));
    const targetCount = num(p.count);
    const amountPerDeal = num(p.amountPerDeal);
    return {
      name: p.name, targetCount, amountPerDeal, targetAmount: targetCount * amountPerDeal,
      opportunities: mine, agreed, won, open,
      agreedCount: agreed.length, wonCount: won.length,
      remainingAgreed: Math.max(0, targetCount - agreed.length),
      remainingWon: Math.max(0, targetCount - won.length),
      wonAmount: won.reduce((s,o) => s + num(o.estimatedAmount), 0),
      pipelineAmount: open.reduce((s,o) => s + num(o.estimatedAmount), 0),
      missingAmount: mine.filter(o => o.estimatedAmount === null || o.estimatedAmount === undefined || o.estimatedAmount === '').length
    };
  });

  const goalNames = new Set(programs.map(p => norm(p.name)));
  const unassigned = live.filter(o => !['won','lost'].includes(o.stage) && !goalNames.has(norm(o.program)));

  const targetCount = programs.reduce((s,p) => s + p.targetCount, 0);
  const sumTargetAmount = programs.reduce((s,p) => s + p.targetAmount, 0);
  const targetAmount = num(goal?.revenueTarget) || sumTargetAmount;
  const totals = {
    targetCount, targetAmount,
    agreedCount: programs.reduce((s,p) => s + p.agreedCount, 0),
    wonCount: programs.reduce((s,p) => s + p.wonCount, 0),
    wonAmount: programs.reduce((s,p) => s + p.wonAmount, 0),
    pipelineAmount: programs.reduce((s,p) => s + p.pipelineAmount, 0)
  };
  totals.remainingAgreed = Math.max(0, targetCount - totals.agreedCount);
  totals.remainingWon = Math.max(0, targetCount - totals.wonCount);
  totals.remainingAmount = Math.max(0, targetAmount - totals.wonAmount);

  let daysLeft = null, weeksLeft = null;
  if (goal?.end && goal.end >= day) {
    daysLeft = Math.round((new Date(goal.end + 'T00:00:00Z') - new Date(day + 'T00:00:00Z')) / DAY_MS);
    weeksLeft = Math.ceil((daysLeft + 1) / 7);
  } else if (goal?.end) { daysLeft = 0; weeksLeft = 0; }

  const weekActs = activities
    .filter(a => a && canCountActivity(a) && a.status !== '취소' && a.status !== '예정' && inRange(activityDate(a), week.start, week.end))
    .sort((a,b) => String(activityDate(a)).localeCompare(String(activityDate(b))));
  const thisWeek = {
    ...week,
    activities: weekActs,
    meetings: weekActs.filter(a => a.meetingRecord === true || MEETING_TYPES.includes(a.type)),
    contacts: weekActs.filter(a => !(a.meetingRecord === true || MEETING_TYPES.includes(a.type))),
    stageMoves: stageMovesInWeek(live, week.start, week.end),
    newOpportunities: live.filter(o => inRange(o.createdAt, week.start, week.end)),
    doneTasks: tasks.filter(t => t && t.status === 'done' && inRange(t.completedAt, week.start, week.end))
  };
  const openTasks = tasks.filter(t => t && !['done','cancelled','deleted'].includes(t.status));
  const upcoming = {
    ...nextWeek,
    tasks: openTasks.filter(t => inRange(t.dueAt, day, nextWeek.end)).sort((a,b) => String(a.dueAt).localeCompare(String(b.dueAt))),
    overdue: openTasks.filter(t => { const d = timelineDay(t.dueAt); return d && d < day; }),
    planned: activities.filter(a => a && canCountActivity(a) && a.status === '예정' && inRange(activityEventDate(a), day, nextWeek.end))
  };

  return {day, goal, programs, totals, unassigned, daysLeft, weeksLeft, thisWeek, upcoming};
}

/** 영업 기회 단계가 바뀔 때 남길 이력 (최근 30건 유지) */
export function appendStageHistory(current = {}, nextStage, at = new Date().toISOString()) {
  const hist = Array.isArray(current.stageHistory) ? current.stageHistory.slice() : [];
  const from = current.stage || null;
  if (from === nextStage && hist.length) return hist;
  hist.push({from, to: nextStage, at});
  return hist.slice(-30);
}

export function goalDocId(start) {
  const d = timelineDay(start);
  if (!d) return GOAL_DOC_PREFIX + 'goal';
  const q = Math.floor((Number(d.slice(5,7)) - 1) / 3) + 1;
  return `${GOAL_DOC_PREFIX}${d.slice(0,4)}Q${q}`;
}

