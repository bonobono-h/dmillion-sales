import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const text=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('iPhone home-screen metadata and standalone manifest are present',async()=>{
  const [html,manifestText]=await Promise.all([text('crm2.html'),text('manifest.webmanifest')]);
  const manifest=JSON.parse(manifestText);
  assert.match(html,/apple-mobile-web-app-capable" content="yes"/);
  assert.match(html,/apple-touch-icon/);
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'./crm2.html?source=home');
  assert.deepEqual(manifest.icons.map(icon=>icon.sizes),['192x192','512x512']);
});

test('install guide explains the manual Safari action and stays hidden in standalone mode',async()=>{
  const script=await text('pwa.js');
  assert.match(script,/홈 화면에 추가/);
  assert.match(script,/display-mode: standalone/);
  assert.match(script,/navigator\.standalone===true/);
  assert.match(script,/params\.get\('iosGuide'\)==='1'/);
});

test('service worker limits caching to same-origin GET requests',async()=>{
  const worker=await text('sw.js');
  assert.match(worker,/request\.method!=='GET'/);
  assert.match(worker,/url\.origin!==self\.location\.origin/);
  assert.match(worker,/request\.mode==='navigate'/);
});

for(const size of [180,192,512])test(`app icon ${size}px is a valid PNG`,async()=>{
  const buffer=await readFile(new URL(`../icons/dmillion-app-${size}.png`,import.meta.url));
  assert.equal(buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(buffer.readUInt32BE(16),size);
  assert.equal(buffer.readUInt32BE(20),size);
});

