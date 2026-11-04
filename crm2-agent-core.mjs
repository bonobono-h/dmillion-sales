const companyId=value=>value?._id||value?.id||'';
const plain=value=>String(value??'').trim();
const normalize=value=>plain(value).normalize('NFKC').toLocaleLowerCase('ko')
  .replace(/주식회사|유한회사|\(주\)|㈜|[\s._·,\-()[\]{}]/g,'');
const unique=values=>[...new Set(values.filter(Boolean))];
const seoulParts=date=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
const isoDay=date=>{const p=seoulParts(date);return `${p.year}-${p.month}-${p.day}`;};
const localDateTime=date=>{const p=seoulParts(date);return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;};
const validDay=value=>/^20\d\d-\d\d-\d\d$/.test(value)&&!Number.isNaN(new Date(value+'T00:00:00+09:00').getTime())&&isoDay(new Date(value+'T00:00:00+09:00'))===value;
const addDays=(base,days)=>new Date(new Date(base).getTime()+days*86400000);

export const AGENT_ACTIVITY_TYPES=['전화','미팅','첫 미팅','현장 방문','내방','화상','제안·발표'];

// Anchor the activity to what happened; follow-up plans belong to tasks.
function activityContext(text){
  const clauses=plain(text).split(/\r?\n|(?<=[.!?。])\s+|(?<=했고|했으며|했는데|다녀왔고|만났고)\s+/).filter(Boolean);
  const completed=clauses.filter(value=>!/(?:하기로|주기로|예정)/.test(value)&&/(?:통화|전화|미팅|회의|상담|방문|발표|제안|내방|화상).{0,12}(?:했|마쳤|완료|끝냈)|다녀왔|만났/.test(value));
  const current=clauses.filter(value=>!/(?:내일|다음\s*주|차주|예정|하기로|주기로)/.test(value));
  return (completed.length?completed:current).join(' ');
}

export function matchAgentCompanies(transcript,companies=[]){
  const text=normalize(transcript);
  if(!text)return [];
  return companies.flatMap(company=>{
    const names=unique([company?.name,company?.alias,company?.formerName,...(Array.isArray(company?.aliases)?company.aliases:[])]);
    const matches=names.map(name=>({name,normalized:normalize(name)})).filter(item=>item.normalized.length>=2&&text.includes(item.normalized));
    if(!matches.length)return [];
    matches.sort((a,b)=>b.normalized.length-a.normalized.length);
    return [{id:companyId(company),name:plain(company.name),reason:`음성·메모에서 “${matches[0].name}” 확인`,score:Math.min(1,0.72+matches[0].normalized.length/40)}];
  }).sort((a,b)=>b.score-a.score||b.name.length-a.name.length);
}

export function activityTypeFromText(text){
  const value=activityContext(text)||plain(text);
  if(/현장\s*(?:방문|다녀)|공장\s*(?:방문|다녀)/.test(value))return '현장 방문';
  if(/첫\s*(?:미팅|회의|상담)/.test(value))return '첫 미팅';
  if(/화상|온라인\s*(?:미팅|회의)|줌|zoom/i.test(value))return '화상';
  if(/내방/.test(value))return '내방';
  if(/통화|전화/.test(value))return '전화';
  if(/제안|발표|pt\b/i.test(value))return '제안·발표';
  if(/미팅|회의|상담|만났/.test(value))return '미팅';
  return '전화';
}

