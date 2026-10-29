/* Pure CRM 2.0 helpers. No credentials, network calls or customer records here. */
export const STAGES = [
  ['discovery','발굴'],['qualification','요구 확인'],['proposal','제안·견적'],
  ['negotiation','협상'],['won','수주'],['lost','실패'],['hold','보류']
];
export const STAGE_LABEL = Object.fromEntries(STAGES);
export const MARKETS = ['로봇·자동화','제조AI','스마트공장','미정','시장 밖'];
export function programCategories(profile={}) {
  if (Array.isArray(profile.programCategories)) {
    const out=[],seen=new Set();
    for (const raw of profile.programCategories) {
      const val=safeText(raw),key=val.normalize('NFKC').toLocaleLowerCase('ko');
      if(val&&!seen.has(key)){out.push(val);seen.add(key);}
    }
    return out;
  }
  const legacy=plain(profile.market2027);
  return legacy?[legacy]:[];
}
export function taskGroups(companyId,tasks=[]) {
  const rows=tasks.filter(t=>t.companyId===companyId);
  const active=rows.filter(t=>!['done','cancelled','deleted'].includes(t.status))
    .sort((a,b)=>(a.dueAt||'9999').localeCompare(b.dueAt||'9999')||(a.createdAt||'').localeCompare(b.createdAt||''));
  const completed=rows.filter(t=>['done','cancelled'].includes(t.status))
    .sort((a,b)=>(b.completedAt||b.updatedAt||b.createdAt||'').localeCompare(a.completedAt||a.updatedAt||a.createdAt||''));
  const deleted=rows.filter(t=>t.status==='deleted')
    .sort((a,b)=>(b.deletedAt||'').localeCompare(a.deletedAt||''));
  return {active,completed,deleted};
}
/**
 * Conservative B2B CRM formatting: split explicit list markers and normalize whitespace.
 * It does not summarize, infer needs or fabricate business facts.
 */
export function formatNeedsForCRM(value) {
  const raw=String(value??'').replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ')
    .replace(/[\u200b-\u200d\ufeff]/g,'').replace(/[\t ]{2,}/g,' ')
    .replace(/([①-⑳])/g,'\n$1 ')
    .replace(/([;；])[ \t]*(?=\S)/g,'$1\n');
  const items=raw.split(/\n+/)
    .map(part=>part.trim().replace(/^(?:[•●▪\-]|[①-⑳]|\d{1,2}[.)])[ \t]*/,'').trim())
    .filter(Boolean);
  return items.map(s=>'• '+s).join('\n');
}
export function needsItems(value) {
  return formatNeedsForCRM(value).split('\n').map(s=>s.replace(/^•\s*/, '').trim()).filter(Boolean);
}
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

/**
 * Import planning is local and pure. Customer records must never be committed to GitHub.
 * Existing activity/project/task documents are intentionally outside this plan.
 */
