import test from 'node:test';
import assert from 'node:assert/strict';
import {activityDate,activityEventDate,activityReportDate,activityDisplayStatus,compareActivityDates,canCountActivity,latestActivity,isMeetingActivity} from '../crm2-core.mjs';
import {buildFocusRows} from '../crm2-focus.mjs';
import {buildCoverage} from '../crm2-coverage.mjs';
import {buildPerformance} from '../crm2-performance.mjs';
import {buildTimelineRows} from '../crm2-timeline.mjs';
import {buildRecentUpdates,renderRecentUpdates} from '../crm2-updates.mjs';
import {saveProgress,selectedProgress} from '../crm2-records.mjs';
import {renderCalendar} from '../crm2-calendar.mjs';
const company={_id:'date-fixture',name:'[가상] 날짜 확인',kind:'고객사',stage:'리드',owner:'가상 담당'};
const note={_id:'note',companyId:company._id,source:'dot-conversation',recordKind:'undated_note',type:'메모',status:'확인 메모',date:null,datePrecision:'unknown',meetingRecord:false,title:'날짜가 언급되지 않은 대화',summary:'고객 현황을 대화로 보고함',sourceActor:{kind:'service',id:'dot',label:'dot'},sourceRef:{conversationId:'synthetic-thread',messageId:'synthetic-message',eventId:'synthetic-event',reportedOn:'2026-11-09',reportedAt:'2026-11-09T06:00:00Z',timeZone:'Asia/Seoul'},createdAt:'2026-11-10T01:00:00Z'};
const state=(activities=[note])=>({companies:[company],activities,opportunities:[],tasks:[],projects:[],profiles:{}});
const exact={...note,_id:'exact',recordKind:'completed_activity',type:'메일',status:'완료',date:'2026-11-09',datePrecision:'day'};
test('unknown dates never fall back to event aliases, reported date or creation date',()=>{
 for(const row of [note,{...note,date:'2026-11-09',at:'2026-11-09T12:00:00Z'},{...note,source:undefined,recordKind:undefined}]){
  assert.equal(activityDate(row),'');assert.equal(activityEventDate(row),'');assert.equal(canCountActivity(row),false);
 }
 assert.equal(activityReportDate(note),'2026-11-09T06:00:00Z');
 assert.equal(activityDisplayStatus({...note,status:'완료'}),'확인 메모');
});
test('ordinary legacy rows preserve date/at/createdAt priorities and no-date return',()=>{
 assert.equal(activityDate({date:'2020-01-01',at:'2021-01-01',createdAt:'2022-01-01'}),'2020-01-01');
 assert.equal(activityDate({at:'2021-01-01',createdAt:'2022-01-01'}),'2021-01-01');
 assert.equal(activityDate({createdAt:'2022-01-01'}),'2022-01-01');
 assert.equal(activityEventDate({createdAt:'2022-01-01'}),'');assert.equal(activityDate({}),'');
});
test('dot completed activity requires declared precision and valid explicit actual date',()=>{
 assert.equal(activityDate(exact),'2026-11-09');assert.ok(canCountActivity(exact));
 const stamp={...exact,date:'2026-11-09T18:00:00Z',datePrecision:'timestamp'};
 assert.equal(activityDate(stamp),stamp.date);
 for(const row of [{...exact,date:null},{...exact,datePrecision:undefined},{...exact,date:'2026-02-30'},{...exact,date:'2026-11-09T18:00:00Z'},{...stamp,date:'2026-11-09T18:00:00'},{...stamp,date:'2026-11-09T99:00:00Z'},{...stamp,date:'2026-11-09T24:00:00Z'},{...stamp,date:'2026-11-09T12:00:00+14:01'},{...stamp,date:'2026-11-09T12:00:00+15:00'},{...stamp,date:'2026-11-09T12:00:00+09:99'},{...stamp,date:'2026-11-09T12:60:00Z'},{...stamp,date:'2026-11-09T12:00:60Z'},{...stamp,date:'0000-11-09T12:00:00Z'}]){
  assert.equal(activityDate(row),'');assert.equal(canCountActivity(row),false);
 }
});
test('notes cannot be contacts, planned meetings, next actions or deadlines despite conflicting fields',()=>{
 const poisoned={...note,type:'미팅',status:'완료',meetingRecord:true,date:'2026-11-10',at:'2026-11-10',nextAction:'미확정 후속',nextDue:'2026-11-10'};
 const planned={...poisoned,_id:'planned',status:'예정',date:'2026-11-11'};
 const data=state([note,poisoned,planned]);
 const focus=buildFocusRows(data,{today:'2026-11-10'}).allRows[0];
 assert.equal(focus.contactCount,0);assert.equal(focus.lastContact,null);assert.equal(focus.recent,false);assert.equal(focus.inFocus,false);assert.equal(focus.actions.length,0);
 const coverage=buildCoverage(data.companies,data.profiles,data.activities,data.tasks,{today:'2026-11-10'})[0];
 assert.equal(coverage.contactCount,0);assert.equal(coverage.lastContact,null);assert.equal(coverage.actions.length,0);assert.equal(coverage.overdue,0);
 const performance=buildPerformance({...data,today:'2026-11-10'});
 assert.equal(performance.thisWeek.activities.length,0);assert.equal(performance.thisWeek.contacts.length,0);assert.equal(performance.thisWeek.meetings.length,0);assert.equal(performance.upcoming.planned.length,0);
 assert.equal(latestActivity(company._id,data.activities),null);assert.equal(isMeetingActivity(poisoned),false);
});
test('explicit supported completed activities still count on actual day, never report/registration day',()=>{
 const focus=buildFocusRows(state([note,exact]),{today:'2026-11-10'}).allRows[0];assert.equal(focus.contactCount,1);assert.equal(focus.lastContact,'2026-11-09');
 const coverage=buildCoverage([company],{},[note,exact],[],{today:'2026-11-10'})[0];assert.equal(coverage.contactCount,1);
 const p=buildPerformance({activities:[note,exact],today:'2026-11-10'});assert.deepEqual(p.thisWeek.contacts.map(a=>a._id),['exact']);
 const past={...exact,date:'2026-10-01'};assert.equal(buildPerformance({activities:[past],today:'2026-11-10'}).thisWeek.activities.length,0);
});
test('unknown notes remain visible in timeline but never set start, latest dated activity, target or stage',()=>{
 const row=buildTimelineRows([company],[note],[],[],{today:'2026-11-10'})[0];
 assert.equal(row.events.length,1);assert.equal(row.events[0].date,null);assert.equal(row.events[0].undated,true);assert.equal(row.events[0].reportedAt,note.sourceRef.reportedAt);assert.equal(row.events[0].recordedAt,note.createdAt);
 assert.equal(row.startDay,null);assert.equal(row.latestUpdate,null);assert.equal(row.recentDays,null);assert.equal(row.targetDay,null);assert.equal(row.nextDue,null);assert.equal(row.stageKey,'discovery');
 const mixed=buildTimelineRows([company],[note,exact],[],[],{today:'2026-11-10'})[0];assert.equal(mixed.latestUpdate.id,'exact');assert.equal(mixed.startDay,'2026-11-09');
 const future=buildTimelineRows([company],[note],[],[],{year:2027,today:'2026-11-10'})[0];assert.equal(future.stageKey,'not_started');assert.equal(future.carried,false);
});
test('sorting puts undated notes after actual dates and orders unknown records without inventing activity days',()=>{
 const later={...note,_id:'later',createdAt:'2026-11-11T01:00:00Z'};
 assert.deepEqual([note,later,exact].sort(compareActivityDates).map(a=>a._id),['exact','later','note']);
 assert.equal(activityDate(later),'');
});
test('recent changes show note registration and report date distinctly, with no inferred next action',()=>{
 const data=state([{...note,nextAction:'확인되지 않은 일',nextDue:'2026-11-10'}]);
 const result=buildRecentUpdates(data,{now:new Date('2026-11-10T12:00:00Z')});assert.equal(result.cards.length,1);
 const event=result.cards[0].latest;assert.equal(event.basis,'recorded');assert.equal(event.at,Date.parse(note.createdAt));assert.equal(event.activityDate,'');assert.equal(result.cards[0].nextAction,'');
 const html=renderRecentUpdates(data,{now:new Date('2026-11-10T12:00:00Z')});assert.match(html,/활동일 미상/);assert.match(html,/대화 보고일/);assert.match(html,/CRM 반영/);assert.match(html,/대화 확인 메모/);
 const noStamp=state([{...note,createdAt:null}]);assert.equal(buildRecentUpdates(noStamp,{period:'all'}).totalChanges,0,'report time cannot substitute CRM registration');
});
test('no calendar events are synthesized from activity or report timestamps',()=>{
 const html=renderCalendar({events:[],sync:null,demo:true,activities:[note],today:'2026-11-10'});assert.doesNotMatch(html,/날짜가 언급되지 않은 대화/);assert.match(html,/0건/);
});
test('both selection and low-level progress save reject informational activity sources before writing',async()=>{
 const fd=new FormData();fd.set('updateProgress','on');fd.set('progressYear','2026');fd.set('progressStage','won');
 assert.throws(()=>selectedProgress(fd,note),/확인 메모/);
 const data={...state(),canWrite:true,demo:true};const before=JSON.stringify(data);
 await assert.rejects(()=>saveProgress(data,company._id,{year:2026,stage:'won'},{sourceActivityId:note._id}),/확인 메모/);
 assert.equal(JSON.stringify(data),before);
});

