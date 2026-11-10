import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {demoData,demoNotice} from '../crm2-demo.mjs';

test('shipped CRM examples cannot restore realistic fictional company names',async()=>{
  const root=new URL('../',import.meta.url);
  const sources=(await readdir(root)).filter(name=>/^crm2.*\.(?:js|mjs|html)$/.test(name));
  assert.ok(sources.includes('crm2-demo.mjs')&&sources.includes('crm2-agent.js')&&sources.includes('crm2-intake.js'));
  const retiredNames=/가온정밀|미래산업기계|푸른식품|동서모션|태산테크|케이블루/;
  for(const name of sources){
    assert.doesNotMatch(await readFile(new URL(name,root),'utf8'),retiredNames,
      `${name} must use visibly fictional identities in shipped examples`);
  }
});

test('demo company and person identities are unmistakably fictional',()=>{
  assert.deepEqual(demoData.companies.map(company=>company.name),
    ['A','B','C','D','E'].map(letter=>'[예시] 업체 '+letter));
  for(const record of [...demoData.companies,...demoData.opportunities]){
    assert.match(record.owner,/^\[예시\] 담당자 [가나다]$/);
  }
  assert.match(demoData.profiles['demo-c1'].contactName,/^\[예시\] 고객 담당자 /);
  for(const company of demoData.companies)assert.match(company.region,/^\[예시\] 지역 [A-E]$/);
});

test('demo narratives and business claims carry the example marker',()=>{
  const markedFields={
    companies:['name','bizDetail','needs','nextAction'],
    profiles:['contactReason','salesComment','contactName','statusSummary'],
    activities:['title','purpose','summary','nextAction'],
    projects:['name'],opportunities:['title'],goals:['label'],tasks:['title']
  };
  for(const [collection,fields] of Object.entries(markedFields)){
    for(const record of Object.values(demoData[collection])){
      for(const field of fields){
        if(record[field])assert.ok(record[field].startsWith('[예시] '),collection+'.'+field+' must be marked as fictional');
      }
    }
  }
  assert.match(demoNotice,/업체·담당자·활동·일정·금액은 모두 가상/);
  assert.match(demoNotice,/실제 고객 데이터나 로그인한 사용자의 기록이 아닙니다/);
});

test('demo fixture IDs, links, stages and numeric values remain compatible',()=>{
  assert.deepEqual(Object.keys(demoData),['companies','profiles','activities','projects','opportunities','goals','tasks']);
  const expected={companies:['demo-c1','demo-c2','demo-c3','demo-c4','demo-c5'],
    activities:['demo-note','demo-a1','demo-a2','demo-a3'],projects:['demo-p1'],
    opportunities:['demo-o1','demo-o2','demo-o3','demo-o4'],goals:['sales-2026Q4'],tasks:['demo-t1','demo-t2']};
  for(const [collection,ids] of Object.entries(expected))assert.deepEqual(demoData[collection].map(record=>record._id),ids);
  const companyIds=new Set(expected.companies),opportunityIds=new Set(expected.opportunities);
  for(const collection of ['activities','opportunities','tasks']){
    for(const record of demoData[collection]){
      assert.ok(companyIds.has(record.companyId));
      if(record.opportunityId)assert.ok(opportunityIds.has(record.opportunityId));
    }
  }
  for(const id of Object.keys(demoData.profiles))assert.ok(companyIds.has(id));
  for(const project of demoData.projects)for(const id of project.companyIds)assert.ok(companyIds.has(id));
  assert.deepEqual(demoData.opportunities.map(record=>record.stage),['negotiation','discovery','qualification','won']);
  assert.deepEqual(demoData.opportunities.map(record=>record.estimatedAmount),[125000000,null,220000000,190000000]);
  assert.equal(demoData.goals[0].revenueTarget,2700000000);
  assert.ok(demoData.opportunities.filter(record=>record.program).every(record=>
    demoData.goals[0].programs.some(program=>program.name===record.program)));
});

