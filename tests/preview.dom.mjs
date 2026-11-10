// Offline artifact smoke test. It does not substitute for real browser pixel QA.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
const file=process.argv[2];if(!file)throw new Error('Provide the generated preview HTML path');
const html=await fs.readFile(file,'utf8'),errors=[];
const width=process.argv.includes('--mobile')?390:1440;
const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error.message));
const dom=new JSDOM(html,{url:'file:///offline-crm-preview.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole,beforeParse(window){
 window.matchMedia=q=>({matches:q.includes('max-width:780')?width<=780:q.includes('max-width:1080')?width<=1080:q.includes('min-width:1081')?width>=1081:false,addEventListener(){}});
 window.scrollTo=()=>{};window.structuredClone=structuredClone;
}});
try{
 const {document}=dom.window,$=s=>document.querySelector(s);
 for(let i=0;i<50&&!$('#loadingScreen').classList.contains('hidden');i++)await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal($('#loadingScreen').classList.contains('hidden'),true,$('#loadingText').textContent);
 assert.equal(document.querySelectorAll('script[src],link[rel=stylesheet]').length,0);
 assert.ok($('.crm-demo-notice').textContent.includes('모두 가상'));
 assert.ok($('.crm-focus-company').textContent.includes('[예시] 업체'));
 assert.ok($('.crm-kanban'));assert.ok(document.querySelectorAll('.crm-board-column').length>=3);assert.ok($('.crm-stage-age'));
 assert.ok($('.crm-focus-card').hasAttribute('data-next-kind'));
 assert.ok($('.crm-board-card-details').textContent.includes('업체 담당'));
 $('.crm-focus-company').click();assert.equal(document.querySelectorAll('.crm-detail-tabs [role=tab]').length,3);
 $('[data-tab=activities]').click();assert.ok($('.crm-meeting-history').textContent.includes('기록 작성'));
 assert.ok($('.crm-meeting-history').textContent.includes('마지막 저장'));
 $('[data-nav=agent]').click();$('[data-agent=example]').click();assert.ok($('#agentTranscript').value.includes('실제 활동 아님'));
 assert.ok(!/미래산업기계|케이블루/.test(document.body.textContent));
 assert.deepEqual(errors,[]);console.log(`PASS offline preview ${width}px DOM, demo labeling, attribution and example input`);
}finally{dom.window.close();}
