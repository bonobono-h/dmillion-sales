import test from 'node:test';
import assert from 'node:assert/strict';
import {activityTypeFromText,buildRuleAgentDraft,explicitAgentTasks,matchAgentCompanies,occurredAtFromText,sanitizeAgentDraft} from '../crm2-agent-core.mjs';

const now=new Date('2026-11-03T14:30:00+09:00');

test('explicit company names are matched locally without sending the whole CRM list',()=>{
  const companies=[{_id:'kblue',name:'케이블루'},{_id:'coolinglab',name:'쿨링랩'},{_id:'short',name:'디엠'}];
  assert.deepEqual(matchAgentCompanies('오늘 쿨링랩 부장과 통화했어',companies).map(x=>x.id),['coolinglab']);
  assert.equal(matchAgentCompanies('회사 담당자와 통화했어',companies).length,0);
  assert.equal(matchAgentCompanies('케이 블루와 쿨링랩 논의',companies).length,2);
});

test('activity type and activity date avoid turning a future plan into a completed meeting',()=>{
  assert.equal(activityTypeFromText('오늘 공장 현장 방문을 마쳤어'),'현장 방문');
  assert.equal(activityTypeFromText('전화로 확인했어'),'전화');
  assert.equal(occurredAtFromText('어제 통화했어',now).value,'2026-11-02T14:30');
  assert.equal(occurredAtFromText('다음 주에 미팅하기로 했어',now).value,'');
});

test('only explicit salesperson commitments become tasks and ambiguous weeks stay undated',()=>{
  const tasks=explicitAgentTasks('고객이 비전검사에 관심이 있어. 다음 주에 내가 공고 자료를 보내주기로 했어. 내일 제가 다시 연락해야 해.',now);
  assert.equal(tasks.length,2);
  assert.equal(tasks[0].title,'공고 자료를 보내기');
  assert.equal(tasks[0].dueAt,'');
  assert.equal(tasks[1].dueAt,'2026-11-04');
  assert.equal(explicitAgentTasks('고객이 자료를 원한다고 했어.',now).length,0);
  assert.equal(explicitAgentTasks('내년에 지원사업으로 추진하고 싶다고 했고, 다음 주에 내가 공고 자료를 보내주기로 했어.',now)[0].title,'공고 자료를 보내기');
});

test('rule draft separates unknowns and never changes a company stage',()=>{
  const candidates=[{id:'kblue',name:'케이블루',reason:'이름 일치'}];
  const draft=buildRuleAgentDraft('오늘 케이블루와 통화했어. 예산은 아직 미정이래. 다음 주에 내가 공고 자료를 보내주기로 했어.',{now,candidates});
  assert.equal(draft.companyCandidates[0].id,'kblue');
  assert.match(draft.unknowns.join(' '),/정확한 날짜|확정값/);
  assert.equal(draft.tasks[0].dueAt,'');
  assert.equal(Object.hasOwn(draft,'stage'),false);
  assert.equal(Object.hasOwn(draft,'budget'),false);
});

test('completed call is not replaced by a future visit or proposal review',()=>{
  const text='오늘 가온정밀 담당자와 통화했어. 비전검사 제안서를 검토 중이고 예산은 아직 미정이라고 했어. 내일 내가 샘플 사진을 보내주기로 했어. 다음 주 현장 방문은 날짜가 정해지지 않았어.';
  const draft=buildRuleAgentDraft(text,{now,candidates:[{id:'demo',name:'가온정밀'}]});
  assert.equal(draft.activityType,'전화');
  assert.equal(draft.tasks[0].dueAt,'2026-11-04');
  assert.equal(activityTypeFromText('오늘 전화로 제안서를 검토했어. 다음 주 현장 방문하기로 했어.'),'전화');
  assert.equal(activityTypeFromText('오늘 통화했고 다음 주 현장 방문하기로 했어.'),'전화');
  assert.equal(activityTypeFromText('오늘 공장 방문을 마쳤어. 내일 내가 전화하기로 했어.'),'현장 방문');
});

test('follow-up calendar dates cannot replace the completed activity date',()=>{
  assert.equal(occurredAtFromText('오늘 통화했어. 2026-11-04 내가 자료를 보내주기로 했어.',now).value,'2026-11-03T14:30');
  assert.equal(occurredAtFromText('2026-11-02 현장 방문했어. 2026-11-04 내가 자료를 보내주기로 했어.',now).value,'2026-11-02T12:00');
  assert.equal(occurredAtFromText('2026-11-04 미팅하기로 했어.',now).value,'');
  assert.equal(occurredAtFromText('2026-11-04 현장 방문',now).value,'');
});

test('Seoul dates and times stay correct on UTC servers and over Korean midnight',()=>{
  assert.equal(occurredAtFromText('오늘 통화했어.',new Date('2026-11-04T04:53:00Z')).value,'2026-11-04T13:53');
  const midnight=new Date('2026-12-31T15:30:00Z');
  assert.equal(occurredAtFromText('오늘 통화했어.',midnight).value,'2027-01-01T00:30');
  assert.equal(occurredAtFromText('어제 통화했어.',midnight).value,'2026-12-31T00:30');
  assert.equal(explicitAgentTasks('내일 내가 자료를 보내주기로 했어.',midnight)[0].dueAt,'2027-01-02');
});

test('AI-shaped output is bounded and invalid dates are removed',()=>{
  const fallback=buildRuleAgentDraft('오늘 쿨링랩과 통화했어.',{now,candidates:[{id:'coolinglab',name:'쿨링랩'}]});
  const result=sanitizeAgentDraft({mode:'ai',title:'x'.repeat(200),summary:'요약',activityType:'계약 완료',occurredAt:'bad',confirmedFacts:['확인'],unknowns:[],stageSuggestion:'계약 확정',tasks:[{title:'연락',dueAt:'2026-02-30',evidence:'말함'}],warnings:[]},fallback);
  assert.equal(result.mode,'ai');
  assert.equal(result.title.length,160);
  assert.equal(result.activityType,'전화');
  assert.equal(result.occurredAt,'');
  assert.equal(result.tasks[0].dueAt,'');
});
