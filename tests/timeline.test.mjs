import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTimelineRows,filterTimelineRows,timelineDay,timelineScale} from '../crm2-timeline.mjs';

const companies=[
  {_id:'c1',name:'가상 제조',stage:'현장 방문',owner:'윤홍렬',createdAt:'2026-09-30'},
  {_id:'c2',name:'두번째 업체',stage:'보류',createdAt:'2026-10-01'}
];
const activities=[
  {_id:'a1',companyId:'c1',date:'2026-10-06T02:30:00Z',type:'현장 방문',title:'공정 확인',status:'완료'},
  {_id:'a2',companyId:'c1',date:'2026-11-02',type:'전화',title:'재방문 협의',status:'완료'}
];
const opportunities=[{_id:'o1',companyId:'c1',title:'적재 개선',stage:'qualification',expectedCloseDate:'2026-11-30',createdAt:'2026-10-10'}];
const tasks=[
  {_id:'t1',companyId:'c1',title:'방문 일정 확정',dueAt:'2026-11-15',createdAt:'2026-11-02',status:'todo'},
  {_id:'t2',companyId:'c1',title:'지난 업무',dueAt:'2026-11-01',createdAt:'2026-10-29',status:'todo'}
];

test('timeline uses recorded start, opportunity target and latest update without inventing dates',()=>{
  const row=buildTimelineRows(companies,activities,opportunities,tasks,{today:'2026-11-02'})[0];
  assert.equal(row.startDay,'2026-09-30');
  assert.equal(row.targetDay,'2026-11-30');
  assert.equal(row.stageKey,'qualification');
  assert.equal(row.latestUpdate.title,'재방문 협의');
  assert.equal(row.next.title,'지난 업무');
  assert.equal(row.overdue,1);
});

test('missing dates remain null and paused companies keep their status',()=>{
  const row=buildTimelineRows([companies[1]],[],[],[],{today:'2026-11-02'})[0];
  assert.equal(row.stageKey,'hold');
  assert.equal(row.targetDay,null);
  assert.equal(row.nextDue,null);
});

test('latest update uses actual change timestamps, never future due or target dates',()=>{
  const row=buildTimelineRows(
    [{_id:'c3',name:'날짜 검증',stage:'리드',createdAt:'2026-10-01',updatedAt:'2026-11-01'}],
    [],
    [{_id:'o3',companyId:'c3',title:'제안',stage:'proposal',expectedCloseDate:'2027-01-20'}],
    [{_id:'t3',companyId:'c3',title:'후속',dueAt:'2027-01-10',status:'todo'}],
    {today:'2026-11-02'}
  )[0];
  assert.equal(row.latestUpdate.date,'2026-11-01');
  assert.equal(row.latestUpdate.kind,'company');
  assert.equal(row.targetDay,'2027-01-20');
});

test('filters expose recent, overdue, stage and search views',()=>{
  const rows=buildTimelineRows(companies,activities,opportunities,tasks,{today:'2026-11-02'});
  assert.deepEqual(filterTimelineRows(rows,{status:'recent'}).map(x=>x.id),['c1']);
  assert.deepEqual(filterTimelineRows(rows,{status:'overdue'}).map(x=>x.id),['c1']);
  assert.deepEqual(filterTimelineRows(rows,{stage:'hold'}).map(x=>x.id),['c2']);
  assert.deepEqual(filterTimelineRows(rows,{q:'재방문'}).map(x=>x.id),['c1']);
});

test('timeline scale positions recorded bars inside the shared range',()=>{
  const rows=buildTimelineRows(companies,activities,opportunities,tasks,{today:'2026-11-02'});
  const scale=timelineScale(rows,'2026-11-02');
  const position=scale.position(rows[0]);
  assert.equal(scale.start,'2026-09-30');
  assert.equal(scale.end,'2026-11-30');
  assert.ok(position.left>=0&&position.left<=100);
  assert.ok(position.width>0&&position.width<=100);
});

test('Seoul business date conversion is stable',()=>{
  assert.equal(timelineDay('2026-10-29T15:30:00Z'),'2026-10-30');
  assert.equal(timelineDay('bad'),null);
});

