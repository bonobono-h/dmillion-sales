import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const handler=html.slice(html.indexOf('async function openLegacyText('),html.indexOf('\nfunction legacyCompanyText('));
function harness(loader){
 const notices=[],writes=[];let imports=0;
 const context={canWrite:true,isAdmin:false,legacyTextEditorPromise:null,toast:message=>notices.push(message),
  legacyTextState:()=>({}),loadFixture:async()=>{imports++;return loader();},
  db:{doc:()=>({set:data=>writes.push(data),update:data=>writes.push(data)})}};
 vm.createContext(context);
 const source=handler.replace("import('./legacy-text-edit.mjs?v=20261110-legacy-edit-1')",'loadFixture()');
 assert.notEqual(source,handler,'replace only dynamic module boundary, keep actual click handler');vm.runInContext(source,context);
 return {context,notices,writes,imports:()=>imports,button:()=>({disabled:false,dataset:{legacyCollection:'activities',legacyId:'fixture',legacyField:'summary',legacyLabel:'내용'}})};
}
test('legacy module load failure cannot fall back to unconditional or replacement writes',async()=>{
 const h=harness(()=>Promise.reject(Error('Synthetic module unavailable'))),button=h.button();
 await h.context.openLegacyText(button);
 assert.equal(h.imports(),1);assert.equal(button.disabled,false);assert.equal(h.context.legacyTextEditorPromise,null);assert.equal(h.writes.length,0);assert.match(h.notices[0],/불러오지 못했습니다/);
 await h.context.openLegacyText(button);assert.equal(h.imports(),2);assert.equal(h.writes.length,0);
});
test('incomplete editor module fails closed and unknown/read-only role never starts loader',async()=>{
 const h=harness(()=>({}));await h.context.openLegacyText(h.button());assert.equal(h.writes.length,0);assert.equal(h.context.legacyTextEditorPromise,null);
 for(const value of [false,null]){h.context.canWrite=value;await h.context.openLegacyText(h.button());}
 assert.equal(h.imports(),1);assert.equal(h.writes.length,0);assert.match(h.notices.at(-1),/권한/);
});
