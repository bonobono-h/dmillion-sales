import test from 'node:test';
import assert from 'node:assert/strict';
import {activityIdentity,activitySourceLabel} from '../crm2-identity.mjs';
test('dot source is distinct from account author, saver and company participant',()=>{
 const x=activityIdentity({source:'dot-conversation',sourceActor:{kind:'service',id:'dot',label:'arbitrary text'},attendeesUs:''},{lastSavedBy:null});
 assert.equal(x.sourceLabel,'dot 대화 정리'); assert.equal(x.authorId,''); assert.equal(x.editorId,''); assert.equal(x.author,'기록 없음'); assert.equal(x.editor,'기록 없음');
});
test('partial or unrecognized source metadata never claims dot origin',()=>{
 for(const x of [{source:'dot-conversation'},{sourceActor:{kind:'service',id:'dot'}},{source:'meeting',sourceActor:{kind:'service',id:'dot'}},{source:'dot-conversation',sourceActor:{kind:'user',id:'dot'}},{source:'dot-conversation',sourceActor:{kind:'service',id:'other'}}]) assert.equal(activitySourceLabel(x),'');
});
test('source does not change authenticated account attribution or permissions',()=>{
 const x=activityIdentity({source:'dot-conversation',sourceActor:{kind:'service',id:'dot'},createdBy:'person'},{lastSavedBy:'editor',profiles:{person:{name:'가상 기록자'},editor:{name:'가상 편집자'}}});
 assert.equal(x.author,'가상 기록자'); assert.equal(x.editor,'가상 편집자'); assert.equal(x.sourceLabel,'dot 대화 정리');
});
