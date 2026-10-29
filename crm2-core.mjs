/* Pure CRM 2.0 helpers. No credentials, network calls or customer records here. */
export const STAGES = [
  ['discovery','발굴'],['qualification','요구 확인'],['proposal','제안·견적'],
  ['negotiation','협상'],['won','수주'],['lost','실패'],['hold','보류']
];
export const STAGE_LABEL = Object.fromEntries(STAGES);
export const MARKETS = ['로봇·자동화','제조AI','스마트공장','미정','시장 밖'];
export const ACTION_GROUPS = [
  '진행 중 — 과제 수행','진행 중 — 과제 신청 중','진행 중 — 실증·R&D 협력',
  '진행 중 — 영업 진행','연락해볼만함','모르겠음 — 담당자 확인',
  '기록 없음 — 메일 확보 후 일괄','대표님 확인','차년도 공고 때 연락'
];
export function normalizeCompanyName(value) {
  return String(value ?? '').trim().toLocaleLowerCase('ko')
    .replace(/주식회사|\(주\)|㈜/g,'')
    .replace(/[\s._·,\-()[\]{}]/g,'');
}
export function safeText(value) { return String(value ?? '').trim(); }
export function plain(value) {
  const s = safeText(value);
  return (s === '없음' || s === '-' || s === '미정' || s === '—') ? '' : s;
}
export function textSearch(value) { return safeText(value).toLocaleLowerCase('ko'); }
export function isTerminal(stage) { return ['won','lost'].includes(stage); }
export function isOpportunityOpen(opp) { return !isTerminal(opp.stage) && opp.status !== 'closed'; }
export function mappedCompany(row) {
  return {
    name: plain(row['업체명']),
    accountGrade: plain(row['등급']),
    outreachBucket: plain(row['11월 할 일']),
    outreachMethod: plain(row['발송']),
    market2027: plain(row['지원공고사업분류'] || row['2027 시장']),
    excelStage: plain(row['사이트 단계']),
    email: plain(row['이메일']), // protected preview only, never put into publicly readable CRM2 profile
    phone: plain(row['전화번호']),
    contactReason: plain(row['연락 명분·시점']),
    salesComment: plain(row['홍 코멘트']),
    statusSummary: plain(row['현황']),
    stallReason: plain(row['드랍·정체 사유']),
    excelNextAction: plain(row['사이트 다음 액션']),
    contactName: plain(row['담당자']),
    region: plain(row['지역'])
  };
}
export function sheetRowsToRecords(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const heads = rows[0].map(safeText);
  if (!heads.includes('업체명')) throw new Error('"전체" 시트에서 업체명 열을 찾지 못했습니다.');
  const records = rows.slice(1).map(line => mappedCompany(Object.fromEntries(heads.map((h,i)=>[h,line[i]])))).filter(r=>r.name);
  const seen = new Set();
  for (const r of records) { const n=normalizeCompanyName(r.name); if(seen.has(n)) r.importWarning='동일 정규화 업체명 중복'; seen.add(n); }
  return records;
}
export const CRM_PROFILE_KEYS = [
  'accountGrade','outreachBucket','outreachMethod','market2027',
  'contactReason','salesComment','statusSummary','stallReason',
  'excelNextAction','region'
];
export function profileFromRow(row) {
  // Email/phone/contact person (PII), site stage and other private fields MUST NOT be saved in public CRM profile.
  const data={};
  for(const k of CRM_PROFILE_KEYS) if(plain(row[k])) data[k]=plain(row[k]);
  return data;
}
export function getImportPreview(rows,companies=[],profiles={}) {
  const index=new Map();
  for(const c of companies) {
    const key=normalizeCompanyName(c.name);
    if(!key) continue;
    if(!index.has(key)) index.set(key,[]);
    index.get(key).push(c);
  }
  return rows.map((row,i)=>{
    const candidates=index.get(normalizeCompanyName(row.name))||[];
    if(row.importWarning || candidates.length>1) return {row,index:i,status:'conflict',company:null,changes:{}};
    if(candidates.length===0) return {row,index:i,status:'new',company:null,changes:{}};
    const company=candidates[0], prev=profiles[company._id]||{}, next=profileFromRow(row), changes={};
    for(const [k,v] of Object.entries(next)) {
      if(plain(prev[k])!==v) changes[k]={before:plain(prev[k]),after:v};
    }
    return {row,index:i,status:Object.keys(changes).length?'change':'same',company,changes};
  });
}
export function countImportResults(items) {
  const totals={new:0,change:0,same:0,conflict:0};
  for(const r of items) totals[r.status]=(totals[r.status]||0)+1;
  return totals;
}
export function nextActionFor(company,tasks=[]) {
  const related=tasks.filter(t=> t.companyId===company._id && !['done','cancelled','deleted'].includes(t.status))
    .sort((a,b)=>(a.dueAt||'9999').localeCompare(b.dueAt||'9999'));
  if(related.length) return {...related[0],origin:'crm2'};
  return plain(company.nextAction)?{title:company.nextAction,dueAt:company.nextDate||null,origin:'legacy'}:null;
}
export function activityDate(row){return row.date||row.at||row.createdAt||'';}
export function latestActivity(companyId,activities=[]){
  return activities.filter(a=>a.companyId===companyId && a.status!=='취소').filter(a=>activityDate(a))
    .sort((a,b)=>activityDate(b).localeCompare(activityDate(a)))[0]||null;
}
export function relatedProjects(companyId,projects=[]){
  return projects.filter(p=>p.companyId===companyId || (Array.isArray(p.companyIds) && p.companyIds.includes(companyId)));
}
export function groupStats(accounts,profiles,opps,tasks){
  return {total:accounts.length, a:accounts.filter(c=>profiles[c._id]?.accountGrade==='A').length,
    follow:accounts.filter(c=>!!nextActionFor(c,tasks)).length,
    openOpps:opps.filter(isOpportunityOpen).length,
    stalled:accounts.filter(c=>['모르겠음 — 담당자 확인','기록 없음 — 메일 확보 후 일괄'].includes(profiles[c._id]?.outreachBucket)).length};
}
export function filteredAccounts(companies,profiles,opps,tasks,filters={}){
  const q=textSearch(filters.q), grade=filters.grade||'', market=filters.market||'', group=filters.group||'';
  const stage=filters.stage||'';
  return companies.filter(c=>{
    const p=profiles[c._id]||{};
    if(grade && p.accountGrade!==grade) return false;
    if(market && p.market2027!==market) return false;
    if(group && p.outreachBucket!==group) return false;
    if(stage && c.stage!==stage) return false;
    if(filters.hasTask && !nextActionFor(c,tasks))return false;
    if(q && !textSearch([c.name,c.industry,c.bizDetail,c.needs,c.owner,c.region,c.nextAction,p.market2027,p.salesComment,p.contactReason,p.contactName].join(' ')).includes(q))return false;
    return true;
  }).sort((a,b)=>{
    if(filters.sort==='grade') return (profiles[a._id]?.accountGrade||'Z').localeCompare(profiles[b._id]?.accountGrade||'Z')||a.name.localeCompare(b.name,'ko');
    if(filters.sort==='action') return (nextActionFor(a,tasks)?.dueAt||'9999').localeCompare(nextActionFor(b,tasks)?.dueAt||'9999')||a.name.localeCompare(b.name,'ko');
    if(filters.sort==='opportunities') return opps.filter(o=>o.companyId===b._id&&isOpportunityOpen(o)).length-opps.filter(o=>o.companyId===a._id&&isOpportunityOpen(o)).length||a.name.localeCompare(b.name,'ko');
    return a.name.localeCompare(b.name,'ko');
  });
}
export function moneyKRW(n){
  if(n===undefined||n===null||n==='')return '미입력';
  const x=Number(n);if(!Number.isFinite(x))return '미입력';
  if(Math.abs(x)>=100000000)return `${(x/100000000).toLocaleString('ko-KR',{maximumFractionDigits:2})}억원`;
  if(Math.abs(x)>=10000)return `${(x/10000).toLocaleString('ko-KR',{maximumFractionDigits:1})}만원`;
  return `${x.toLocaleString('ko-KR')}원`;
}
