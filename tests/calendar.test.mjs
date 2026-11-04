import test from 'node:test';
import assert from 'node:assert/strict';
import {seoulDay,calendarEvent,calendarRows,calendarWhen,calendarHealth,renderCalendar} from '../crm2-calendar.mjs';
const fixture={sourceId:'42',title:'가상 미팅',startDate:'2026-11-04',endDate:'2026-11-04',startTime:'14:00',endTime:'',attendees:['가상 담당자'],allDay:false};
test('Korean day survives UTC midnight boundary',()=>{
  assert.equal(seoulDay(new Date('2026-11-03T15:01:00Z')),'2026-11-04');
  assert.equal(seoulDay(new Date('2026-11-04T14:59:00Z')),'2026-11-04');
});
test('unknown times preserved; all-day never becomes midnight; invalid dates excluded',()=>{
  assert.equal(calendarEvent({...fixture,startTime:''}).startTime,'');
  assert.equal(calendarEvent({...fixture,allDay:true}).startTime,'');
  assert.equal(calendarEvent({...fixture,startDate:'2026-02-30'}),null);
  assert.equal(calendarEvent({...fixture,endDate:'2026-11-03'}),null);
  assert.equal(calendarEvent({...fixture,sourceId:'../x'}),null);
  assert.match(calendarWhen(calendarEvent(fixture)),/종료 미정/);
  assert.match(calendarWhen(calendarEvent({...fixture,startTime:''})),/시간 미정/);
});
test('deduplicate only by source id; preserve separate same-title events and source edits',()=>{
  const rows=calendarRows([fixture,{...fixture,title:'변경됨'},{...fixture,sourceId:'43'}],{period:'all'});
  assert.equal(rows.length,2);assert.equal(rows.find(e=>e.sourceId==='42').title,'변경됨');
});
test('date overlap inclusive for multi-day/all-day schedules; attendee unspecified is not everyone',()=>{
  const span={...fixture,startDate:'2026-11-02',endDate:'2026-11-05',allDay:true};
  const rows=[span,{...fixture,sourceId:'43',attendees:[]},{...fixture,sourceId:'44',startDate:'2026-11-11',endDate:'2026-11-11'}];
  assert.equal(calendarRows(rows,{today:'2026-11-04',period:'today'}).length,2);
  assert.equal(calendarRows(rows,{today:'2026-11-04',period:'week'}).length,2);
  assert.equal(calendarRows(rows,{today:'2026-11-04',attendee:'가상 담당자'}).length,1);
  assert.equal(calendarRows(rows,{period:'all'}).length,3);
});
test('source-owned schedule normalization cannot inject company/stage/completed activity',()=>{
  const row=calendarEvent({...fixture,companyId:'real-company',stage:'won',status:'완료',estimatedAmount:999});
  assert.equal(row.companyId,undefined);assert.equal(row.status,undefined);assert.equal(row.stage,undefined);assert.equal(row.estimatedAmount,undefined);
});
test('UI escapes source strings and distinguishes missing, failed and stale collection',()=>{
  const html=renderCalendar({events:[{...fixture,title:'<img onerror="bad()">',attendees:['<x>']}],period:'all'});
  assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&lt;x&gt;'));
  assert.match(renderCalendar({error:'private-error'}),/일정 조회에 실패/);assert.ok(!renderCalendar({error:'private-error'}).includes('private-error'));
  assert.match(calendarHealth(null),/아직/);
  assert.match(calendarHealth({lastSuccess:'2026-11-02T01:00:00Z'},new Date('2026-11-04T02:00:00Z')),/하루 이상/);
  assert.match(calendarHealth({lastSuccess:'2026-11-04T01:00:00Z',lastError:'fail'},new Date('2026-11-04T02:00:00Z')),/수집 실패/);
});
