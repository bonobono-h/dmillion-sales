/* Synthetic test data only. NEVER replace this with real customer contact information. */
export const demoData = {
  companies:[
    {_id:'demo-c1',name:'가온정밀',kind:'고객사',industry:'자동차부품',bizDetail:'샤프트 가공·열처리',needs:'비전 검사 일관성 확보, 반복 이송 자동화',stage:'제안',owner:'영업 1팀',region:'경기 화성시',nextAction:'제안서 초안 확인',nextDate:'2026-11-03',star:true},
    {_id:'demo-c2',name:'미래산업기계',kind:'고객사',industry:'산업장비',bizDetail:'용접 셀',needs:'용접 공정 자동화',stage:'첫 미팅',owner:'영업 2팀',region:'충남 천안시',nextAction:'기술 미팅 일정 확인',nextDate:'2026-11-06'},
    {_id:'demo-c3',name:'푸른식품',kind:'고객사',industry:'식품 제조',bizDetail:'포장라인',needs:'포장·팔레타이징 자동화',stage:'리드',owner:'영업 1팀',region:'인천 남동구'},
    {_id:'demo-c4',name:'동서모션',kind:'협력사',industry:'로봇 부품',stage:'컨택 중',owner:'구매 담당',region:'경기 안양시'},
    {_id:'demo-c5',name:'태산테크',kind:'고객사',industry:'금속 가공',needs:'설비 데이터 수집',stage:'계약',owner:'영업 2팀',region:'경기 안산시'}
  ],
  profiles:{
    'demo-c1':{accountGrade:'A',market2027:'로봇·자동화',outreachBucket:'연락해볼만함',contactReason:'2027년 설비 투자 계획 확인',salesComment:'현장 방문 후 기술 검토 진행 중',contactName:'생산기술팀 담당자',statusSummary:'비전검사 및 이송 구조 검토'},
    'demo-c2':{accountGrade:'B',market2027:'로봇·자동화',outreachBucket:'모르겠음 — 담당자 확인',contactReason:'담당자 확인 후 미팅 추진'},
    'demo-c3':{accountGrade:'C',market2027:'스마트공장',outreachBucket:'기록 없음 — 메일 확보 후 일괄'},
    'demo-c5':{accountGrade:'A',market2027:'제조AI',outreachBucket:'진행 중 — 과제 수행',contactReason:'기존 설비 고도화 추가 제안'}
  },
  activities:[
    {_id:'demo-a1',companyId:'demo-c1',date:'2026-10-22T10:00:00',type:'현장 방문',status:'완료',purpose:'공정 자동화 요구 검토',summary:'검사 장비와 컨베이어 연계 가능성 확인'},
    {_id:'demo-a2',companyId:'demo-c1',date:'2026-10-10T11:00:00',type:'전화',status:'완료',purpose:'미팅 일정 조율'},
    {_id:'demo-a3',companyId:'demo-c2',date:'2026-10-21T14:00:00',type:'미팅',status:'완료',purpose:'용접 자동화 요구 확인'}
  ],
  projects:[{_id:'demo-p1',name:'2026 제조AI 실증 과제',companyIds:['demo-c5'],status:'수행 중',budget:190000000}],
  opportunities:[
    {_id:'demo-o1',companyId:'demo-c1',title:'비전검사 자동화 셀',stage:'proposal',estimatedAmount:125000000,owner:'영업 1팀',createdAt:'2026-10-10'},
    {_id:'demo-o2',companyId:'demo-c1',title:'자동 적재 라인',stage:'discovery',estimatedAmount:null,owner:'영업 1팀'},
    {_id:'demo-o3',companyId:'demo-c2',title:'용접로봇 셀',stage:'qualification',estimatedAmount:220000000,owner:'영업 2팀'},
    {_id:'demo-o4',companyId:'demo-c5',title:'제조AI 실증 구축',stage:'won',estimatedAmount:190000000,owner:'영업 2팀'}
  ],
  tasks:[
    {_id:'demo-t1',companyId:'demo-c1',opportunityId:'demo-o1',title:'비전검사 제안서 검토',status:'todo',dueAt:'2026-11-03',priority:'high'},
    {_id:'demo-t2',companyId:'demo-c2',opportunityId:'demo-o3',title:'기술 미팅 일정 확인',status:'todo',dueAt:'2026-11-06',priority:'normal'}
  ]
};