export function occurredAtFromText(text,nowValue=new Date()){
  const now=new Date(nowValue);if(Number.isNaN(now.getTime()))return {value:'',basis:'확인 필요'};
  const value=activityContext(text);
  if(!value)return {value:'',basis:'향후 일정으로 보여 활동 일시 확인 필요'};
  const explicit=value.match(/\b(20\d\d)[-.\/]\s*(\d{1,2})[-.\/]\s*(\d{1,2})\b/)||value.match(/\b(20\d\d)년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if(explicit){
    const day=`${explicit[1]}-${String(explicit[2]).padStart(2,'0')}-${String(explicit[3]).padStart(2,'0')}`;
    if(!validDay(day))return {value:'',basis:'활동 날짜 확인 필요'};
    if(day>isoDay(now))return {value:'',basis:'향후 일정으로 보여 활동 일시 확인 필요'};
    return {value:day+'T12:00',basis:'말한 날짜 · 시간 확인 필요'};
  }
  if(/어제/.test(value))return {value:localDateTime(addDays(now,-1)),basis:'어제 · 입력 시각 기준 (한국시간)'};
  if(/오늘|방금|아까|금일/.test(value))return {value:localDateTime(now),basis:'오늘 · 입력 시각 기준 (한국시간)'};
  if(/내일|다음\s*주|차주|예정|하기로/.test(value)&&!/(오늘|어제|방금|아까|통화했|미팅했|회의했|상담했|방문했|다녀왔|끝났|완료했)/.test(value))return {value:'',basis:'향후 일정으로 보여 활동 일시 확인 필요'};
  return {value:localDateTime(now),basis:'입력 시각 기준 (한국시간) · 확인 필요'};
}

function dueDayFromText(text,now){
  const explicit=plain(text).match(/\b(20\d\d-\d\d-\d\d)\b/)?.[1];
  if(explicit&&validDay(explicit))return explicit;
  if(/내일/.test(text))return isoDay(addDays(now,1));
  const md=plain(text).match(/\b(\d{1,2})월\s*(\d{1,2})일/);
  if(md){const year=seoulParts(now).year,day=`${year}-${String(md[1]).padStart(2,'0')}-${String(md[2]).padStart(2,'0')}`;if(validDay(day))return day;}
  return '';
}

function cleanTaskTitle(value){
  const source=plain(value);
  const actor=[...source.matchAll(/(?:^|[,.!?]\s*|그리고\s+)(?:(?:다음\s*주(?:에)?|이번\s*주(?:에)?|내일|오늘|\d{1,2}월\s*\d{1,2}일)\s*)?(?:내가|제가|저희가|우리가|우리\s*쪽에서)\s+([^,.!?]+)/g)].at(-1)?.[1]||source;
  return actor
    .replace(/^(?:그리고|그래서|또|다음\s*주(?:에)?|내일|오늘|\d{1,2}월\s*\d{1,2}일)\s*/,'')
    .replace(/^(?:내가|저희가|우리가|우리\s*쪽에서)\s*/,'')
    .replace(/(?:해\s*)?(?:주)?기로\s*(?:했어|했습니다|했다|함|했음)?[.!?]?$/,'')
    .replace(/해야\s*(?:해|합니다|한다|함)[.!?]?$/,'')
    .replace(/보내\s*주?$/,'보내기').replace(/전달$/,'전달하기').replace(/연락$/,'연락하기').replace(/확인$/,'확인하기')
    .slice(0,180).trim();
}

export function explicitAgentTasks(text,nowValue=new Date()){
  const now=new Date(nowValue),rows=[];
  const segments=plain(text).split(/\r?\n|(?<=[.!?。])\s+|(?<=요)\s+(?=(?:그리고|다음|내일|제가|내가|저희))/).map(x=>x.trim()).filter(Boolean);
  for(const segment of segments){
    const label=segment.match(/^(?:할\s*일|후속\s*(?:업무|조치)|다음\s*(?:액션|할\s*일)|TODO|ACTION)\s*[:：]\s*(.+)$/i)?.[1];
    const commitment=/(?:내가|제가|저희가|우리가|우리\s*쪽에서).*(?:하기로|해\s*주기로|보내\s*주기로|전달하기로|연락하기로|확인해야|보내야|전달해야)/.test(segment);
    const obligation=/(?:해야\s*(?:해|합니다|한다)|하기로\s*(?:했|함)|보내\s*주기로\s*(?:했|함)|전달하기로\s*(?:했|함)|연락하기로\s*(?:했|함))/.test(segment);
    if(!label&&!commitment&&!obligation)continue;
    const raw=label||segment;
    const title=cleanTaskTitle(raw);
    if(title.length<2)continue;
    rows.push({title,dueAt:dueDayFromText(raw,now),evidence:segment.slice(0,300)});
  }
  return rows.filter((item,index,array)=>array.findIndex(other=>other.title===item.title)===index).slice(0,10);
}

function directFacts(text){
  return plain(text).split(/\r?\n|(?<=[.!?。])\s+/).map(x=>x.trim()).filter(Boolean)
    .filter(line=>!/(?:해야|하기로|예정|다음\s*주|내일|할\s*일|다음\s*액션)/.test(line))
    .slice(0,8).map(line=>line.slice(0,300));
}

export function buildRuleAgentDraft(transcript,{now=new Date(),candidates=[]}={}){
  const text=plain(transcript),date=occurredAtFromText(text,now),type=activityTypeFromText(text),company=candidates[0];
  const tasks=explicitAgentTasks(text,now),unknowns=[];
  if(!company)unknowns.push('업체를 직접 선택해야 합니다.');
  if(candidates.length>1)unknowns.push('여러 업체명이 감지되어 업체 확인이 필요합니다.');
  if(/다음\s*주|차주|이번\s*주/.test(text)&&tasks.some(task=>!task.dueAt))unknowns.push('후속업무 기한이 주 단위 표현이라 정확한 날짜가 필요합니다.');
  if(/미정|아직|정확한.*(?:안|없)|확인\s*필요/.test(text))unknowns.push('미정 또는 확인 필요로 말한 내용은 확정값으로 저장하지 않습니다.');
  if(date.basis.includes('확인 필요'))unknowns.push('활동 일시는 입력 시각을 기준으로 표시되므로 저장 전 확인해야 합니다.');
  const stageSuggestion=/견적|제안/.test(text)?'후속 제안 준비':/미팅.*(?:잡|조율|예정)|만나기로/.test(text)?'미팅 조율':/관심|검토/.test(text)?'니즈 확인':'현재 단계 유지';
  const companyName=company?.name||'업체 미확인';
  return {
    mode:'rules',companyCandidates:candidates.slice(0,5),title:`${companyName} ${type} 기록`,summary:text,activityType:type,
    occurredAt:date.value,dateBasis:date.basis,confirmedFacts:directFacts(text),unknowns:unique(unknowns),stageSuggestion,
    tasks,warnings:['규칙 기반 분석 결과입니다. 저장 전에 업체·사실·일시·후속업무를 확인하세요.']
  };
}

const list=(value,max=10)=>Array.isArray(value)?value.map(plain).filter(Boolean).slice(0,max):[];
export function sanitizeAgentDraft(raw,fallback){
  const source=raw&&typeof raw==='object'?raw:{},base=fallback||buildRuleAgentDraft('');
  const activityType=AGENT_ACTIVITY_TYPES.includes(source.activityType)?source.activityType:base.activityType;
  const tasks=(Array.isArray(source.tasks)?source.tasks:base.tasks||[]).map(task=>({
    title:plain(task?.title).slice(0,180),dueAt:validDay(plain(task?.dueAt))?plain(task.dueAt):'',evidence:plain(task?.evidence).slice(0,300)
  })).filter(task=>task.title).slice(0,10);
  const occurred=plain(source.occurredAt||base.occurredAt);
  return {
    ...base,mode:source.mode==='ai'?'ai':base.mode,title:plain(source.title||base.title).slice(0,160),summary:plain(source.summary||base.summary).slice(0,150000),
    activityType,occurredAt:Number.isNaN(new Date(occurred).getTime())?'':occurred,dateBasis:plain(source.dateBasis||base.dateBasis).slice(0,120),
    confirmedFacts:list(source.confirmedFacts??base.confirmedFacts,10).map(x=>x.slice(0,300)),unknowns:list(source.unknowns??base.unknowns,10).map(x=>x.slice(0,300)),
    stageSuggestion:plain(source.stageSuggestion||base.stageSuggestion||'현재 단계 유지').slice(0,80),tasks,
    warnings:list(source.warnings??base.warnings,10).map(x=>x.slice(0,300))
  };
}

export const AGENT_OUTPUT_SCHEMA={
  type:'object',additionalProperties:false,
  properties:{
    title:{type:'string'},summary:{type:'string'},activityType:{type:'string',enum:AGENT_ACTIVITY_TYPES},occurredAt:{type:'string'},dateBasis:{type:'string'},
    confirmedFacts:{type:'array',items:{type:'string'}},unknowns:{type:'array',items:{type:'string'}},stageSuggestion:{type:'string'},
    tasks:{type:'array',items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},dueAt:{type:'string'},evidence:{type:'string'}},required:['title','dueAt','evidence']}},
    warnings:{type:'array',items:{type:'string'}}
  },
  required:['title','summary','activityType','occurredAt','dateBasis','confirmedFacts','unknowns','stageSuggestion','tasks','warnings']
};
