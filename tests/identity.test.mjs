import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {accountLabel,activityIdentity} from '../crm2-identity.mjs';

test('author, last-saving account and participants stay separate',()=>{
 const result=activityIdentity({createdBy:'author',attendeesUs:'참석 예시'}, {lastSavedBy:'editor',profiles:{author:{name:'작성 예시'},editor:{name:'저장 예시'}}});
 assert.equal(result.author,'작성 예시');assert.equal(result.editor,'저장 예시');assert.equal(result.participants,'참석 예시');
});
test('legacy author is unknown, never inferred from editor, owner or attendee',()=>{
 const result=activityIdentity({owner:'업체 담당',attendeesUs:'참석자',updatedBy:'editor',authorName:'임의 이름'}, {lastSavedBy:'editor',profiles:{editor:{name:'저장 계정'}}});
 assert.equal(result.author,'기록 없음');assert.equal(result.editor,'저장 계정');assert.equal(result.authorId,'');
});
test('missing account profile does not expose ID or invent a name',()=>{
 assert.equal(accountLabel('unknown',{}),'이름 확인 불가');assert.equal(accountLabel(null,{}),'기록 없음');
 assert.equal(accountLabel('empty',{empty:{name:' '}}),'이름 확인 불가');
 assert.equal(activityIdentity({createdBy:{name:'fake'}}).author,'기록 없음');
});
test('bridge keeps server saver metadata separate from editable JSON',async()=>{
 const code=await readFile(new URL('../bridge.js',import.meta.url),'utf8');
 const expression=code.match(/const docSnap = (.+);\n/)[1];
 const docSnap=new Function('idOf','clone','return '+expression)(p=>p.split('/').at(-1),structuredClone);
 const row={updated_by:'server-account',updated_at:'2026-11-10',version:2,data:{updatedBy:'editable-account',createdBy:'author-account'}};
 const snap=docSnap('activities/example',row);
 assert.equal(snap.updatedBy,'server-account');assert.equal(snap.data().updatedBy,'editable-account');
 const identity=activityIdentity(snap.data(),{lastSavedBy:snap.updatedBy});
 assert.equal(identity.editorId,'server-account');assert.equal(identity.authorId,'author-account');
 assert.equal(docSnap('activities/missing',null).updatedBy,null);
});
