import {STAGE_LABEL,activityDate,isOpportunityOpen,nextActionFor,safeText} from './crm2-core.mjs';

export const TIMELINE_STAGES = [
  ['discovery','발굴'],
  ['meeting','첫 미팅'],
  ['visit','현장 방문'],
  ['qualification','요구 확인'],
  ['proposal','제안·견적'],
  ['negotiation','협상'],
  ['won','수주']
];
export const YEAR_TIMELINE_STAGES = [['not_started','미진행'],...TIMELINE_STAGES];
export const PROGRESS_STAGES = [...YEAR_TIMELINE_STAGES,['hold','보류'],['lost','실패']];

const DAY_MS=86400000;

export function timelineDay(value) {
  if(!value)return null;
  const raw=String(value).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
    const date=new Date(raw+'T00:00:00Z');
    return Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==raw?null:raw;
  }
  const date=new Date(raw);
  if(Number.isNaN(date.getTime()))return null;
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}

function compareDate(a,b){return String(a||'').localeCompare(String(b||''));}
function daysBetween(a,b){
  if(!a||!b)return null;
  const start=new Date(a+'T00:00:00Z'),end=new Date(b+'T00:00:00Z');
  return Math.round((end-start)/DAY_MS);
}
function currentStage(company,opportunities){
  const ordered=opportunities.slice().sort((a,b)=>compareDate(b.updatedAt||b.createdAt,a.updatedAt||a.createdAt));
  const opportunity=ordered.find(isOpportunityOpen)||ordered[0]||null;
  if(opportunity?.stage)return {key:opportunity.stage,label:STAGE_LABEL[opportunity.stage]||opportunity.stage,opportunity};
  const raw=safeText(company.stage).toLocaleLowerCase('ko');
  const matches=[
    [['수주','계약','선정','완료','won'],'won'],
    [['실패','드랍','종료','lost'],'lost'],
    [['보류','대기','hold'],'hold'],
    [['협상','negotiation'],'negotiation'],
    [['제안','견적','proposal'],'proposal'],
    [['요구','니즈','qualification'],'qualification'],
    [['현장','방문','visit'],'visit'],
    [['미팅','상담','meeting'],'meeting']
  ];
  const found=matches.find(([words])=>words.some(word=>raw.includes(word)));
  const key=found?.[1]||'discovery';
  return {key,label:key==='lost'?'실패':key==='hold'?'보류':Object.fromEntries(TIMELINE_STAGES)[key],opportunity:null};
}

function isProjectOpen(project={}){
  const status=safeText(project.status||project.stage).toLocaleLowerCase('ko');
  if(!status)return false;
  return !['완료','종료','취소','중단','미선정','실패','closed','done','completed','cancelled','canceled','lost'].some(word=>status.includes(word));
}
function projectBelongsTo(project,id){
  return project.companyId===id||(Array.isArray(project.companyIds)&&project.companyIds.includes(id));
}
function yearProgressEvent(row,year){
  const date=timelineDay(row.at||row.updatedAt||row.createdAt);
  if(!date)return null;
  const label=Object.fromEntries(PROGRESS_STAGES)[row.stage]||row.stage||'단계 미정';
  return {date,kind:'year_progress',title:`${year}년 진행 단계 · ${label}`,detail:row.note||'',status:'단계 변경',id:row.id||`${date}-${row.stage}`};
}

function activityEvent(row){
  const date=timelineDay(activityDate(row));
  if(!date)return null;
  return {date,kind:'activity',title:row.title||row.type||'활동 기록',detail:row.summary||row.report?.purpose||row.purpose||'',status:row.status||'완료',id:row._id||row.id};
}
function taskEvent(row){
  const date=timelineDay(row.updatedAt||row.completedAt||row.createdAt||row.deletedAt);
  if(!date)return null;
  const status=['done','completed'].includes(row.status)?'완료':row.status==='cancelled'?'취소':row.status==='deleted'?'삭제':'진행 중';
  return {date,kind:'task',title:row.title||'후속 업무',detail:row.dueAt?`기한 ${timelineDay(row.dueAt)||row.dueAt}`:'기한 미정',status,id:row._id||row.id};
}
function opportunityEvent(row){
  const date=timelineDay(row.updatedAt||row.createdAt);
  if(!date)return null;
  return {date,kind:'opportunity',title:row.title||'영업 기회',detail:`단계 · ${STAGE_LABEL[row.stage]||row.stage||'미정'}`,status:STAGE_LABEL[row.stage]||row.stage||'미정',id:row._id||row.id};
}

