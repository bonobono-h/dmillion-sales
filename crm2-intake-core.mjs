// Deterministic suggestions only. Source text is data, never executable instructions.
export const emailAddresses = value => [...new Set((String(value||'').toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g)||[]))];
const normalize = s=>String(s||'').toLowerCase().replace(/주식회사|\(주\)|㈜|[\s._·,\-()[\]{}]/g,'');
export async function sourceHash(value) {
  const bytes=await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value);
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function matchCompanies(source,companies,contacts={}) {
  const addresses=emailAddresses([source.from,source.to,source.cc].join(' '));
  const exact=companies.filter(c=>{
    const ct=contacts[c._id||c.id]||{};
    return emailAddresses([ct.email,ct.emails,c.email].join(' ')).some(a=>addresses.includes(a));
  });
  if(exact.length)return exact.map(c=>({id:c._id||c.id,name:c.name,reason:'등록 연락처 일치'}));
  const text=normalize([source.title,source.body].join(' '));
  return companies.filter(c=>normalize(c.name).length>=3&&text.includes(normalize(c.name)))
    .map(c=>({id:c._id||c.id,name:c.name,reason:'본문 업체명 일치 · 확인 필요'}));
}
export function documentKind(name) {
  if(/견적|quotation|quote/i.test(name))return '견적서';
  if(/계약|contract|agreement/i.test(name))return '계약서';
  if(/제안|proposal/i.test(name))return '제안서';
  if(/회의록|미팅|meeting|minutes/i.test(name))return '회의록';
  return '기타';
}
export function suggestedTasks(text) {
  // Only explicit action sections/labels. Do not turn every request or quotation into a task.
  let section=false;const rows=[];
  for(const raw of String(text||'').split(/\r?\n/)){
    const line=raw.trim();
    if(/^(?:후속\s*(?:업무|조치)|다음\s*(?:액션|할\s*일)|action\s*items?|todo)\s*[:：]?\s*$/i.test(line)){section=true;continue;}
    const explicit=line.match(/^(?:할\s*일|후속\s*업무|다음\s*액션|TODO|ACTION)\s*[:：]\s*(.+)$/i);
    if(!line){section=false;continue;}
    const content=explicit?.[1]||(section?line.replace(/^(?:[-*•]|\d+[.)]|[①-⑳])\s*/,''):'');
    if(!content)continue;
    const due=content.match(/\b(20\d\d-\d\d-\d\d)\b/)?.[1]||'';
    const valid=due&&!Number.isNaN(Date.parse(due))&&new Date(due).toISOString().startsWith(due);
    rows.push({title:content.slice(0,180),dueAt:valid?due:'',evidence:line});
  }
  return rows.filter((x,i,a)=>a.findIndex(y=>y.title===x.title)===i).slice(0,20);
}
export function sourcePreview(source,companies,contacts={}) {
  const candidates=matchCompanies({title:source.title,body:source.body,...source.metadata},companies,contacts);
  return {candidates,companyId:source.company_id||(candidates.length===1?candidates[0].id:''),
    tasks:suggestedTasks(source.body),kind:documentKind(source.title)};
}
export function stripEmailHtml(html) {
  return String(html||'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'')
    .replace(/<(?:br|\/p|\/div|\/li)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,' ')
    .replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').trim();
}
