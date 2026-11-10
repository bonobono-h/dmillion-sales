import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const script=html.match(/<script id="crm-default-entry">([\s\S]*?)<\/script>\n/);
assert.ok(script,'default entry redirect must be present');
function destination(href){
 let target=null;vm.runInNewContext(script[1],{URL,location:{href,replace:value=>{target=value;}}});return target;
}
test('default root, index and old customer landing open the new CRM',()=>{
 for(const path of ['', 'index.html','#home','#list']){
  assert.equal(destination('https://bonobono-h.github.io/dmillion-sales/'+path),'https://bonobono-h.github.io/dmillion-sales/crm2.html');
 }
});
test('default entry preserves an explicit destination query',()=>{
 assert.equal(destination('https://bonobono-h.github.io/dmillion-sales/?view=agent&source=home'),'https://bonobono-h.github.io/dmillion-sales/crm2.html?view=agent&source=home');
 assert.equal(destination('https://bonobono-h.github.io/dmillion-sales/?demo=1'),'https://bonobono-h.github.io/dmillion-sales/crm2.html?demo=1');
});
test('explicit legacy tools and auth callback hashes are not redirected',()=>{
 for(const suffix of ['?legacy=1','?legacy=1#list','#proj','#map','#dash','#access_token=synthetic-token','#error=synthetic-error']){
  assert.equal(destination('https://bonobono-h.github.io/dmillion-sales/index.html'+suffix),null,suffix);
 }
});
test('legacy application is byte-identical after removing the entry redirect',()=>{
 const original=Buffer.from(html.replace(script[0],''));
 const sha=createHash('sha1').update('blob '+original.length+'\0').update(original).digest('hex');
 assert.equal(sha,'97081626a6b5ee6d666becc95589b062993c978e');
});
test('new CRM keeps explicit routes to legacy documents and projects',async()=>{
 const [app,page]=await Promise.all(['crm2.js','crm2.html'].map(path=>readFile(new URL('../'+path,import.meta.url),'utf8')));
 assert.ok(page.includes('href="index.html?legacy=1"'));
 assert.ok(app.includes('href="index.html?legacy=1#list"'));
 assert.ok(app.includes('href="index.html?legacy=1#proj"'));
});
