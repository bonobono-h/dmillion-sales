// CSS cascade/geometry-model regression checks, not browser pixel verification.
// jsdom does not lay out a page or evaluate viewport media queries, so matching
// width rules are selected explicitly and the flex geometry is calculated below.
// All fixture labels are synthetic. No backend, customer records, or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const root=new URL('../',import.meta.url);
const html=await fs.readFile(new URL('crm2.html',root),'utf8');
const sheetNames=[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"?]+)(?:\?[^"]*)?"/g)].map(match=>match[1]);
assert.ok(sheetNames.includes('crm2-focus.css'),'test must load the deployed visual layer');
const styles=await Promise.all(sheetNames.map(name=>fs.readFile(new URL(name,root),'utf8')));
const parser=new JSDOM('<!doctype html><head></head><body></body>');
for(const css of styles){const style=parser.window.document.createElement('style');style.textContent=css;parser.window.document.head.append(style);}

function mediaMatches(query,width){
  if(/display-mode|prefers-reduced-motion|print/.test(query))return false;
  return [...query.matchAll(/(min|max)-width\s*:\s*(\d+(?:\.\d+)?)px/g)].every(([,type,value])=>type==='min'?width>=+value:width<=+value);
}
function activeRules(rules,width){
  return [...rules].flatMap(rule=>rule.type===4
    ?(mediaMatches(rule.conditionText,width)?activeRules(rule.cssRules,width):[])
    :rule.type===1?[rule.cssText]:[]);
}
const sheets=[...parser.window.document.styleSheets].map(sheet=>sheet.cssRules);
function fixture(width,{view='board',columns=7}={}){
  // jsdom keeps logical padding separate from later physical shorthands. Expand
  // the app's symmetric pixel gutters in source order for this LTR width model.
  const css=sheets.flatMap(rules=>activeRules(rules,width)).join('\n')
    .replace(/padding-inline:\s*(\d+(?:\.\d+)?px)\s*;/g,'padding-left: $1; padding-right: $1;');
  const cards=Array.from({length:columns},(_,index)=>`<section class="crm-board-column"><header class="crm-board-column-head"><h2>가상 단계 ${index+1}</h2></header><div class="crm-board-cards"><article class="crm-focus-card"><button class="crm-focus-company">가상 업체 ${index+1}</button><div class="crm-focus-next-actions"><button class="btn">열기</button></div></article></div></section>`).join('');
  const content=view==='board'?`<section class="crm-focus-page crm-board-page"><div class="crm-kanban" tabindex="0">${cards}</div></section>`
    :view==='list'?'<section class="crm-focus-page"><div class="crm-focus-layout"></div></section>'
    :'<section class="panel company-detail-panel"></section>';
  const dom=new JSDOM(`<!doctype html><head><style>${css}</style></head><body><div class="shell"><aside class="sidebar"></aside><section class="workspace"><main class="main">${content}</main></section></div></body>`,{
    beforeParse(window){Object.defineProperty(window,'innerWidth',{value:width});}
  });
  const computed=selector=>dom.window.getComputedStyle(dom.window.document.querySelector(selector));
  return {dom,computed};
}
function geometry(width,computed,count){
  const main=computed('.main'),shell=computed('.shell'),board=computed('.crm-kanban'),column=computed('.crm-board-column');
  const sidebar=parseFloat(shell.gridTemplateColumns)||0;
  const mainWidth=Math.min(width-sidebar,main.maxWidth==='none'?Infinity:parseFloat(main.maxWidth));
  const gutter=parseFloat(main.paddingLeft);
  const boardWidth=mainWidth-2*gutter;
  const gap=parseFloat(board.gap),inset=parseFloat(board.paddingLeft)+parseFloat(board.paddingRight);
  const basis=column.flexBasis.startsWith('min(')?Math.min(.86*width,340):parseFloat(column.flexBasis);
  const max=column.maxWidth&&column.maxWidth!=='none'?parseFloat(column.maxWidth):Infinity;
  const grow=+column.flexGrow;
  const columnWidth=Math.min(max,grow?Math.max(basis,(boardWidth-inset-gap*(count-1))/count):basis);
  const contentWidth=columnWidth*count+gap*(count-1)+inset;
  return {boardWidth,columnWidth,contentWidth,overflow:contentWidth>boardWidth+.1};
}
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.01,`${actual} should equal ${expected}`);

