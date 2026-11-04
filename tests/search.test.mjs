import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesKoreanSearch,bindComposedSearch} from '../crm2-search.mjs';
import {searchAccounts,filteredAccounts} from '../crm2-core.mjs';
import {buildCoverage,filterCoverage} from '../crm2-coverage.mjs';
import {buildTimelineRows,filterTimelineRows} from '../crm2-timeline.mjs';

const company={_id:'synthetic-search',name:'가온정밀',owner:'가상담당',kind:'고객사',stage:'리드'};
test('Korean full names, initials, mixed syllables and partial names match in order',()=>{
 for(const q of ['가온정밀','ㄱㅇㅈㅁ','ㅇㅈㅁ','가온ㅈㅁ','ㄱ온정ㅁ','가온 정밀'])assert.ok(matchesKoreanSearch(company.name,q),q);
 for(const q of ['ㄱㅈㅇㅁ','ㄱㅇㅊㅁ','정밀가온'])assert.equal(matchesKoreanSearch(company.name,q),false,q);
 assert.ok(matchesKoreanSearch('까치산업','ㄲㅊㅅㅇ'));
 assert.ok(matchesKoreanSearch('하늘테크','ᄒᄂᄐᄏ'));
});
test('canonical decomposed Hangul, Latin, numbers and literal punctuation keep working',()=>{
 assert.ok(matchesKoreanSearch(company.name.normalize('NFD'),'가온'));
 assert.ok(matchesKoreanSearch('ABC TEST@example.com 02-000-0000','ａｂｃ'));
 assert.ok(matchesKoreanSearch('ABC TEST@example.com','test@EXAMPLE.COM'));
 assert.ok(matchesKoreanSearch('02-000-0000','000-0000'));
 assert.equal(matchesKoreanSearch('ordinary','.*'),false);
 assert.equal(matchesKoreanSearch('ordinary','['),false);
 assert.ok(matchesKoreanSearch('literal [x]+','[x]+'));
 assert.ok(matchesKoreanSearch(company.name,''));
});
test('account initials respect the existing owner/grade filters and contact permission',()=>{
 const companies=[company,{...company,_id:'other',name:'나래산업',owner:'다른담당'}],profiles={[company._id]:{accountGrade:'B'}};
 const contacts={[company._id]:{person:'가상연락',phone:'02-000-0000',email:'private@example.com'}};
 assert.deepEqual(searchAccounts(companies,profiles,[],[],{q:'ㄱㅇㅈㅁ'},contacts).map(c=>c._id),[company._id]);
 assert.equal(searchAccounts(companies,profiles,[],[],{q:'ㄱㅇㅈㅁ',grade:'C'},contacts).length,0);
 assert.equal(searchAccounts(companies,profiles,[],[],{q:'ㄱㅇㅈㅁ',owner:'다른담당'},contacts).length,0);
 assert.equal(searchAccounts(companies,profiles,[],[],{q:'ㄱㅅㅇㄹ'},contacts,false).length,0);
 assert.equal(searchAccounts(companies,profiles,[],[],{q:'ㄱㅅㅇㄹ'},contacts,true).length,1);
 assert.equal(searchAccounts(companies,profiles,[],[],{q:'private@example.com'},contacts,false).length,0);
 assert.equal(filteredAccounts(companies,profiles,[],[],{q:'ㄱㅇㅈㅁ'}).length,1);
});
test('coverage and progress timelines use the same initial matching',()=>{
 const rows=buildCoverage([company],{},[],[],{today:'2026-11-04'});
 assert.equal(filterCoverage(rows,{kind:'all',q:'ㄱㅇㅈㅁ'}).length,1);
 const timeline=buildTimelineRows([company],[],[],[],{year:2026,profiles:{},projects:[]});
 assert.equal(filterTimelineRows(timeline,{q:'가온ㅈㅁ'}).length,1);
 assert.equal(filterTimelineRows(timeline,{q:'ㄴㄹㅅㅇ'}).length,0);
});

const settle=()=>new Promise(resolve=>setTimeout(resolve,8));
function editor(id='f-q'){
 const root=new EventTarget(),input={id,value:'',isConnected:true},drafts=[],searches=[];
 const dispose=bindComposedSearch(root,{ids:['f-q','coverage-q','timeline-q'],onValue:t=>drafts.push(t.value),onSearch:t=>searches.push(t.value)});
 function send(type,value=input.value,isComposing=false){input.value=value;const e=new Event(type);Object.defineProperties(e,{target:{value:input},isComposing:{value:isComposing}});root.dispatchEvent(e);}
 return {root,input,drafts,searches,send,dispose};
}
test('no search rerender occurs during Hangul composition in any of the three search fields',async()=>{
 for(const id of ['f-q','coverage-q','timeline-q']){
  const e=editor(id);e.send('compositionstart');e.send('input','ㄱ',true);e.send('input','가',true);e.send('input','가오',true);e.send('input','가온',true);
  assert.deepEqual(e.searches,[]);assert.equal(e.drafts.at(-1),'가온');
  e.send('compositionend','가온');e.send('input','가온',false);
  assert.deepEqual(e.searches,[]);await settle();assert.deepEqual(e.searches,['가온']);e.dispose();
 }
});
test('browsers that send the final input before compositionend also commit once',async()=>{
 const e=editor();e.send('compositionstart');e.send('input','가',false);e.send('compositionend','가');await settle();assert.deepEqual(e.searches,['가']);e.dispose();
});
test('normal letters, deleting and clearing search still update immediately',()=>{
 const e=editor();e.send('input','ABC');e.send('input','AB');e.send('input','');assert.deepEqual(e.searches,['ABC','AB','']);e.dispose();
});
test('new composition cancels an older queued commit and uses the complete current value',async()=>{
 const e=editor();e.send('compositionstart');e.send('compositionend','가');e.send('compositionstart');e.send('input','가온',true);await settle();assert.deepEqual(e.searches,[]);e.send('compositionend','가온');await settle();assert.deepEqual(e.searches,['가온']);e.dispose();
});
test('detached inputs and disposed listeners cannot overwrite a newer screen',async()=>{
 const e=editor();e.send('compositionstart');e.send('compositionend','가온');e.input.isConnected=false;await settle();e.send('input','old');assert.deepEqual(e.searches,[]);e.dispose();
 const next=editor();next.send('compositionend','가온');next.dispose();await settle();next.send('input','ignored');assert.deepEqual(next.searches,[]);
});
test('unrelated form inputs are untouched by the search composition handler',async()=>{
 const e=editor('meeting-summary');e.send('compositionstart');e.send('input','회의 기록',true);e.send('compositionend','회의 기록');await settle();assert.deepEqual(e.searches,[]);assert.deepEqual(e.drafts,[]);e.dispose();
});
