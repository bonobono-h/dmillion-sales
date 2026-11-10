import test from 'node:test';
import assert from 'node:assert/strict';
import {BOARD_STAGES,buildStageBoard} from '../crm2-board.mjs';
import {buildFocusRows} from '../crm2-focus.mjs';

const today='2026-11-10';
const focus=(stage='리드',extra={})=>({id:'c1',companyId:'c1',name:'가상 업체',
  company:{_id:'c1',name:'가상 업체',stage,...extra},next:null,actions:[],priority:5});
const board=(rows=[focus()],options={})=>buildStageBoard(rows,{today,...options});
const companyAge=(stage,stageHistory,options={})=>board([focus(stage,{stageHistory})],options).rows[0];
const progressAge=(stage,history,options={})=>board([focus('리드')],{
  profiles:{c1:{yearProgress:{2026:{stage,history}}}},...options}).rows[0];
const deepFreeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);for(const nested of Object.values(value))deepFreeze(nested);
  }
  return value;
};

test('stable ordered columns include empty stages and accurate counts',()=>{
  const result=board([]);
  assert.deepEqual(result.columns.map(column=>column.key),[
    'lead','contact','meeting','needs','proposal','negotiation','contract','execution','hold','other'
  ]);
  assert.equal(result.total,0);
  assert.ok(result.columns.every(column=>column.count===0&&column.rows.length===0));
  assert.ok(Object.isFrozen(BOARD_STAGES)&&BOARD_STAGES.every(Object.isFrozen));
});

test('known stored stages map explicitly without merging different pipeline steps',()=>{
  const expected={
    '리드':'lead','발굴':'lead','discovery':'lead','컨택 중':'contact',
    '첫 미팅':'meeting','현장 방문':'meeting','meeting':'meeting','visit':'meeting',
    '요구 확인':'needs','과제신청 준비':'needs','qualification':'needs',
    '제안':'proposal','제안·견적':'proposal','proposal':'proposal','협상':'negotiation',
    'negotiation':'negotiation','계약':'contract','선정':'contract','수주':'contract','won':'contract',
    '수행 중':'execution','수행':'execution','완료':'execution',
    '보류':'hold','실패':'hold','드랍·탈락':'hold','종료':'hold','hold':'hold','lost':'hold'
  };
  for(const [stage,key] of Object.entries(expected)){
    const row=board([focus(stage)]).rows[0];
    assert.equal(row.stageKey,key,stage);assert.equal(row.stageRaw,stage);
  }
});

test('unknown and unclassified stages are preserved rather than guessed from text',()=>{
  for(const stage of ['','미정','별도 검토','미팅일 미정','제안 검토 대기','메일 전송 요청']){
    const row=board([focus(stage)]).rows[0];
    assert.equal(row.stageKey,'other');assert.equal(row.stageRaw,stage);
    assert.equal(row.stageLabel,stage&&stage!=='미정'?stage:'단계 미정');
  }
});

test('preserves every input row once, duplicate IDs and per-column input ordering',()=>{
  const input=[focus('협상'),focus('리드'),focus('협상'),focus('custom'),focus('첫 미팅')];
  input.forEach((row,index)=>row.marker=index);
  const result=board(input),flattened=result.columns.flatMap(column=>column.rows);
  assert.equal(result.total,input.length);
  assert.equal(result.columns.reduce((sum,column)=>sum+column.count,0),input.length);
  assert.deepEqual(flattened.map(row=>row.marker).sort(),[0,1,2,3,4]);
  assert.deepEqual(result.columns.find(column=>column.key==='negotiation').rows.map(row=>row.marker),[0,2]);
  assert.deepEqual(result.rows.map(row=>row.marker),[0,1,2,3,4]);
});

test('does not mutate frozen inputs or replace the focus row data and actions',()=>{
  const source=focus('리드',{stageHistory:[{to:'리드',from:null,at:'2026-11-01'}]});
  source.next={title:'후속 확인',due:null};source.actions=[source.next];
  const input=deepFreeze([source]);
  const options=deepFreeze({today,profiles:{c1:{yearProgress:{2027:{stage:'won'}}}}});
  const before=JSON.stringify({input,options}),result=buildStageBoard(input,options);
  assert.equal(JSON.stringify({input,options}),before);
  assert.notEqual(result.rows[0],source);
  for(const field of ['company','next','actions'])assert.equal(result.rows[0][field],source[field]);
});

test('completed contacts, planned meetings, tasks and opportunity-like fields never infer stage',()=>{
  const state={companies:[{_id:'c1',name:'가상 업체',stage:'리드'}],
    activities:[{_id:'a1',companyId:'c1',type:'미팅',status:'완료',date:today}],
    tasks:[{_id:'t1',companyId:'c1',title:'계약서 발송',status:'todo'}],
    opportunities:[{_id:'o1',companyId:'c1',stage:'won',estimatedAmount:999999}]};
  const rows=buildFocusRows(state,{today}).rows;
  rows[0].stageKey='won';rows[0].stage='won';
  const result=board(rows);
  assert.equal(result.rows[0].stageKey,'lead');
  assert.equal(result.rows[0].stageAgeDays,null);
  assert.ok(result.columns.every(column=>!hasAmount(column)));
});
function hasAmount(object){return ['amount','value','totalAmount','estimatedAmount'].some(key=>key in object);}

