/* Pure, read-only stage board. Activity and task data never determine a stage. */
import {plain, safeText} from './crm2-core.mjs';
import {dayKey} from './crm2-coverage.mjs';
import {PROGRESS_STAGES} from './crm2-timeline.mjs';

export const BOARD_STAGES = Object.freeze([
  ['lead','신규 발굴','neutral'], ['contact','컨택 중','orange'], ['meeting','미팅·방문','blue'],
  ['needs','니즈 확인','violet'], ['proposal','제안·견적','purple'], ['negotiation','협상','orange'],
  ['contract','계약·선정','green'], ['execution','수행·완료','green'], ['hold','보류·종료','neutral'],
  ['other','분류 확인','neutral']
].map(([key,label,tone])=>Object.freeze({key,label,tone})));

const PROGRESS_LABELS = Object.fromEntries(PROGRESS_STAGES);
const normalize = value => plain(value).normalize('NFKC').toLowerCase();
// Explicit existing values only: unrelated/custom text is never substring-matched.
// Identity is finer than column: first meeting -> site visit is a real change.
const STAGE_VALUES = [
  ['lead','discovery',['리드','발굴','discovery']],
  ['contact','contact',['컨택 중']],
  ['meeting','meeting',['첫 미팅','meeting']],
  ['meeting','visit',['현장 방문','visit']],
  ['needs','qualification',['요구 확인','qualification']],
  ['needs','application_preparation',['과제신청 준비']],
  ['proposal','proposal',['제안','제안·견적','proposal']],
  ['negotiation','negotiation',['협상','negotiation']],
  ['contract','contract',['계약']],
  ['contract','selected',['선정']],
  ['contract','won',['수주','won']],
  ['execution','execution',['수행 중','수행']],
  ['execution','completed',['완료']],
  ['hold','hold',['보류','hold']],
  ['hold','lost',['실패','lost']],
  ['hold','dropped',['드랍·탈락','드랍']],
  ['hold','closed',['종료']],
  ['other','not_started',['미진행','not_started']]
];
const STAGE_MAP = new Map(STAGE_VALUES.flatMap(([key,identity,values])=>
  values.map(value=>[normalize(value),{key,identity}])));
const identify = value => {
  const raw=normalize(value);
  return STAGE_MAP.get(raw)||{key:'other',identity:raw?'custom:'+raw:null};
};
const has = (object,key) => Object.prototype.hasOwnProperty.call(object,key);

const AGE_REASONS = {
  'missing-stage':'현재 단계가 기록되어 있지 않습니다.',
  'missing-history':'단계 변경 이력이 없어 머문 기간을 확인할 수 없습니다.',
  'invalid-history':'단계 변경 이력의 단계 정보를 확인해야 합니다.',
  'invalid-timestamp':'단계 변경일이 없거나 올바른 날짜가 아닙니다.',
  'future-timestamp':'미래 날짜의 단계 변경 이력이 있어 기간을 확인할 수 없습니다.',
  'conflicting-history':'단계 변경 이력의 순서나 이전 단계가 서로 맞지 않습니다.',
  'current-stage-mismatch':'마지막 변경 이력과 현재 단계가 일치하지 않습니다.',
  'repeated-only':'같은 단계의 갱신만 있어 처음 진입한 날짜를 확인할 수 없습니다.',
  'invalid-today':'기준 날짜가 올바르지 않아 기간을 확인할 수 없습니다.',
  'known':'기록된 현재 단계 진입일 기준입니다.'
};
const unknownAge = status => ({stageAgeDays:null,stageSince:null,
  stageAgeStatus:status,stageAgeReason:AGE_REASONS[status]});

function timestamp(value) {
  if(typeof value!=='string')return null;
  const raw=value.trim();
  // Accept the stored ISO timestamp/date formats, not Date.parse's rollover or
  // locale-dependent dates. Generic createdAt/updatedAt are deliberately unused.
  const match=raw.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?)?$/);
  if(!match||Number(match[2]||0)>23||Number(match[3]||0)>59||Number(match[4]||0)>59)return null;
  const day=dayKey(raw);
  if(!day)return null;
  // A date without an offset is a business-local calendar date. Such entries
  // cannot establish the order of different stages on the same business day.
  const exact=!!match[5];
  return {raw,day,exact,time:exact?Date.parse(raw):Date.parse(day+'T00:00:00Z')};
}