export function usableImportEmail(raw) {
  const s=plain(raw);
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(s)?s:'';
}
export function usableImportPhone(raw) {
  const s=plain(raw);
  return /(?:\+82[\s().-]?|0)(?:10|11|16|17|18|19|2|[3-6]\d)[\s().-]?\d{3,4}[\s().-]?\d{4}/.test(s)?s:'';
}
export function buildImportPlan(preview,settings={}) {
  const selected=settings.selected||new Set(),profiles=settings.profiles||{},
    contacts=settings.contacts||{},tasks=settings.tasks||[],newIds=settings.newIds||{},
    taskIds=settings.taskIds||{},replaceContacts=!!settings.replaceContacts,
    includeNew=!!settings.includeNew,includeTasks=!!settings.includeTasks;
  const ops=[],records=[],counts={selected:0,new:0,matched:0,skipped:0,contacts:0,profiles:0,companies:0,tasks:0};
  for(const item of preview) {
    if(!selected.has(item.index)||item.status==='conflict'||(item.status==='new'&&!includeNew)){
      counts.skipped++;continue;
    }
    const row=item.row,company=item.company,id=company?company._id||company.id:newIds[item.index];
    if(!id)throw new Error('신규 업체 식별번호가 없습니다: '+item.index);
    const rowOps=[],basePath='companies/'+id,profilePath='crm2Profiles/'+id,
      contactPath='data/contacts/items/'+id;
    if(!company) {
      const data={name:safeText(row.name),kind:'고객사',
        stage:plain(row.excelStage)||'리드',
        ...(plain(row.region)?{region:plain(row.region)}:{})};
      rowOps.push({path:basePath,type:'create',data});
      counts.companies++;counts.new++;
    } else {
      counts.matched++;
      // Fill only missing location. Never overwrite the existing sales stage, owner, or next action.
      if(!plain(company.region)&&plain(row.region)){
        rowOps.push({path:basePath,type:'patch',data:{region:plain(row.region)}});
        counts.companies++;
      }
    }
    const old=profiles[id]||{},p=profileFromRow(row),cat=plain(row.market2027);
    if(cat){
      const merged=programCategories(old);
      if(!merged.some(v=>v.normalize('NFKC').toLocaleLowerCase('ko')===cat.normalize('NFKC').toLocaleLowerCase('ko')))merged.push(cat);
      p.programCategories=merged;
    }
    if(plain(row.excelStage))p.excelStage=plain(row.excelStage);
    const profilePatch={};
    for(const [key,value] of Object.entries(p)){
      if(JSON.stringify(old[key])!==JSON.stringify(value))profilePatch[key]=value;
    }
    if(Object.keys(profilePatch).length){
      rowOps.push({path:profilePath,type:old._id?'patch':'create',data:old._id?profilePatch:{...old,...profilePatch}});
      counts.profiles++;
    }
    const ct=contacts[id]||{},ctPatch={};
    const newName=plain(row.contactName);
    const oldName=plain(ct.name||ct.person||ct.contactPerson||company?.contactPerson);
    if(newName&&(replaceContacts||!oldName)&&newName!==plain(ct.name))ctPatch.name=newName;
    const email=usableImportEmail(row.email),phone=usableImportPhone(row.phone);
    if(email&&(replaceContacts||!usableImportEmail(ct.email))&&email!==ct.email)ctPatch.email=email;
    if(phone&&(replaceContacts||!usableImportPhone(ct.phone))&&phone!==ct.phone)ctPatch.phone=phone;
    if(Object.keys(ctPatch).length){
      rowOps.push({path:contactPath,type:ct._id?'patch':'create',data:ct._id?ctPatch:{...ct,...ctPatch}});
      counts.contacts++;
    }
    const next=plain(row.excelNextAction);
    if(includeTasks&&next&&!tasks.some(t=>t.companyId===id&&safeText(t.title)===next)
      &&safeText(company?.nextAction)!==next){
      const taskId=taskIds[item.index];
      if(!taskId)throw new Error('업무 식별번호가 없습니다: '+item.index);
      rowOps.push({path:'tasks/'+taskId,type:'create',data:{
        companyId:id,title:next,dueAt:null,status:'todo',priority:'normal',
        source:'2027-customer-excel'
      }});
      counts.tasks++;
    }
    ops.push(...rowOps);
    counts.selected++;records.push({index:item.index,name:row.name,companyId:id,new:!company,paths:rowOps.map(x=>x.path)});
  }
  return {ops,records,counts};
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
  const old=plain(company.nextAction);
  const duplicated=old&&tasks.some(t=>t.companyId===company._id&&safeText(t.title)===old);
  return old&&!duplicated?{title:old,dueAt:company.nextDate||null,origin:'legacy'}:null;
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
    if(market && !programCategories(p).includes(market)) return false;
    if(group && p.outreachBucket!==group) return false;
    if(stage && c.stage!==stage) return false;
    if(filters.hasTask && !nextActionFor(c,tasks))return false;
    if(q && !textSearch([c.name,c.industry,c.bizDetail,c.needs,c.owner,c.region,c.nextAction,programCategories(p).join(' '),p.salesComment,p.contactReason,p.contactName].join(' ')).includes(q))return false;
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