export function buildTimelineRows(companies=[],activities=[],opportunities=[],tasks=[],options={}){
  const today=options.today||timelineDay(new Date())||'';
  const year=Number(options.year)||2026;
  const planningYear=year!==2026;
  const profiles=options.profiles||{};
  const projects=options.projects||[];
  return companies.map(company=>{
    const id=company._id||company.id;
    const acts=activities.filter(row=>row.companyId===id);
    const opps=opportunities.filter(row=>row.companyId===id);
    const relatedTasks=tasks.filter(row=>row.companyId===id);
    const visibleTasks=relatedTasks.filter(row=>!['cancelled','deleted'].includes(row.status));
    const activeTasks=relatedTasks.filter(row=>!['done','cancelled','deleted'].includes(row.status));
    const stage=currentStage(company,opps);
    const activeProjects=projects.filter(row=>projectBelongsTo(row,id)&&isProjectOpen(row));
    const progress=profiles[id]?.yearProgress?.[String(year)]||null;
    if(planningYear){
      const allowed=new Set(PROGRESS_STAGES.map(([key])=>key));
      const carried=!progress&&(opps.some(isOpportunityOpen)||activeTasks.length>0||activeProjects.length>0);
      const stageKey=allowed.has(progress?.stage)?progress.stage:(carried&&allowed.has(stage.key)?stage.key:'not_started');
      const stageLabel=Object.fromEntries(PROGRESS_STAGES)[stageKey]||'미진행';
      const history=Array.isArray(progress?.history)?progress.history:[];
      const events=history.map(row=>yearProgressEvent(row,year)).filter(Boolean).sort((a,b)=>compareDate(b.date,a.date));
      const latestUpdate=events[0]||null;
      const startDay=timelineDay(progress?.startedAt);
      const next=stageKey==='not_started'?null:nextActionFor(company,tasks);
      const nextDue=timelineDay(next?.dueAt);
      const recentDays=latestUpdate?.date&&today?daysBetween(latestUpdate.date,today):null;
      const overdue=activeTasks.filter(row=>{
        const due=timelineDay(row.dueAt);return due?.startsWith(String(year)+'-')&&today&&due<today;
      }).length;
      return {
        id,company,year,planningYear:true,carried,progress,stageKey,stageLabel,
        stageIndex:YEAR_TIMELINE_STAGES.findIndex(([key])=>key===stageKey),stageSteps:YEAR_TIMELINE_STAGES,
        opportunity:stage.opportunity,startDay,targetDay:timelineDay(progress?.targetDay),next,nextDue,latestUpdate,recentDays,overdue,
        activeTasks,activeProjects,events,activityCount:0,opportunityCount:0,
        elapsedDays:startDay?Math.max(0,daysBetween(startDay,`${year}-12-31`)):null
      };
    }
    const companyUpdated=timelineDay(company.updatedAt||company.createdAt);
    const companyEvent=companyUpdated?{date:companyUpdated,kind:'company',title:'업체 정보 업데이트',detail:'',status:'업데이트',id}:null;
    const savedStage=PROGRESS_STAGES.some(([key])=>key===progress?.stage)?progress.stage:null;
    const progressEvents=(Array.isArray(progress?.history)?progress.history:[]).map(row=>yearProgressEvent(row,year));
    const events=[...acts.map(activityEvent),...visibleTasks.map(taskEvent),...opps.map(opportunityEvent),companyEvent,...progressEvents].filter(Boolean)
      .sort((a,b)=>compareDate(b.date,a.date));
    const datedActivities=acts.map(row=>timelineDay(activityDate(row))).filter(Boolean);
    const starts=[...datedActivities,timelineDay(company.createdAt),...opps.map(row=>timelineDay(row.createdAt)).filter(Boolean)].filter(Boolean).sort(compareDate);
    const startDay=starts[0]||null;
    const targetDay=timelineDay(stage.opportunity?.expectedCloseDate);
    const next=nextActionFor(company,tasks);
    const nextDue=timelineDay(next?.dueAt);
    const latestUpdate=events[0]||null;
    const recentDays=latestUpdate?.date&&today?daysBetween(latestUpdate.date,today):null;
    const overdue=activeTasks.filter(row=>{
      const due=timelineDay(row.dueAt);return due&&today&&due<today;
    }).length;
    const stageKey=savedStage||stage.key,steps=stageKey==='not_started'?YEAR_TIMELINE_STAGES:TIMELINE_STAGES;
    const mainIndex=steps.findIndex(([key])=>key===stageKey);
    return {
      id,company,year,planningYear:false,carried:false,progress,stageKey,stageLabel:savedStage?Object.fromEntries(PROGRESS_STAGES)[savedStage]:stage.label||safeText(company.stage)||'단계 미정',stageIndex:mainIndex,stageSteps:steps,
      opportunity:stage.opportunity,startDay,targetDay,next,nextDue,latestUpdate,recentDays,overdue,
      activeTasks,events,activityCount:acts.length,opportunityCount:opps.length,
      elapsedDays:startDay&&today?Math.max(0,daysBetween(startDay,today)):null
    };
  });
}