function stageAge(current,history,today,kind) {
  if(!current.identity)return unknownAge('missing-stage');
  if(!today)return unknownAge('invalid-today');
  if(history==null||(Array.isArray(history)&&!history.length))return unknownAge('missing-history');
  if(!Array.isArray(history))return unknownAge('invalid-history');
  const events=[];
  for(const entry of history){
    if(!entry||typeof entry!=='object'||Array.isArray(entry))return unknownAge('invalid-history');
    const target=kind==='yearProgress'?entry.stage:(has(entry,'to')?entry.to:entry.stage);
    const to=identify(target).identity;
    if(!to)return unknownAge('invalid-history');
    if(kind!=='yearProgress'&&has(entry,'to')&&has(entry,'stage')&&identify(entry.stage).identity!==to)
      return unknownAge('conflicting-history');
    const date=timestamp(entry.at);
    if(!date)return unknownAge('invalid-timestamp');
    if(date.day>today.day||(today.exact&&date.exact&&date.time>today.time))return unknownAge('future-timestamp');
    const from=kind!=='yearProgress'&&has(entry,'from')&&plain(entry.from)?identify(entry.from).identity:null;
    events.push({to,from,date});
  }
  events.sort((a,b)=>a.date.day.localeCompare(b.date.day)||a.date.time-b.date.time);
  // Dates without times, and equal timestamps, do not prove transition order.
  for(let i=0;i<events.length;i++){
    for(let j=i+1;j<events.length&&events[j].date.day===events[i].date.day;j++){
      const a=events[i],b=events[j];
      if(a.to!==b.to&&(!a.date.exact||!b.date.exact||a.date.time===b.date.time))
        return unknownAge('conflicting-history');
    }
  }
  for(let i=1;i<events.length;i++){
    const previous=events[i-1],event=events[i];
    if(event.from&&event.from!==previous.to)return unknownAge('conflicting-history');
  }
  if(events.at(-1).to!==current.identity)return unknownAge('current-stage-mismatch');
  let start=events.length-1;
  while(start>0&&events[start-1].to===current.identity)start--;
  const entry=events[start];
  // An explicit A -> A update only proves A was already active, not when it began.
  if(entry.from===entry.to)return unknownAge('repeated-only');
  const days=Math.round((Date.parse(today.day)-Date.parse(entry.date.day))/86400000);
  return {stageAgeDays:days,stageSince:entry.date.day,stageAgeStatus:'known',stageAgeReason:AGE_REASONS.known};
}

/**
 * buildStageBoard(focusRows, {profiles={}, year=2026, today})
 * -> {columns:[{key,label,count,rows}], rows, total, year, today}.
 *
 * Every input row appears once, in input order within its column. Original row
 * records/actions remain referenced, not modified. Each output row also has
 * stageKey (column), stageLabel (actual stage), stageRaw, stageSource,
 * stageAgeDays, stageSince, stageAgeStatus and stageAgeReason.
 *
 * Explicit selected-year progress wins over company.stage. An unrecognized or
 * cleared explicit progress stage stays in 'other', rather than reviving an old
 * company stage. Only an absent selected-year stage falls back to company,
 * never another year, an opportunity, a task or a contact. Unknown values and
 * not_started stay visible in 'other'; raw stage text is preserved.
 *
 * Residence uses only selected-year progress.history or company.stageHistory,
 * with matching stage and explicit entry.at. It uses the start of the current
 * consecutive stage run, not a later same-stage update. Dates are Seoul calendar
 * days (inclusive of zero today). Pass an ISO timestamp as today to additionally
 * reject future times within today; date-only today checks future calendar days.
 * No company/profile updatedAt, createdAt, progress.startedAt, or contact dates
 * can stand in for stage entry. Unprovable periods are null with an explanation.
 */
export function buildStageBoard(focusRows=[], {profiles={},year=2026,today}={}) {
  year=Number(year)||2026;
  const reference=timestamp(today===undefined?new Date().toISOString():today);
  const columns=BOARD_STAGES.map(stage=>({...stage,count:0,rows:[]}));
  const byKey=new Map(columns.map(column=>[column.key,column]));
  const rows=focusRows.map(row=>{
    const company=row.company||{},id=row.companyId||row.id||company._id||company.id;
    const progress=profiles?.[id]?.yearProgress?.[String(year)];
    const savedStage=safeText(progress?.stage);
    const usesProgress=!!progress&&has(progress,'stage');
    const stageRaw=usesProgress?savedStage:safeText(company.stage);
    const identified=identify(stageRaw);
    const stage=usesProgress&&!has(PROGRESS_LABELS,stageRaw)?{...identified,key:'other'}:identified;
    const stageSource=usesProgress?'yearProgress':plain(stageRaw)?'company':'none';
    const history=usesProgress?progress.history:company.stageHistory;
    const result={...row,stageKey:stage.key,
      stageLabel:plain(stageRaw)?(has(PROGRESS_LABELS,stageRaw)?PROGRESS_LABELS[stageRaw]:stageRaw):'단계 미정',
      stageRaw,stageSource,...stageAge(stage,history,reference,stageSource)};
    const column=byKey.get(stage.key);
    column.rows.push(result);column.count++;
    return result;
  });
  return {columns,rows,total:rows.length,year,today:reference?.day||null};
}