test('desktop board uses all available workspace width at 1280, 1440, 1920 and 2560',()=>{
  for(const [width,expected] of [[1280,988],[1440,1148],[1920,1628],[2560,2268]]){
    const {dom,computed}=fixture(width);
    try{
      assert.equal(computed('.main').maxWidth,'none',`${width}px board parent must not be capped`);
      assert.equal(computed('.crm-board-page').maxWidth,'none');
      assert.equal(computed('.crm-board-column').flexGrow,'1');
      assert.equal(computed('.crm-board-column').flexShrink,'0');
      close(geometry(width,computed,7).boardWidth,expected);
    }finally{dom.window.close();}
  }
});

test('columns share spare desktop width and retain readable minimums with many stages',()=>{
  for(const [width,count,expected] of [[1280,3,318],[1440,3,1114/3],[1920,5,313.2],[2560,7,2178/7]]){
    const {dom,computed}=fixture(width,{columns:count});
    try{
      const result=geometry(width,computed,count);
      close(result.columnWidth,expected);assert.equal(result.overflow,false);
      close(result.contentWidth,result.boardWidth);
      const many=geometry(width,computed,10);
      close(many.columnWidth,width>=1600?300:288);assert.equal(many.overflow,true);
      assert.equal(computed('.crm-kanban').overflowX,'auto');
      assert.equal(computed('.crm-kanban').overscrollBehaviorX,'contain');
    }finally{dom.window.close();}
  }
});

test('a filtered board with one or two stages cannot create giant full-screen cards',()=>{
  for(const count of [1,2]){
    const {dom,computed}=fixture(2560,{columns:count});
    try{close(geometry(2560,computed,count).columnWidth,420);assert.equal(computed('.crm-board-column').maxWidth,'420px');}
    finally{dom.window.close();}
  }
});

test('320 and 390 mobile boards preserve swipe-sized columns, snap and touch targets',()=>{
  for(const [width,boardWidth,columnWidth] of [[320,300,275.2],[390,362,335.4]]){
    const {dom,computed}=fixture(width);
    try{
      assert.equal(computed('.main').maxWidth,'1520px');
      assert.equal(computed('.crm-board-column').flexGrow,'0');
      assert.equal(computed('.crm-board-column').flexShrink,'0');
      assert.notEqual(computed('.crm-board-column').maxWidth,'420px');
      assert.equal(computed('.crm-kanban').overflowX,'auto');
      assert.equal(computed('.crm-kanban').scrollSnapType,'x proximity');
      assert.equal(computed('.crm-board-column').scrollSnapAlign,'start');
      assert.equal(computed('.crm-focus-company').fontSize,'16px');
      assert.ok(parseFloat(computed('.crm-focus-next-actions .btn').minHeight)>=44);
      const result=geometry(width,computed,7);
      close(result.boardWidth,boardWidth);close(result.columnWidth,columnWidth);assert.equal(result.overflow,true);
      assert.ok(result.columnWidth<result.boardWidth,'one card remains fully readable');
    }finally{dom.window.close();}
  }
});

test('switching to lists or detail retains the original reading-width limit',()=>{
  for(const view of ['list','detail']){
    const {dom,computed}=fixture(2560,{view});
    try{
      assert.equal(computed('.main').maxWidth,'1520px');
      if(view==='list')assert.equal(computed('.crm-focus-page').maxWidth,'1190px');
    }finally{dom.window.close();}
  }
});

test('desktop rule starts after the existing 780px mobile breakpoint',()=>{
  for(const width of [780,781]){
    const {dom,computed}=fixture(width);
    try{
      assert.equal(computed('.main').maxWidth,width===780?'1520px':'none');
      assert.equal(computed('.crm-board-column').flexGrow,width===780?'0':'1');
    }finally{dom.window.close();}
  }
});

test.after(()=>parser.window.close());