export function filterTimelineRows(rows=[],filters={}){
  const q=safeText(filters.q).toLocaleLowerCase('ko');
  return rows.filter(row=>{
    if(filters.kind&&filters.kind!=='all'&&(filters.kind==='partner'?row.company.kind!=='협력사':row.company.kind==='협력사'))return false;
    if(filters.stage&&row.stageKey!==filters.stage)return false;
    if(filters.status==='recent'&&!(row.recentDays!==null&&row.recentDays>=0&&row.recentDays<=7))return false;
    if(filters.status==='overdue'&&!row.overdue)return false;
    if(filters.status==='active'&&(row.planningYear?row.stageKey==='not_started':['won','lost','hold'].includes(row.stageKey)))return false;
    if(q){
      const hay=[row.company.name,row.company.owner,row.stageLabel,row.latestUpdate?.title,row.next?.title,row.carried?'이월 진행':''].join(' ').toLocaleLowerCase('ko');
      if(!hay.includes(q))return false;
    }
    return true;
  }).sort((a,b)=>{
    if(filters.sort==='attention')return b.overdue-a.overdue||compareDate(a.nextDue||'9999',b.nextDue||'9999')||compareDate(b.latestUpdate?.date,a.latestUpdate?.date);
    if(filters.sort==='target')return compareDate(a.targetDay||a.nextDue||'9999',b.targetDay||b.nextDue||'9999')||compareDate(b.latestUpdate?.date,a.latestUpdate?.date);
    if(filters.sort==='name')return safeText(a.company.name).localeCompare(safeText(b.company.name),'ko');
    return compareDate(b.latestUpdate?.date,a.latestUpdate?.date)||Number(b.stageKey!=='not_started')-Number(a.stageKey!=='not_started')||Number(b.carried)-Number(a.carried)||safeText(a.company.name).localeCompare(safeText(b.company.name),'ko');
  });
}

export function timelineScale(rows=[],today,year=null){
  const current=timelineDay(today)||timelineDay(new Date());
  if(year){
    const start=`${year}-01-01`,end=`${year}-12-31`,span=Math.max(1,daysBetween(start,end));
    const pct=value=>Math.max(0,Math.min(100,(daysBetween(start,value)/span)*100));
    return {start,end,position(row){
      if(!row.startDay)return {left:0,width:0};
      const withinYear=current>=start&&current<=end?current:row.startDay;
      const rowEnd=row.targetDay||withinYear||row.startDay;
      const left=pct(row.startDay),right=Math.max(left,pct(rowEnd));
      return {left,width:Math.max(1.5,right-left)};
    }};
  }
  const starts=rows.map(row=>row.startDay).filter(Boolean);
  const ends=rows.map(row=>row.targetDay||current).filter(Boolean);
  const start=starts.sort(compareDate)[0]||current;
  let end=ends.sort(compareDate).at(-1)||current;
  if(end<start)end=start;
  const span=Math.max(1,daysBetween(start,end));
  const pct=value=>Math.max(0,Math.min(100,(daysBetween(start,value)/span)*100));
  return {
    start,end,
    position(row){
      if(!row.startDay)return {left:0,width:0};
      const rowEnd=row.targetDay||current||row.startDay;
      const left=pct(row.startDay),right=Math.max(left,pct(rowEnd));
      return {left,width:Math.max(1.5,right-left)};
    }
  };
}
