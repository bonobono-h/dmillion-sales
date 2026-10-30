import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntakeUI} from '../crm2-intake.js';

test('review and approval preserve long mail, blank lines, quoted replies and final paragraph',async()=>{
 const oldDocument=globalThis.document,oldInterval=globalThis.setInterval;
 const listeners={};let modal;
 globalThis.document={addEventListener:(name,fn)=>{listeners[name]=fn;}};
 globalThis.setInterval=()=>0;
 try{
  const state={canWrite:true,demo:true,userId:'fixture',companies:[{_id:'a',name:'가상업체'}],contacts:{},activities:[],tasks:[]};
  const ui=createIntakeUI({state,render:()=>{},toast:message=>{throw new Error(message);},reload:async()=>{},showModal:(title,description,html,save)=>{modal={title,description,html,save};}});
  const click=async(action,id)=>listeners.click({target:{closest:()=>({dataset:{intake:action,id},disabled:false})}});
  const body='첫 줄\n\n'+Array.from({length:100},(_,i)=>`${i+1}. 상세 협의 내용 ${'가나다'.repeat(35)}`).join('\n')+'\n> 이전 회신도 보존\n\n마지막 문단 & <끝>';
  await click('new');
  const source=new FormData();for(const [k,v] of Object.entries({sourceType:'email',companyId:'a',title:'가상업체 메일',body,occurredAt:'2026-01-01T10:00'}))source.set(k,v);
  await modal.save(source);
  const id=ui.render().match(/data-intake="review" data-id="([^"]+)"/)[1];
  await click('review',id);
  assert.ok(body.length>8000);
  const displayed=modal.html.match(/name="summary"[^>]*>([\s\S]*?)<\/textarea>/)[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  assert.equal(displayed,body);
  assert.match(modal.description,/CRM에 공유/);
  const record=new FormData();for(const [k,v] of Object.entries({companyId:'a',title:'가상업체 메일',date:'2026-01-01T10:00',summary:body}))record.set(k,v);
  await modal.save(record);
  assert.equal(state.activities.length,1);assert.equal(state.activities[0].summary,body);
  record.set('summary','가'.repeat(150001));
  await assert.rejects(modal.save(record),/15만 자/);
 }finally{globalThis.document=oldDocument;globalThis.setInterval=oldInterval;}
});
