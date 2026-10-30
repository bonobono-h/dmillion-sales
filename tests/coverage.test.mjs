import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCoverage,filterCoverage,dayKey,businessGroup} from '../crm2-coverage.mjs';

const co={_id:'c1',name:'가상 고객',kind:'고객사',stage:'리드',owner:'영업팀'};
const activity={_id:'a1',companyId:'c1',date:'2026-10-22',type:'현장 방문',status:'완료'};
const task={_id:'t1',companyId:'c1',title:'제안 확인',dueAt:'2026-11-02',status:'todo'};
const run=(c=co,acts=[activity],tasks=[task],profiles={},threshold=30)=>buildCoverage([c],profiles,acts,tasks,{today:'2026-10-30',threshold})[0];

test('management requires owner, recent contact and dated next action',()=>{
  assert.equal(run().status,'healthy');
  assert.equal(run({...co,owner:''}).status,'followup');
  assert.equal(run(co,[activity],[]).status,'followup');
  assert.equal(run(co,[activity],[{...task,dueAt:null}]).status,'followup');
  assert.equal(run(co,[activity],[task,{...task,_id:'t2',dueAt:null}]).status,'followup');
});
test('notes, cancelled and planned events do not count as completed contacts',()=>{
  for (const changes of [{type:'메모'},{status:'예정'},{status:'취소'},{status:'deleted'}]) {
    const row=run(co,[{...activity,...changes}],[]);
    assert.equal(row.contactCount,0);
    assert.equal(row.lastContact,null);
    assert.equal(row.status,'uncontacted');
  }
});
test('future and invalid completed dates flag records for review',()=>{
  for (const date of ['2026-11-04','bad','2026-02-30']) assert.equal(run(co,[{...activity,date}]).status,'review');
  assert.equal(run({...co,stage:'제안'},[],[]).status,'review');
  assert.equal(run({...co,stage:'리드'},[],[]).status,'uncontacted');
});
test('overdue, stale threshold and completed tasks have independent semantics',()=>{
  assert.equal(run(co,[activity],[{...task,dueAt:'2026-10-29'}]).overdue,1);
  assert.equal(run(co,[activity],[{...task,dueAt:'2026-10-29'}]).status,'followup');
  assert.equal(run(co,[{...activity,date:'2026-09-30'}]).status,'healthy');
  assert.equal(run(co,[{...activity,date:'2026-09-29'}]).status,'stale');
  assert.equal(run(co,[{...activity,date:'2026-09-29'}],[task],{},60).status,'healthy');
  assert.equal(run(co,[activity],[{...task,status:'done'}]).overdue,0);
  assert.equal(run(co,[activity],[{...task,status:'done'}]).status,'followup');
});
test('paused customer and next-year contact stay outside normal stale pool',()=>{
  const row=run({...co,stage:'보류',outcomeReason:'예산',outcomeNote:'내년 재검토'},[],[]);
  assert.equal(row.status,'waiting');assert.match(row.reason,/예산/);assert.match(row.reason,/재접촉/);
  assert.equal(run(co,[],[],{c1:{outreachBucket:'차년도 공고 때 연락',contactReason:'내년 공고 확인'}}).status,'waiting');
  assert.equal(run({...co,stage:'보류'},[activity],[{...task,dueAt:'2026-10-29'}]).status,'followup');
});
test('all legacy and activity follow-ups participate; completed linked work is not re-opened',()=>{
  const row=run({...co,nextAction:'다른 기존 업무'},[{...activity,nextAction:'샘플 발송',nextDue:'2026-10-28'}],[task]);
  assert.equal(row.actions.length,3);assert.equal(row.overdue,1);assert.equal(row.undated,1);
  const linked=run(co,[{...activity,nextAction:'샘플 발송',nextDue:'2026-10-28'}],[{...task,status:'done',sourceActivityId:'a1'}]);
  assert.equal(linked.actions.length,0);
  const converted=run({...co,nextAction:'① 첫 업무 ② 둘째 업무'},[activity],[{...task,source:'legacy-nextAction',title:'첫 업무',status:'done'}]);
  assert.equal(converted.actions.length,1);assert.equal(converted.actions[0].title,'둘째 업무');
});
test('upcoming meeting supplies next schedule but does not advance last contact',()=>{
  const row=run(co,[activity,{...activity,_id:'a2',date:'2026-11-03',status:'예정'}],[]);
  assert.equal(row.status,'healthy');assert.equal(row.lastContact,'2026-10-22');assert.equal(row.contactCount,1);
});
test('filters, counts and company grouping keep partners separate',()=>{
  const rows=buildCoverage([co,{...co,_id:'c2',kind:'협력사',name:'가상 협력사'},{...co,_id:'c3',owner:''}],{c1:{programCategories:['제조AI']}},[activity],[task],{today:'2026-10-30'});
  assert.equal(filterCoverage(rows,{kind:'customer'}).length,2);
  assert.equal(filterCoverage(rows,{kind:'partner'}).length,1);
  assert.equal(filterCoverage(rows,{kind:'all'}).length,3);
  assert.equal(filterCoverage(rows,{kind:'customer',status:'healthy'}).length,1);
  assert.equal(filterCoverage(rows,{kind:'customer',owner:'__none'}).length,1);
  assert.equal(filterCoverage(rows,{kind:'customer',market:'제조AI',q:'가상'}).length,1);
  assert.equal(businessGroup({...co,stage:'계약'}),'delivery');
  assert.equal(businessGroup({...co,stage:'선정'}),'delivery');
  assert.equal(businessGroup({...co,stage:''}),'unknown');
});
test('business dates use Seoul and source input remains unchanged',()=>{
  assert.equal(dayKey('2026-10-29T15:30:00Z'),'2026-10-30');
  assert.equal(dayKey('2026-10-30'),'2026-10-30');
  assert.equal(dayKey('2026-02-30'),null);
  const args=structuredClone([[co],{},[activity],[task],{today:'2026-10-30'}]),before=JSON.stringify(args);
  buildCoverage(...args);assert.equal(JSON.stringify(args),before);
});
