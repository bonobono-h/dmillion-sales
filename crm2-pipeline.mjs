/* Read-only pipeline scopes. A task/list import is not a customer contact. */
import {buildFocusRows} from './crm2-focus.mjs?v=20261110-conversation-1';
import {buildStageBoard} from './crm2-board.mjs';
import {matchesKoreanSearch} from './crm2-search.mjs';
export const PIPELINE_FILTERS = [['all','진행 중'],['recontact','다시 연락'],['contacted','기존 접촉·분류 확인'],['lead','신규발굴'],['contact','컨택 중'],['meeting','첫 미팅·방문'],['needs','요구 확인'],['proposal','제안'],['negotiation','협상'],['contract','계약·선정'],['execution','수행·완료'],['hold','보류'],['drop','드롭'],['other','분류 확인']];
export function buildPipeline(state,{today,query='',filter='all'}={}) {
 const base=buildFocusRows(state,{today});
 const staged=buildStageBoard(base.allRows,{profiles:state.profiles,year:Number(today.slice(0,4)),today});
 const rows=staged.rows.map(row=>{
  const drop=['실패','lost','드랍·탈락','드랍','드롭','종료'].includes(row.stageRaw);
  const key=row.company.pipelineCategory==='recontact'?'recontact':drop?'drop':row.stageKey==='lead'&&row.contactCount>0?'contacted':row.stageKey;
  const active=!['hold','drop','execution','recontact','contacted'].includes(key)&&(
   !['lead','other'].includes(key)||row.recent||row.openOpportunityCount>0||row.activeProjectCount>0||row.actions.some(a=>a.source==='meeting'));
  return {...row,pipelineKey:key,inPipeline:active};
 });
 const matching=rows.filter(r=>matchesKoreanSearch([r.name,r.company.owner,r.stageLabel,r.summary,...r.actions.map(a=>a.title)].join(' '),query));
 const counts=Object.fromEntries(PIPELINE_FILTERS.map(([key])=>[key,matching.filter(r=>key==='all'?r.inPipeline:r.pipelineKey===key).length]));
 return {rows:matching.filter(r=>filter==='all'?r.inPipeline:r.pipelineKey===filter),allRows:rows,counts};
}