test('selected-year saved progress takes precedence, with original source and label',()=>{
  const profiles={c1:{yearProgress:{2026:{stage:'qualification'},2027:{stage:'won'}}}};
  const current=board([focus('계약')],{profiles}).rows[0];
  assert.equal(current.stageKey,'needs');assert.equal(current.stageSource,'yearProgress');
  assert.equal(current.stageRaw,'qualification');assert.equal(current.stageLabel,'요구 확인');
  const next=board([focus('리드')],{profiles,year:2027}).rows[0];
  assert.equal(next.stageKey,'contract');assert.equal(next.stageLabel,'수주');
});

test('missing selected-year progress uses company only, never another year',()=>{
  for(const progress of [undefined,{},null]){
    const profiles={c1:{yearProgress:{2026:progress,2027:{stage:'won'}}}};
    const row=board([focus('컨택 중')],{profiles}).rows[0];
    assert.equal(row.stageKey,'contact');assert.equal(row.stageSource,'company');
  }
});

test('unrecognized or cleared explicit progress remains authoritative instead of reviving an old stage',()=>{
  for(const stage of ['typo','','__proto__',null,'계약','Proposal']){
    const profiles={c1:{yearProgress:{2026:{stage},2027:{stage:'won'}}}};
    const row=board([focus('계약')],{profiles}).rows[0];
    assert.equal(row.stageKey,'other');assert.equal(row.stageSource,'yearProgress');
    assert.equal(row.stageRaw,String(stage??''));
    assert.equal(row.stageLabel,stage||'단계 미정');
  }
});

test('explicit not_started remains visible with its actual label',()=>{
  const row=progressAge('not_started',[{stage:'not_started',at:'2026-11-01'}]);
  assert.equal(row.stageKey,'other');assert.equal(row.stageLabel,'미진행');
  assert.equal(row.stageAgeDays,9);
});

test('generic timestamps and contacts are never residence start dates',()=>{
  const source=focus('협상',{createdAt:'2026-01-01',updatedAt:'2026-11-09',stageStartedAt:'2026-11-02'});
  source.latestContact={date:'2026-11-03'};source.lastContact='2026-11-03';
  assert.equal(board([source]).rows[0].stageAgeDays,null);
  const profiles={c1:{yearProgress:{2026:{stage:'proposal',createdAt:'2026-01-01',updatedAt:'2026-11-09',startedAt:'2026-11-01'}}}};
  assert.equal(board([source],{profiles}).rows[0].stageAgeStatus,'missing-history');
});

test('year progress residence uses matching at history and does not reset on same-stage updates',()=>{
  const row=progressAge('proposal',[
    {stage:'discovery',at:'2026-10-01'},
    {stage:'proposal',at:'2026-11-01'},
    {stage:'proposal',at:'2026-11-09'}
  ]);
  assert.equal(row.stageSince,'2026-11-01');assert.equal(row.stageAgeDays,9);
  assert.equal(row.stageAgeStatus,'known');assert.ok(row.stageAgeReason);
});

test('re-entering an earlier stage starts a new residence period',()=>{
  const row=progressAge('proposal',[
    {stage:'proposal',at:'2026-10-01'},
    {stage:'negotiation',at:'2026-11-01'},
    {stage:'proposal',at:'2026-11-05'},
    {stage:'proposal',at:'2026-11-09'}
  ]);
  assert.equal(row.stageSince,'2026-11-05');assert.equal(row.stageAgeDays,5);
});

test('company transition history proves age and later same-stage updates do not reset it',()=>{
  const row=companyAge('제안·견적',[
    {from:'리드',to:'제안',at:'2026-11-02'},
    {from:'제안',to:'제안·견적',at:'2026-11-09'}
  ]);
  assert.equal(row.stageAgeDays,8);assert.equal(row.stageSince,'2026-11-02');
});

test('same-stage-only transition records do not prove the original entry date',()=>{
  const row=companyAge('협상',[{from:'협상',to:'협상',at:'2026-11-03'}]);
  assert.equal(row.stageAgeDays,null);assert.equal(row.stageAgeStatus,'repeated-only');
});

test('moving within a shared column is still a real stage change',()=>{
  const row=companyAge('현장 방문',[
    {from:'리드',to:'첫 미팅',at:'2026-11-01'},
    {from:'첫 미팅',to:'현장 방문',at:'2026-11-07'}
  ]);
  assert.equal(row.stageKey,'meeting');assert.equal(row.stageLabel,'현장 방문');
  assert.equal(row.stageAgeDays,3);
});

