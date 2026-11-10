import test from 'node:test';
import assert from 'node:assert/strict';
import {freeformNoteRecord,selectedProgress,saveProgress} from '../crm2-records.mjs';
import {activityDate,activityReportDate,canCountActivity,isMeetingActivity,latestActivity} from '../crm2-core.mjs';
import {activityIdentity,activitySourceLabel} from '../crm2-identity.mjs';
import {buildFocusRows} from '../crm2-focus.mjs';
import {buildCoverage} from '../crm2-coverage.mjs';
import {buildPerformance} from '../crm2-performance.mjs';
import {buildTimelineRows} from '../crm2-timeline.mjs';
import {buildRecentUpdates,renderRecentUpdates} from '../crm2-updates.mjs';
import {renderCalendar} from '../crm2-calendar.mjs';
const company={_id:'synthetic-note-company',name:'[가상] 메모 테스트 업체',kind:'고객사',stage:'리드'};
const raw='  생각난 내용\n\n 내일 미팅? 11/15 제안서 전달할까\n\t① 검토  ② 보류 <script>ignored</script>\n  ';
const note={_id:'synthetic-note',...freeformNoteRecord({companyId:company._id,summary:raw,createdBy:'author',now:'2026-11-10T01:00:00Z'})};
const state={companies:[company],activities:[note],tasks:[],opportunities:[],projects:[],profiles:{}};
test('freeform notes keep exact text with no extracted or inferred facts',()=>{
 assert.equal(note.summary,raw);assert.equal(note.source,'crm2-note');assert.equal(note.recordKind,'undated_note');
 assert.equal(note.date,null);assert.equal(note.datePrecision,'unknown');assert.equal(note.meetingRecord,false);
 assert.equal(note.createdBy,'author');assert.equal(note.createdAt,note.updatedAt);
 for(const key of ['sourceActor','sourceRef','nextAction','nextDue','attendeesClient','attendeesUs','stage','report','updatedBy'])assert.equal(key in note,false,key);
 assert.equal(note.title,'메모');assert.equal(activityReportDate(note),'');
});
test('only empty or excessive notes are rejected, never normalized',()=>{
 for(const summary of ['', ' \n\t ',null,undefined,42])assert.throws(()=>freeformNoteRecord({companyId:'test',summary}),/메모를 입력/);
 assert.throws(()=>freeformNoteRecord({companyId:'test',summary:'a'.repeat(150001)}),/15만/);
 assert.equal(freeformNoteRecord({companyId:'test',summary:'a'.repeat(150000)}).summary.length,150000);
 const source='\r\n  <메모>\t\u00a0 \r\n';assert.equal(freeformNoteRecord({companyId:'test',summary:source}).summary,source);
 assert.throws(()=>freeformNoteRecord({summary:'내용'}),/업체/);
});
test('manual source, account author and server saver remain separate',()=>{
 const identity=activityIdentity(note,{profiles:{author:{name:'[가상] 작성자'},editor:{name:'[가상] 저장자'}},lastSavedBy:'editor'});
 assert.equal(identity.sourceLabel,'직접 작성 메모');assert.equal(identity.author,'[가상] 작성자');assert.equal(identity.editor,'[가상] 저장자');assert.equal(identity.participants,'');
 assert.doesNotMatch(identity.sourceLabel,/dot/);assert.equal(activitySourceLabel({source:'dot-conversation',sourceActor:{kind:'service',id:'dot'}}),'dot 대화 정리');
 assert.equal(activityIdentity({...note,updatedBy:'forged'}).editorId,'');
});
test('manual note dates never count as contacts, meetings, deadlines, or performance',()=>{
 assert.equal(activityDate(note),'');assert.equal(canCountActivity(note),false);assert.equal(isMeetingActivity(note),false);assert.equal(latestActivity(company._id,[note]),null);
 const focus=buildFocusRows(state,{today:'2026-11-10'}).allRows[0];assert.equal(focus.contactCount,0);assert.equal(focus.lastContact,null);assert.equal(focus.inFocus,false);assert.equal(focus.actions.length,0);
 const coverage=buildCoverage(state.companies,{},state.activities,[],{today:'2026-11-10'})[0];assert.equal(coverage.contactCount,0);assert.equal(coverage.lastContact,null);assert.equal(coverage.actions.length,0);
 const performance=buildPerformance({...state,today:'2026-11-10'});assert.equal(performance.thisWeek.activities.length,0);assert.equal(performance.thisWeek.contacts.length,0);assert.equal(performance.thisWeek.meetings.length,0);assert.equal(performance.upcoming.planned.length,0);
 const row=buildTimelineRows(state.companies,state.activities,[],[],{today:'2026-11-10'})[0];assert.equal(row.startDay,null);assert.equal(row.latestUpdate,null);assert.equal(row.stageKey,'discovery');assert.equal(row.nextDue,null);assert.equal(row.events[0].undated,true);assert.equal(row.events[0].recordedAt,note.createdAt);
 assert.doesNotMatch(renderCalendar({events:[],demo:true,activities:[note]}),/생각난 내용/);
});
test('manual notes appear as manual recent changes without conversation report date or next action',()=>{
 const update=buildRecentUpdates(state,{now:new Date('2026-11-10T12:00:00Z')});assert.equal(update.cards.length,1);assert.equal(update.cards[0].latest.manualNote,true);assert.equal(update.cards[0].latest.activityDate,'');assert.equal(update.cards[0].latest.reportedAt,'');assert.equal(update.cards[0].nextAction,'');
 const html=renderRecentUpdates(state,{now:new Date('2026-11-10T12:00:00Z')});assert.match(html,/직접 작성 메모/);assert.doesNotMatch(html,/대화 확인 메모|대화 보고일|활동일 미상|dot/);
});
test('a manual note cannot change progress or become a meeting even with conflicting metadata',async()=>{
 const conflicting={...note,type:'미팅',meetingRecord:true,status:'예정',nextDue:'2026-11-15',nextAction:'미정',date:'2026-11-15'};
 assert.equal(activityDate(conflicting),'');assert.equal(isMeetingActivity(conflicting),false);assert.equal(canCountActivity(conflicting),false);
 const data={...state,activities:[conflicting],canWrite:true,demo:true};assert.equal(buildFocusRows(data,{today:'2026-11-10'}).allRows[0].actions.length,0);
 const fd=new FormData();fd.set('updateProgress','on');fd.set('progressYear','2026');fd.set('progressStage','won');assert.throws(()=>selectedProgress(fd,note),/확인 메모/);
 await assert.rejects(()=>saveProgress(data,company._id,{year:2026,stage:'won'},{sourceActivityId:note._id}),/확인 메모/);
});
