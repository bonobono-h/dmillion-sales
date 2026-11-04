import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRecentUpdates,renderRecentUpdates} from '../crm2-updates.mjs';

const now=new Date('2026-11-04T10:00:00Z');
const options={now};
function fixture(){return {companies:[{_id:'c1',name:'가상 업체',stage:'보류',nextAction:'예전 다음 행동'}],activities:[],tasks:[],projects:[],opportunities:[],profiles:{},contacts:{},docUpdatedAt:{}};}
const mail=(extra={})=>({_id:'a1',companyId:'c1',type:'메일',status:'완료',title:'검토 메일',summary:'안내 내용',date:'2026-11-04',createdAt:'2026-11-04T09:11:00Z',nextAction:'회신 확인',...extra});

test('four newly recorded mails appear once per company without changing their stages',()=>{
 const s=fixture();s.companies=Array.from({length:4},(_,i)=>({_id:'c'+i,name:'가상 업체 '+i,stage:'보류',nextAction:'예전 행동'}));
 s.activities=s.companies.map(c=>mail({_id:'a'+c._id,companyId:c._id}));
 const before=structuredClone(s),r=buildRecentUpdates(s,options);
 assert.equal(r.totalCompanies,4);assert.equal(r.totalChanges,4);
 assert.ok(r.cards.every(c=>c.stage==='보류'&&c.nextAction==='회신 확인'&&c.followup==='다음 행동 있음'));
 assert.deepEqual(s,before);
});
test('database edit time wins stale business timestamps and exposes only safe snapshot metadata',()=>{
 const s=fixture();s.activities=[mail({createdAt:'2025-01-01T00:00:00Z',updatedAt:'2025-01-02T00:00:00Z'})];
 s.docUpdatedAt['activities/a1']='2026-11-04T09:11:00Z';
 assert.equal(buildRecentUpdates(s,options).cards[0].latest.at,Date.parse(s.docUpdatedAt['activities/a1']));
 assert.equal(s.activities[0].version,undefined);assert.equal(s.activities[0].updated_at,undefined);
});
test('task due dates and expected close dates do not make untouched records recent',()=>{
 const s=fixture();s.tasks=[{_id:'t',companyId:'c1',title:'업무',dueAt:'2026-11-04',status:'open'}];
 s.opportunities=[{_id:'o',companyId:'c1',expectedCloseDate:'2026-11-04'}];
 assert.equal(buildRecentUpdates(s,options).totalChanges,0);
});
test('one company groups multiple changes and the mail filter selects the actual mail record',()=>{
 const s=fixture();s.activities=[mail(),mail({_id:'a2',type:'전화',createdAt:'2026-11-04T09:12:00Z'})];
 s.tasks=[{_id:'t',companyId:'c1',title:'확인 업무',createdAt:'2026-11-04T09:13:00Z',status:'open'}];
 const r=buildRecentUpdates(s,options);assert.equal(r.cards.length,1);assert.equal(r.cards[0].changes.length,3);assert.equal(r.cards[0].activeTaskCount,1);
 assert.equal(buildRecentUpdates(s,{...options,type:'mail'}).cards[0].latest.recordId,'a1');
 assert.equal(buildRecentUpdates(s,{...options,type:'activity'}).totalChanges,2);
});
test('today and seven-day windows use Korea midnight rather than UTC midnight',()=>{
 const s=fixture();s.activities=[mail({createdAt:'2026-11-03T15:01:00Z'}),mail({_id:'old',createdAt:'2026-11-03T14:59:00Z'})];
 assert.equal(buildRecentUpdates(s,{...options,period:'today'}).totalChanges,1);
 s.activities=[mail({createdAt:'2026-10-28T15:00:00Z'}),mail({_id:'old',createdAt:'2026-10-28T14:59:00Z'})];
 assert.equal(buildRecentUpdates(s,options).totalChanges,1);
});
test('unknown companies, deleted records, future timestamps and invalid dates are excluded',()=>{
 const s=fixture();s.activities=[mail({companyId:'unknown'}),mail({_id:'deleted',status:'삭제됨'}),mail({_id:'future',createdAt:'2027-01-01T00:00:00Z'}),mail({_id:'bad',createdAt:'2026-02-30',date:'invalid'})];
 assert.equal(buildRecentUpdates(s,{...options,period:'all'}).totalChanges,0);
});
test('contact changes are visible without copying phone or email into the card',()=>{
 const s=fixture();s.contacts.c1={phone:'02-000-0000',email:'private@example.com'};s.docUpdatedAt['data/contacts/items/c1']='2026-11-04T09:11:00Z';
 const html=renderRecentUpdates(s,options);assert.match(html,/고객 연락처 업데이트/);assert.doesNotMatch(html,/02-000|private@example/);
});
test('date-only activity fallback does not invent a midnight time or claim a CRM reflection time',()=>{
 const s=fixture();s.activities=[mail({createdAt:null,date:'2026-11-04'})];
 const html=renderRecentUpdates(s,options);assert.match(html,/활동 날짜/);assert.match(html,/반영 시각 미기록/);assert.doesNotMatch(html,/00:00/);
});
test('untrusted content is escaped in card text and navigation attributes',()=>{
 const s=fixture();s.companies[0].name='<script>alert(1)</script>';s.activities=[mail({_id:'a" onclick="evil()',summary:'<img src=x onerror=evil()>'})];
 const html=renderRecentUpdates(s,options);assert.doesNotMatch(html,/<script>|<img|data-record="a" onclick/);assert.match(html,/&lt;script&gt;/);assert.match(html,/data-tab="activities"/);
});
test('pagination and filters preserve total counts and shared-project links',()=>{
 const s=fixture();s.companies.push({_id:'c2',name:'가상 두 번째',stage:'리드'});
 s.projects=[{_id:'p1',companyIds:['c1','c2'],name:'가상 수행 과제',updatedAt:'2026-11-04T09:00:00Z'}];
 const r=buildRecentUpdates(s,{...options,limit:1});assert.equal(r.cards.length,1);assert.equal(r.hasMore,true);assert.equal(r.totalCompanies,2);assert.equal(r.cards[0].latest.tab,'projects');
 assert.equal(buildRecentUpdates(s,{...options,type:'mail'}).cards.length,0);
});
