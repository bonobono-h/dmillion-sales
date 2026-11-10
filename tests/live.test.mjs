import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveUpdates} from '../crm2-live.mjs';
function setup(){
  const callbacks={},timers=new Map(),applied=[],statuses=[];let ready=true,next=0,unsubscribed=0;
  const db={collection:name=>({onSnapshot:(ok,fail)=>{callbacks[name]={ok,fail};return()=>unsubscribed++;}})};
  const live=createLiveUpdates({db,collections:['companies','activities'],canApply:()=>ready,apply:batch=>applied.push(batch),status:s=>statuses.push(s),setTimer:fn=>{timers.set(++next,fn);return next;},clearTimer:id=>timers.delete(id)});
  const tick=()=>{const current=[...timers.values()];timers.clear();current.forEach(fn=>fn());};
  const snap=(value,version=1)=>({docs:[{id:'a',version,updatedAt:null,data:()=>({title:value})}]});
  return {live,callbacks,tick,snap,applied,statuses,timers,block:()=>ready=false,allow:()=>ready=true,unsubscribed:()=>unsubscribed};
}
test('coalesces related collection changes into one render',()=>{const s=setup();s.callbacks.companies.ok(s.snap('a'));s.callbacks.activities.ok(s.snap('b'));s.tick();assert.equal(s.applied.length,1);assert.equal(s.applied[0].size,2);s.live.stop();});
test('identical repeated snapshots do not repaint',()=>{const s=setup();s.callbacks.activities.ok(s.snap('a'));s.tick();s.callbacks.activities.ok(s.snap('a'));s.tick();assert.equal(s.applied.length,1);s.live.stop();});
test('keeps newest updates pending until form editing ends',()=>{const s=setup();s.block();s.callbacks.activities.ok(s.snap('a'));s.tick();assert.equal(s.applied.length,0);assert.equal(s.statuses.at(-1),'waiting');s.callbacks.activities.ok(s.snap('b',2));s.allow();s.live.flush();assert.equal(s.applied.length,1);assert.equal(s.applied[0].get('activities').docs[0].data().title,'b');s.live.stop();});
test('empty snapshot applies removal',()=>{const s=setup();s.callbacks.activities.ok(s.snap('a'));s.tick();s.callbacks.activities.ok({docs:[]});s.tick();assert.equal(s.applied[1].get('activities').docs.length,0);s.live.stop();});
test('stop unsubscribes and ignores late events',()=>{const s=setup();s.callbacks.activities.ok(s.snap('a'));s.live.stop();s.callbacks.activities.ok(s.snap('b'));s.tick();assert.equal(s.applied.length,0);assert.equal(s.unsubscribed(),2);assert.equal(s.timers.size,0);});
test('subscription failure is visible without saving',()=>{const s=setup();s.callbacks.activities.fail(new Error('offline'));assert.equal(s.statuses.at(-1),'error');assert.equal(s.applied.length,0);s.live.stop();});
test('one healthy collection cannot clear another collection error',()=>{const s=setup();s.callbacks.companies.fail(new Error('denied'));s.callbacks.activities.ok(s.snap('a'));s.tick();assert.equal(s.statuses.at(-1),'error');s.callbacks.companies.ok(s.snap('recovered'));s.tick();assert.equal(s.statuses.at(-1),'updated');s.live.stop();});
test('synchronous subscription errors are not overwritten by watching',()=>{const statuses=[];const live=createLiveUpdates({db:{collection:()=>({onSnapshot:(ok,fail)=>{fail(new Error('blocked'));return()=>{};}})},collections:['companies'],canApply:()=>true,apply:()=>{},status:s=>statuses.push(s)});assert.equal(statuses.at(-1),'error');live.stop();});
test('apply failure retains the batch and recovers on retry',()=>{let fail=true,calls=0,callback;const live=createLiveUpdates({db:{collection:()=>({onSnapshot:ok=>{callback=ok;return()=>{};}})},collections:['companies'],canApply:()=>true,apply:()=>{calls++;if(fail)throw new Error('render failed');}});callback({docs:[]});live.flush();assert.equal(live.pending,1);fail=false;live.flush();assert.equal(live.pending,0);assert.equal(calls,2);live.stop();});
