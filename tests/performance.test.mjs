import test from 'node:test';
import assert from 'node:assert/strict';
import {weekRange,pickGoal,buildPerformance,appendStageHistory,goalDocId} from '../crm2-performance.mjs';

const goal={kind:'salesGoal',label:'2026 4분기',start:'2026-10-01',end:'2026-12-31',revenueTarget:2700000000,
  programs:[{name:'스마트공장',count:3,amountPerDeal:400000000},{name:'제조로봇',count:3,amountPerDeal:500000000}]};

test('week runs Monday to Sunday in Seoul time',()=>{
  assert.deepEqual(weekRange('2026-11-03'),{start:'2026-11-02',end:'2026-11-08'});
  assert.deepEqual(weekRange('2026-11-08'),{start:'2026-11-02',end:'2026-11-08'});
  assert.deepEqual(weekRange('2026-11-02T15:30:00Z'),{start:'2026-11-02',end:'2026-11-08'}); // KST 11/3 00:30
});

test('pickGoal prefers the goal covering today and ignores other target docs',()=>{
  const old={...goal,start:'2026-07-01',end:'2026-09-30',label:'3분기'};
  const yearly={amount:5000000000}; // 기존 index.html 연간 목표 문서
  assert.equal(pickGoal([yearly,old,goal],'2026-11-03').label,'2026 4분기');
  assert.equal(pickGoal([yearly],'2026-11-03'),null);
});

test('agreed counts negotiation and won, won counts only won, by program',()=>{
  const opps=[
    {_id:'o1',program:'스마트공장',stage:'negotiation',estimatedAmount:400000000},
    {_id:'o2',program:'스마트공장',stage:'won',estimatedAmount:380000000},
    {_id:'o3',program:'제조로봇',stage:'proposal',estimatedAmount:500000000},
    {_id:'o4',program:'제조 로봇',stage:'lost',estimatedAmount:500000000},
    {_id:'o5',program:'',stage:'discovery'},
    {_id:'o6',program:'스마트공장',stage:'won',status:'deleted'}
  ];
  const r=buildPerformance({goal,opportunities:opps,today:'2026-11-03'});
  const sf=r.programs[0],rb=r.programs[1];
  assert.equal(sf.agreedCount,2);assert.equal(sf.wonCount,1);assert.equal(sf.remainingAgreed,1);assert.equal(sf.remainingWon,2);
  assert.equal(sf.wonAmount,380000000);assert.equal(sf.pipelineAmount,400000000);
  assert.equal(rb.agreedCount,0);assert.equal(rb.opportunities.length,2);assert.equal(rb.open.length,1);
  assert.equal(r.totals.targetCount,6);assert.equal(r.totals.targetAmount,2700000000);
  assert.equal(r.totals.remainingAmount,2700000000-380000000);
  assert.deepEqual(r.unassigned.map(o=>o._id),['o5']);
  assert.equal(r.daysLeft,58);assert.equal(r.weeksLeft,9);
});

test('this week collects completed activities, stage moves, new opportunities and done tasks only',()=>{
  const opps=[{_id:'o1',program:'제조로봇',stage:'proposal',createdAt:'2026-11-02T01:00:00Z',
    stageHistory:[{from:null,to:'discovery',at:'2026-10-20T01:00:00Z'},{from:'qualification',to:'proposal',at:'2026-11-04T05:00:00Z'}]}];
  const acts=[
    {_id:'a1',date:'2026-11-03T10:00:00+09:00',type:'현장 방문',status:'완료'},
    {_id:'a2',date:'2026-11-04',type:'메일',status:'완료'},
    {_id:'a3',date:'2026-11-06',type:'첫 미팅',status:'예정'},
    {_id:'a4',date:'2026-10-30',type:'통화',status:'완료'},
    {_id:'a5',date:'2026-11-05',type:'통화',status:'취소'}
  ];
  const tasks=[
    {_id:'t1',status:'done',completedAt:'2026-11-03T09:00:00Z'},
    {_id:'t2',status:'todo',dueAt:'2026-11-10'},
    {_id:'t3',status:'todo',dueAt:'2026-11-01'},
    {_id:'t4',status:'todo',dueAt:'2026-11-20'}
  ];
  const r=buildPerformance({goal,opportunities:opps,activities:acts,tasks,today:'2026-11-05'});
  assert.deepEqual(r.thisWeek.activities.map(a=>a._id),['a1','a2']);
  assert.deepEqual(r.thisWeek.meetings.map(a=>a._id),['a1']);
  assert.equal(r.thisWeek.stageMoves.length,1);assert.equal(r.thisWeek.stageMoves[0].to,'proposal');
  assert.equal(r.thisWeek.newOpportunities.length,1);
  assert.deepEqual(r.thisWeek.doneTasks.map(t=>t._id),['t1']);
  assert.deepEqual(r.upcoming.tasks.map(t=>t._id),['t2']);
  assert.deepEqual(r.upcoming.overdue.map(t=>t._id),['t3']);
  assert.deepEqual(r.upcoming.planned.map(a=>a._id),['a3']);
});

test('no goal still works without inventing targets',()=>{
  const r=buildPerformance({goal:null,opportunities:[{_id:'x',stage:'won'}],today:'2026-11-03'});
  assert.equal(r.programs.length,0);assert.equal(r.totals.targetCount,0);assert.equal(r.daysLeft,null);
});

test('stage history appends only on change and keeps 30',()=>{
  const h1=appendStageHistory({},'discovery','2026-11-01T00:00:00Z');
  assert.deepEqual(h1,[{from:null,to:'discovery',at:'2026-11-01T00:00:00Z'}]);
  const h2=appendStageHistory({stage:'discovery',stageHistory:h1},'discovery','2026-11-02T00:00:00Z');
  assert.equal(h2.length,1);
  const long=Array.from({length:30},(_,i)=>({from:'a',to:'b',at:String(i)}));
  assert.equal(appendStageHistory({stage:'proposal',stageHistory:long},'negotiation').length,30);
  assert.equal(goalDocId('2026-10-01'),'sales-2026Q4');
});
