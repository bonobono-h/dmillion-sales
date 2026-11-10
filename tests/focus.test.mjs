import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFocusRows} from '../crm2-focus.mjs';
const today='2026-11-10';
const company={_id:'c1',name:'대한로봇',kind:'고객사',stage:'리드'};
const contact={_id:'a1',companyId:'c1',date:'2026-11-03',type:'통화',status:'완료',summary:'요구사항 확인'};
const task={_id:'t1',companyId:'c1',title:'목요일 미팅 가능 여부 확인',status:'todo'};
const run=(extra={},options={})=>buildFocusRows({companies:[company],...extra},{today,...options});

test('default hides untouched leads and partners, detail retains every customer',()=>{
  const result=run({companies:[company,{...company,_id:'c2',kind:'협력사',stage:'협상'}]});
  assert.equal(result.rows.length,0);assert.equal(result.allRows.length,1);
  assert.equal(result.counts.focus,0);
  assert.equal(run({companies:[{...company,updatedAt:today}]}).rows.length,0);
});
test('latest completed actual contact supplies summary; memo and edits never replace it',()=>{
  const acts=[contact,{...contact,_id:'memo',type:'메모',date:today,summary:'새 메모'},
    {...contact,_id:'future',date:'2026-11-11',summary:'미래'},
    {...contact,_id:'planned',date:today,status:'예정',summary:'예정'},
    {...contact,_id:'cancelled',date:today,status:'취소'},
    {...contact,_id:'deleted',date:today,status:'deleted'}];
  const row=run({activities:acts}).rows[0];
  assert.equal(row.latestContact,contact);assert.equal(row.summary,'요구사항 확인');
  assert.equal(row.lastContact,'2026-11-03');assert.equal(row.days,7);assert.equal(row.contactCount,1);
});
test('unconfirmed Thursday is an exact undated task, never a completed event or inferred deadline',()=>{
  const row=run({tasks:[task],activities:[{...contact,type:'메모',date:today,summary:'목요일 미팅 미확정'}]}).rows[0];
  assert.equal(row.latestContact,null);assert.equal(row.lastContact,null);assert.equal(row.summary,'');
  assert.equal(row.next.title,task.title);assert.equal(row.next.due,null);
  assert.equal(row.next.taskId,'t1');assert.equal(row.next.status,'todo');assert.equal(row.next.source,'task');
  assert.equal(row.activeTaskCount,1);assert.equal(row.overdue,0);
});
test('date validity, Seoul timezone and no fallback to created/updated timestamps',()=>{
  for(const date of ['invalid','2026-02-30','2026-11-11','']) {
    assert.equal(run({activities:[{...contact,date,updatedAt:today,createdAt:today}]}).rows.length,0);
  }
  const row=run({activities:[{...contact,date:'2026-11-09T15:30:00Z'}]}).rows[0];
  assert.equal(row.lastContact,today);assert.equal(row.days,0);
});
test('recent window is inclusive; older contacts remain accessible in contacted filter',()=>{
  assert.equal(run({activities:[{...contact,date:'2026-10-11'}]}).rows.length,1);
  const result=run({activities:[{...contact,date:'2026-10-10'}]});
  assert.equal(result.rows.length,0);assert.equal(result.counts.contacted,1);
  assert.equal(run({activities:[{...contact,date:'2026-10-10'}]},{filter:'contacted'}).rows.length,1);
});
test('planned upcoming meeting is next action but never contact; invalid and past planned dates excluded',()=>{
  const row=run({activities:[{...contact,type:'미팅',status:'예정',date:'2026-11-12'}]}).rows[0];
  assert.equal(row.next.source,'meeting');assert.equal(row.next.due,'2026-11-12');assert.equal(row.contactCount,0);
  for(const date of ['bad','2026-11-09','2026-02-30'])
    assert.equal(run({activities:[{...contact,type:'미팅',status:'예정',date}]}).rows.length,0);
});
test('explicit open work qualifies without fake contact; hold/closed opportunities and finished projects do not',()=>{
  for(const extra of [
    {opportunities:[{companyId:'c1',stage:'proposal'}]},
    {projects:[{companyIds:['c1'],status:'수행 중'}]},
    {companies:[{...company,stage:'협상'}]}
  ]) {const row=run(extra).rows[0];assert.ok(row);assert.equal(row.lastContact,null);}
  for(const stage of ['hold','won','lost']) assert.equal(run({opportunities:[{companyId:'c1',stage}]}).rows.length,0);
  for(const status of ['완료','보류','미정','']) assert.equal(run({projects:[{companyId:'c1',status}]}).rows.length,0);
});
test('legacy conversion and activity linked completion never resurrect closed tasks',()=>{
  const c={...company,nextAction:'① 제안 발송 ② 결과 확인'};
  const tasks=[{...task,title:'제안 발송',source:'legacy-nextAction',status:'done'},
    {...task,_id:'t2',title:'후속 통화',sourceActivityId:'a1',status:'done'}];
  const row=run({companies:[c],tasks,activities:[{...contact,nextAction:'후속 통화'}]}).rows[0];
  assert.deepEqual(row.actions.map(a=>a.title),['결과 확인']);assert.equal(row.next.source,'legacy');
  assert.equal(row.activeTaskCount,0);
  assert.equal(run({companies:[{...company,nextAction:'업무'}],tasks:[{...task,title:'업무',status:'deleted'}]}).rows.length,0);
});
test('missing and malformed deadlines are preserved without fabrication and done tasks are excluded',()=>{
  const row=run({tasks:[task,{...task,_id:'t2',title:'기한 확인',dueAt:'목요일'},
    {...task,_id:'t3',title:'완료',dueAt:'2026-11-01',status:'completed'}]}).rows[0];
  assert.equal(row.actions.length,2);assert.equal(row.overdue,0);
  assert.equal(row.actions.find(a=>a.id==='t2').rawDue,'목요일');
  assert.equal(row.actions.find(a=>a.id==='t2').due,null);
});
test('deterministic priority sorting, Korean initial search and counts',()=>{
  const companies=[company,{...company,_id:'c2',name:'가상기술'},{...company,_id:'c3',name:'나무산업'}];
  const tasks=[task,{...task,_id:'t2',companyId:'c2',dueAt:'2026-11-09'},
    {...task,_id:'t3',companyId:'c3',dueAt:today}];
  const state={companies,tasks,activities:[contact]};
  const result=run(state);
  assert.deepEqual(result.rows.map(r=>r.id),['c2','c3','c1']);
  assert.equal(result.counts.overdue,1);assert.equal(result.counts.action,3);assert.equal(result.counts.contacted,1);
  assert.deepEqual(run(state,{query:'ㄷㅎㄹㅂ'}).rows.map(r=>r.id),['c1']);
  assert.equal(run(state,{query:'ㄷㅎㄹㅂ'}).allRows.length,3);
  assert.deepEqual(run({...state,companies:[...companies].reverse(),tasks:[...tasks].reverse()}).rows.map(r=>r.id),['c2','c3','c1']);
});
test('input is untouched and blank latest summary does not borrow an older contact or company memo',()=>{
  const input={companies:[{...company,memo:'메모'}],activities:[contact,{...contact,_id:'a2',date:today,summary:''}],tasks:[task]};
  const before=JSON.stringify(input);const result=run(input);
  assert.equal(result.rows[0].summary,'');assert.equal(JSON.stringify(input),before);
});

