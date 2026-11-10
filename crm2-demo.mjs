/* Synthetic test data only. NEVER replace this with real customer contact information. */
export const demoNotice = '[예시 화면] 업체·담당자·활동·일정·금액은 모두 가상입니다. 실제 고객 데이터나 로그인한 사용자의 기록이 아닙니다.';

// Keep the category/status values below compatible with the normal CRM filters.
// Every identity and free-text business claim must remain visibly fictional.
export const demoData = {
  companies:[
    {_id:'demo-c1',name:'[예시] 업체 A',kind:'고객사',industry:'자동차부품',bizDetail:'[예시] 샤프트 가공·열처리',needs:'[예시] 비전 검사 일관성 확보, 반복 이송 자동화',stage:'제안',owner:'[예시] 담당자 가',region:'[예시] 지역 A',nextAction:'[예시] 제안서 초안 확인',nextDate:'2026-11-03',star:true},
    {_id:'demo-c2',name:'[예시] 업체 B',kind:'고객사',industry:'산업장비',bizDetail:'[예시] 용접 셀',needs:'[예시] 용접 공정 자동화',stage:'첫 미팅',owner:'[예시] 담당자 나',region:'[예시] 지역 B',nextAction:'[예시] 기술 미팅 일정 확인',nextDate:'2026-11-06'},
    {_id:'demo-c3',name:'[예시] 업체 C',kind:'고객사',industry:'식품 제조',bizDetail:'[예시] 포장라인',needs:'[예시] 포장·팔레타이징 자동화',stage:'리드',owner:'[예시] 담당자 가',region:'[예시] 지역 C'},
    {_id:'demo-c4',name:'[예시] 업체 D',kind:'협력사',industry:'로봇 부품',stage:'컨택 중',owner:'[예시] 담당자 다',region:'[예시] 지역 D'},
    {_id:'demo-c5',name:'[예시] 업체 E',kind:'고객사',industry:'금속 가공',needs:'[예시] 설비 데이터 수집',stage:'계약',owner:'[예시] 담당자 나',region:'[예시] 지역 E'}
  ],
  profiles:{
    'demo-c1':{accountGrade:'A',market2027:'로봇·자동화',outreachBucket:'연락해볼만함',contactReason:'[예시] 2027년 설비 투자 계획 확인',salesComment:'[예시] 현장 방문 후 기술 검토 진행 중',contactName:'[예시] 고객 담당자 가',statusSummary:'[예시] 비전검사 및 이송 구조 검토'},
    'demo-c2':{accountGrade:'B',market2027:'로봇·자동화',outreachBucket:'모르겠음 — 담당자 확인',contactReason:'[예시] 고객 담당자 확인 후 미팅 추진'},
    'demo-c3':{accountGrade:'C',market2027:'스마트공장',outreachBucket:'기록 없음 — 메일 확보 후 일괄'},
    'demo-c5':{accountGrade:'A',market2027:'제조AI',outreachBucket:'진행 중 — 과제 수행',contactReason:'[예시] 기존 설비 고도화 추가 제안'}
  },
  activities:[
    {_id:'demo-note',companyId:'demo-c1',source:'dot-conversation',sourceActor:{kind:'service',id:'dot',label:'dot'},sourceRef:{conversationId:'demo-thread',messageId:'demo-message',eventId:'demo-note',reportedOn:'2026-11-10',timeZone:'Asia/Seoul',reportedAt:null},createdAt:'2026-11-10T00:00:00Z',recordKind:'undated_note',datePrecision:'unknown',date:null,type:'메모',status:'확인 메모',meetingRecord:false,title:'[예시] 자료 검토 상황 정리',summary:'[예시] 시제품 자료를 검토 중이며 다음 미팅 일자는 미정입니다. 실제 연락일은 확인되지 않은 가상 메모입니다.'},
    {_id:'demo-a1',companyId:'demo-c1',date:'2026-10-22',datePrecision:'day',recordKind:'completed_activity',source:'dot-conversation',sourceActor:{kind:'service',id:'dot',label:'dot'},sourceRef:{conversationId:'demo-thread',messageId:'demo-visit',eventId:'demo-visit',reportedOn:'2026-11-10',timeZone:'Asia/Seoul',reportedAt:null},createdAt:'2026-11-10T00:00:00Z',type:'현장 방문',status:'완료',purpose:'[예시] 공정 자동화 요구 검토',summary:'[예시] 검사 장비와 컨베이어 연계 가능성을 확인한 가상 활동'},
    {_id:'demo-a2',companyId:'demo-c1',date:'2026-10-10T11:00:00',type:'전화',status:'완료',purpose:'[예시] 미팅 일정 조율'},
    {_id:'demo-a3',companyId:'demo-c2',date:'2026-10-21T14:00:00',type:'미팅',status:'완료',purpose:'[예시] 용접 자동화 요구 확인'}
  ],
  projects:[{_id:'demo-p1',name:'[예시] 2026 제조AI 실증 과제',companyIds:['demo-c5'],status:'수행 중',budget:190000000}],
  opportunities:[
    {_id:'demo-o1',companyId:'demo-c1',title:'[예시] 비전검사 자동화 셀',stage:'negotiation',program:'제조로봇',stageHistory:[{from:'proposal',to:'negotiation',at:'2026-11-03T05:00:00Z'}],estimatedAmount:125000000,owner:'[예시] 담당자 가',createdAt:'2026-10-10'},
    {_id:'demo-o2',companyId:'demo-c1',title:'[예시] 자동 적재 라인',stage:'discovery',createdAt:'2026-11-02T02:00:00Z',estimatedAmount:null,owner:'[예시] 담당자 가'},
    {_id:'demo-o3',companyId:'demo-c2',title:'[예시] 용접로봇 셀',stage:'qualification',program:'제조로봇',estimatedAmount:220000000,owner:'[예시] 담당자 나'},
    {_id:'demo-o4',companyId:'demo-c5',title:'[예시] 스마트공장 고도화',stage:'won',program:'스마트공장',estimatedAmount:190000000,owner:'[예시] 담당자 나'}
  ],
  goals:[{_id:'sales-2026Q4',kind:'salesGoal',label:'[예시] 2026년 4분기 가상 영업 목표',start:'2026-10-01',end:'2026-12-31',revenueTarget:2700000000,programs:[{name:'스마트공장',count:3,amountPerDeal:400000000},{name:'제조로봇',count:3,amountPerDeal:500000000}]}],
  tasks:[
    {_id:'demo-t1',companyId:'demo-c1',opportunityId:'demo-o1',title:'[예시] 비전검사 제안서 검토',status:'todo',dueAt:'2026-11-03',priority:'high'},
    {_id:'demo-t2',companyId:'demo-c2',opportunityId:'demo-o3',title:'[예시] 기술 미팅 일정 확인',status:'todo',dueAt:'2026-11-06',priority:'normal'}
  ]
};

