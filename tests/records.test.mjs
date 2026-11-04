import test from 'node:test';
import assert from 'node:assert/strict';
import {saveContact,saveProgress,selectedProgress,validateContact,suggestedProgress,currentProgress} from '../crm2-records.mjs';

function fixture(documents={},fail=false){
 const docs=structuredClone(documents),writes=[];
 const state={canWrite:true,demo:false,userId:'fixture',companies:[{_id:'test-company',name:'테스트 업체',stage:'리드'}],contacts:{},profiles:{},activities:[],tasks:[],projects:[],opportunities:[],
 db:{doc:path=>({get:async()=>({exists:path in docs,data:()=>structuredClone(docs[path])}),update:async patch=>{if(fail)throw new Error('permission denied');docs[path]={...docs[path],...structuredClone(patch)};writes.push(path);},set:async data=>{if(fail)throw new Error('permission denied');docs[path]=structuredClone(data);writes.push(path);}})}};
 return {state,docs,writes};
}

test('contact save uses protected path, rereads and preserves unrelated fields',async()=>{
 const f=fixture({'data/contacts/items/test-company':{phones:['old'],privateNote:'keep',other:42}});
 await saveContact(f.state,'test-company',{contactPerson:'가상 담당자',phone:'02-000-0000',email:'test@example.com'});
 assert.deepEqual(f.writes,['data/contacts/items/test-company']);
 assert.equal(f.docs[f.writes[0]].privateNote,'keep');
 assert.equal(f.state.contacts['test-company'].email,'test@example.com');
 assert.ok(f.state.contacts['test-company'].contactEditedAt);
 assert.equal(f.state.companies[0].phone,undefined);
 assert.deepEqual(f.state.profiles,{});
});

test('blank contacts are deliberate clears and invalid emails fail before writes',async()=>{
 const f=fixture({'data/contacts/items/test-company':{phone:'02-123-4567'}});
 await saveContact(f.state,'test-company',{phone:'',email:'',contactPerson:''});
 assert.equal(f.docs[f.writes[0]].phone,'');
 assert.throws(()=>validateContact({email:'invalid'}),/이메일/);
 assert.equal(validateContact({email:'a@example.com, b@example.com'}).email,'a@example.com, b@example.com');
 const before=f.writes.length;await assert.rejects(saveContact(f.state,'test-company',{email:'invalid'}));assert.equal(f.writes.length,before);
});

test('view role and rejected writes cannot mutate contact or stage state',async()=>{
 const f=fixture({},true);
 await assert.rejects(saveContact(f.state,'test-company',{phone:'02-000-0000'}),/permission denied/);
 await assert.rejects(saveProgress(f.state,'test-company',{year:2026,stage:'visit'}),/permission denied/);
 assert.deepEqual(f.state.contacts,{});assert.deepEqual(f.state.profiles,{});
 f.state.canWrite=false;
 await assert.rejects(saveContact(f.state,'test-company',{}),/권한/);
 await assert.rejects(saveProgress(f.state,'test-company',{year:2026,stage:'visit'}),/권한/);
 assert.equal(f.writes.length,0);
});

test('2026 manual progress overrides opportunity display and preserves all old and other-year records',async()=>{
 const path='crm2Profiles/test-company';
 const f=fixture({[path]:{accountGrade:'B',yearProgress:{2027:{stage:'proposal',history:[{id:'old',stage:'proposal',at:'2026-11-01'}]}}}});
 f.state.opportunities=[{_id:'old-opp',companyId:'test-company',stage:'discovery',estimatedAmount:123}];
 const oldCompany=structuredClone(f.state.companies),oldOpps=structuredClone(f.state.opportunities);
 await saveProgress(f.state,'test-company',{year:2026,stage:'visit'},{sourceActivityId:'record-1',now:'2026-11-04T02:00:00Z'});
 assert.equal(currentProgress(f.state,'test-company',2026).stageKey,'visit');
 assert.equal(f.docs[path].yearProgress['2026'].history[0].sourceActivityId,'record-1');
 assert.equal(f.docs[path].yearProgress['2027'].history[0].id,'old');
 assert.equal(f.docs[path].accountGrade,'B');
 assert.deepEqual(f.state.companies,oldCompany);assert.deepEqual(f.state.opportunities,oldOpps);
 await saveProgress(f.state,'test-company',{year:2026,stage:'visit'});
 assert.equal(f.writes.length,1);
});

test('stage suggestions do not cause saves without explicit selection; scheduled activity is blocked',()=>{
 const fd=new FormData();fd.set('meetingType','현장 방문');fd.set('progressYear','2026');fd.set('progressStage','visit');
 assert.equal(suggestedProgress('현장 방문'),'visit');assert.equal(suggestedProgress('전화'),'');
 assert.equal(selectedProgress(fd),null);
 fd.set('updateProgress','on');assert.deepEqual(selectedProgress(fd),{year:2026,stage:'visit'});
 fd.set('meetingStatus','예정');assert.throws(()=>selectedProgress(fd),/예정 활동/);
 fd.set('meetingStatus','완료');fd.set('progressStage','invalid');assert.throws(()=>selectedProgress(fd),/적용 연도/);
});

test('demo changes use no network and keep stages independent by year',async()=>{
 const f=fixture();f.state.demo=true;f.state.db=null;
 await saveContact(f.state,'test-company',{contactPerson:'가상 담당자',phone:'02-000-0000'});
 await saveProgress(f.state,'test-company',{year:2026,stage:'qualification'});
 await saveProgress(f.state,'test-company',{year:2027,stage:'meeting'});
 assert.equal(currentProgress(f.state,'test-company',2026).stageKey,'qualification');
 assert.equal(currentProgress(f.state,'test-company',2027).stageKey,'meeting');
 assert.equal(f.writes.length,0);
});