test('unsorted valid history is ordered by timestamp without changing the input',()=>{
  const history=deepFreeze([{stage:'proposal',at:'2026-11-09'},
    {stage:'discovery',at:'2026-10-01'},{stage:'proposal',at:'2026-11-01'}]);
  const row=progressAge('proposal',history);
  assert.equal(row.stageSince,'2026-11-01');assert.equal(history[0].at,'2026-11-09');
});

test('a stale matching event cannot override a later conflicting current history',()=>{
  const row=progressAge('proposal',[
    {stage:'proposal',at:'2026-11-01'},{stage:'negotiation',at:'2026-11-02'}
  ]);
  assert.equal(row.stageAgeDays,null);assert.equal(row.stageAgeStatus,'current-stage-mismatch');
});

test('only the matching stage source and selected year can supply residence',()=>{
  const source=focus('협상',{stageHistory:[{to:'협상',at:'2026-11-01'}]});
  const profiles={c1:{yearProgress:{2026:{stage:'negotiation'},2027:{stage:'negotiation',history:[{stage:'negotiation',at:'2026-11-02'}]}}}};
  const row=board([source],{profiles}).rows[0];
  assert.equal(row.stageAgeDays,null);assert.equal(row.stageAgeStatus,'missing-history');
});

test('missing, malformed and rollover dates stay unknown with an explanation',()=>{
  for(const at of [undefined,'','bad','11/03/2026','2026-02-30','2026-02-30T12:00:00Z','2026-11-03T24:00:00Z',1760000000000]){
    const row=progressAge('proposal',[{stage:'proposal',at,updatedAt:'2026-11-01',createdAt:'2026-11-01'}]);
    assert.equal(row.stageAgeDays,null,String(at));
    assert.equal(row.stageAgeStatus,'invalid-timestamp');assert.ok(row.stageAgeReason);
  }
});

test('future stage timestamps are not clamped to zero',()=>{
  assert.equal(progressAge('proposal',[{stage:'proposal',at:'2026-11-11'}]).stageAgeStatus,'future-timestamp');
  const row=progressAge('proposal',[{stage:'proposal',at:'2026-11-10T02:00:00Z'}],{today:'2026-11-10T01:00:00Z'});
  assert.equal(row.stageAgeDays,null);assert.equal(row.stageAgeStatus,'future-timestamp');
});

test('Seoul day conversion and zero-day ages are explicit',()=>{
  const row=progressAge('proposal',[{stage:'proposal',at:'2026-11-09T15:30:00Z'}]);
  assert.equal(row.stageSince,'2026-11-10');assert.equal(row.stageAgeDays,0);
});

test('equal or imprecise timestamps cannot prove conflicting stage order',()=>{
  for(const pair of [
    ['2026-11-01','2026-11-01'],
    ['2026-11-01','2026-11-01T05:00:00Z'],
    ['2026-11-01T05:00:00Z','2026-11-01T05:00:00Z']
  ]){
    const row=progressAge('proposal',[{stage:'discovery',at:pair[0]},{stage:'proposal',at:pair[1]}]);
    assert.equal(row.stageAgeDays,null);assert.equal(row.stageAgeStatus,'conflicting-history');
  }
});

test('distinct exact times on one day can prove transition order',()=>{
  const row=progressAge('proposal',[{stage:'discovery',at:'2026-11-01T01:00:00Z'},
    {stage:'proposal',at:'2026-11-01T02:00:00Z'}]);
  assert.equal(row.stageAgeDays,9);
});

test('broken transition chains and conflicting target fields never manufacture age',()=>{
  const broken=companyAge('협상',[
    {from:null,to:'리드',at:'2026-11-01'},
    {from:'제안',to:'협상',at:'2026-11-03'}
  ]);
  assert.equal(broken.stageAgeStatus,'conflicting-history');
  const fields=companyAge('협상',[{to:'협상',stage:'계약',at:'2026-11-01'}]);
  assert.equal(fields.stageAgeStatus,'conflicting-history');
});

test('malformed history and invalid reference dates are explicit unknowns',()=>{
  for(const history of [{},[null],[{}],[{stage:'',at:'2026-11-01'}]])
    assert.equal(progressAge('proposal',history).stageAgeStatus,'invalid-history');
  const row=companyAge('리드',[{to:'리드',at:'2026-11-01'}],{today:'2026-02-30'});
  assert.equal(row.stageAgeDays,null);assert.equal(row.stageAgeStatus,'invalid-today');
});

test('a custom stage can have a proven age without inventing its classification',()=>{
  const row=companyAge('검토 위원회',[{to:'검토 위원회',at:'2026-11-04'}]);
  assert.equal(row.stageKey,'other');assert.equal(row.stageLabel,'검토 위원회');
  assert.equal(row.stageAgeDays,6);
});