test('legacy contact content remains visible and searchable',()=>{const state={companies:[company],activities:[{...contact,summary:'',content:'냉각 적용 범위 확인'}]};const result=run(state,{query:'냉각'});assert.equal(result.rows.length,1);assert.equal(result.rows[0].summary,'냉각 적용 범위 확인');});

test('undated follow-ups are not buried below distant future work',()=>{const companies=[company,{...company,_id:'c2',name:'미래 업무 업체'}];const tasks=[{...task,dueAt:null},{...task,_id:'future',companyId:'c2',dueAt:'2027-12-01'}];assert.deepEqual(run({companies,tasks}).rows.map(row=>row.id),['c1','c2']);});

test('explicit current-year progress qualifies active work even when the company stage is old',()=>{
  for(const stage of ['meeting','visit','qualification','proposal','negotiation','won']){
    const profiles={c1:{yearProgress:{2026:{stage}}}};
    const row=run({profiles}).rows[0];
    assert.ok(row,stage);assert.equal(row.lastContact,null);assert.equal(row.next,null);
    assert.match(row.reason,/진행 단계:/);assert.doesNotMatch(row.reason,/리드/);
  }
});

test('explicit inactive or unknown progress cannot revive an old active company stage',()=>{
  for(const stage of ['discovery','not_started','hold','lost','custom','',null]){
    const companies=[{...company,stage:'협상'}],profiles={c1:{yearProgress:{2026:{stage}}}};
    assert.equal(run({companies,profiles}).rows.length,0,String(stage));
    assert.equal(run({companies,profiles,tasks:[task]}).rows.length,1,'real task: '+stage);
    assert.equal(run({companies,profiles,activities:[contact]}).rows.length,1,'actual recent contact: '+stage);
  }
});

test('focus progress uses today’s Seoul year and never an unrelated selected year',()=>{
  const profiles={c1:{yearProgress:{2026:{stage:'hold'},2027:{stage:'meeting'}}}};
  assert.equal(run({profiles}).rows.length,0);
  assert.equal(run({profiles},{today:'2026-12-31T16:00:00Z'}).rows.length,1);
  assert.equal(run({profiles:{c1:{yearProgress:{2027:{stage:'meeting'}}}}}).rows.length,0);
  assert.equal(run({companies:[{...company,stage:'협상'}],profiles:{c1:{yearProgress:{2026:{}}}}}).rows.length,1);
});
