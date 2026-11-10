/* In-place text edits. No date, identity, status, stage or task inference. */
const idOf=row=>row?._id||row?.id;
const REPORT_FIELDS=new Set(['report.purpose','report.decisionMaker','report.problem','report.proposal','report.reaction','report.blockers']);
const ALLOWED={activities:new Set(['summary','content','purpose','nextAction','title','issue',...REPORT_FIELDS]),companies:new Set(['nextAction','needs','memo','bizDetail','scale','checkNote']),tasks:new Set(['title'])};
const HISTORY_FIELDS=new Set(Object.values(ALLOWED).flatMap(fields=>[...fields]));
const error=(code,message)=>Object.assign(new Error(message),{code});
export const rawText=(record,field)=>REPORT_FIELDS.has(field)?record?.report?.[field.slice(7)]:record?.[field];
function validateReport(record,field){
  if(REPORT_FIELDS.has(field)&&record?.report!=null&&(typeof record.report!=='object'||Array.isArray(record.report)))
    throw error('invalid-field','기존 보고서 형식을 확인할 수 없어 저장을 중단했습니다. 관리자에게 확인해 주세요.');
}
export function activityTextField(record={}){
  const fields=['summary','content','report.purpose','purpose'];
  return fields.find(field=>typeof rawText(record,field)==='string'&&rawText(record,field).trim())
    ||fields.find(field=>typeof rawText(record,field)==='string')||'summary';
}
export function isDeletedTextRecord(record){return !!record?.deletedAt||['deleted','삭제'].includes(record?.status);}
function target(state,collection,id,field){
  if(!ALLOWED[collection]?.has(field))throw error('invalid-field','이 항목은 여기서 수정할 수 없습니다.');
  const record=state[collection]?.find(row=>idOf(row)===id);
  if(!record||isDeletedTextRecord(record))throw error('not-found','삭제되었거나 찾을 수 없는 기록입니다.');
  return record;
}
export function captureTextEdit(state,collection,id,field){
  if(!state.canWrite)throw error('permission-denied','수정 권한이 없습니다.');
  const record=target(state,collection,id,field);validateReport(record,field);
  const value=rawText(record,field);
  if(value!=null&&typeof value!=='string')throw error('invalid-field','문자 형식이 아닌 기록은 여기서 수정할 수 없습니다.');
  return {collection,id,field,value:value??'',version:state.docVersions?.[collection+'/'+id],
    record:structuredClone(record),userId:state.userId,db:state.db,demo:state.demo,editId:crypto.randomUUID()};
}
export async function loadTextEdit(state,collection,id,field,{directField=false}={}){
  const edit=captureTextEdit(state,collection,id,field);
  // Explicit report controls edit that exact field, even when a summary is also shown.
  // Ordinary summary cards retain the source-field provenance check below.
  edit.directField=directField===true&&REPORT_FIELDS.has(field);
  if(edit.demo)return edit;
  if(typeof edit.userId!=='string'||!edit.userId.trim())throw error('unauthenticated','로그인 상태를 확인해 주세요.');
  const doc=await edit.db.doc(collection+'/'+id).get();
  if(!doc?.exists||isDeletedTextRecord(doc.data()))throw error('not-found','삭제되었거나 접근할 수 없는 기록입니다.');
  if(!Number.isSafeInteger(doc.version)||doc.version<1)throw error('version-required','기록 버전을 확인할 수 없습니다. 새로고침 후 다시 열어 주세요.');
  const data=doc.data();validateReport(data,field);
  const value=rawText(data,field);
  if(!edit.directField&&collection==='activities'&&['summary','content','report.purpose','purpose'].includes(field)&&activityTextField(data)!==field)
    throw error('conflict','표시된 내용의 원본이 변경되었습니다. 최신 화면을 확인한 뒤 다시 열어 주세요.');
  if(value!=null&&typeof value!=='string')throw error('invalid-field','문자 형식이 아닌 기록은 여기서 수정할 수 없습니다.');
  return {...edit,record:data,value:value??'',version:doc.version};
}
export const TEXT_HISTORY_KEY='crmTextEdits';
export function revisionPatch(edit,patch){
  const prior=edit.record[TEXT_HISTORY_KEY];
  if(prior!==undefined&&(!Array.isArray(prior)||prior.some(item=>!item||typeof item!=='object'||Array.isArray(item)||typeof item.editId!=='string'||!item.editId||typeof item.field!=='string'||!HISTORY_FIELDS.has(item.field)||!Object.hasOwn(item,'before')||(item.before!==null&&typeof item.before!=='string')||typeof item.after!=='string')))
    throw error('invalid-history','이전 수정 이력을 확인할 수 없어 저장을 중단했습니다. 관리자에게 확인해 주세요.');
  if(prior&&new Set(prior.map(item=>item.editId)).size!==prior.length)throw error('invalid-history','이전 수정 이력이 중복되어 저장을 중단했습니다. 관리자에게 확인해 주세요.');
  if((prior?.length||0)>=200)throw error('history-limit','수정 이력 보관 한도에 도달했습니다. 이전 내용을 보존하려면 관리자 확인이 필요합니다.');
  const before=rawText(edit.record,edit.field),after=rawText(patch,edit.field);
  const history=[...(prior||[]),{editId:edit.editId,field:edit.field,before:before??null,beforePresent:before!==undefined,
    after,baseVersion:edit.version??null,at:patch.updatedAt,by:edit.userId||null}];
  const result={...patch,[TEXT_HISTORY_KEY]:history};
  if(new TextEncoder().encode(JSON.stringify({...edit.record,...result})).length>1024*1024)
    throw error('history-limit','원문과 수정 이력을 안전하게 보관할 수 있는 크기를 초과했습니다. 입력 내용을 복사해 두고 관리자에게 확인해 주세요.');
  return result;
}
// Native textareas normalize line endings. Preserve unchanged originals, including a leading LF,
// and retain CRLF/CR style for edited records that consistently used that style.
export function storedDraft(original,draft){
  if(typeof draft!=='string')throw error('invalid-text','수정할 내용을 확인해 주세요.');
  const normalized=original.replace(/\r\n?/g,'\n');
  if(draft===normalized||draft===original)return original;
  const normalizedDraft=draft.replace(/\r\n?/g,'\n');
  if(original.includes('\r\n')&&!original.replace(/\r\n/g,'').match(/[\r\n]/))return normalizedDraft.replace(/\n/g,'\r\n');
  if(original.includes('\r')&&!original.includes('\n'))return normalizedDraft.replace(/\n/g,'\r');
  return draft;
}
export function textPatch(edit,draft,now=new Date().toISOString()){
  if(!ALLOWED[edit.collection]?.has(edit.field))throw error('invalid-field','이 항목은 여기서 수정할 수 없습니다.');
  validateReport(edit.record,edit.field);
  const text=storedDraft(edit.value,draft);
  if(text===edit.value)return null;
  if(text.length>150000)throw error('invalid-text','내용은 150,000자 이하로 나누어 주세요.');
  if(edit.collection==='activities'&&['summary','content','report.purpose','purpose'].includes(edit.field)&&!text.trim()&&
    !(edit.directField&&activityTextField(edit.record)!==edit.field)&&
    ['summary','content','report.purpose','purpose'].some(field=>field!==edit.field&&typeof rawText(edit.record,field)==='string'&&rawText(edit.record,field).trim()))
    throw error('ambiguous-clear','다른 원문이 함께 있어 내용을 비우면 이전 문장이 표시될 수 있습니다. 수정할 내용을 입력해 주세요.');
  return REPORT_FIELDS.has(edit.field)?{report:{...edit.record.report,[edit.field.slice(7)]:text},updatedAt:now}:{[edit.field]:text,updatedAt:now};
}
export async function saveTextEdit(state,edit,draft){
  if(!state.canWrite)throw error('permission-denied','수정 권한이 없습니다.');
  if(state.demo!==edit.demo||(!state.demo&&(state.db!==edit.db||state.userId!==edit.userId||typeof state.userId!=='string'||!state.userId.trim())))
    throw error('unauthenticated','로그인 상태가 바뀌었습니다. 입력 내용을 복사해 둔 뒤 다시 열어 주세요.');
  const record=target(state,edit.collection,edit.id,edit.field),changes=textPatch(edit,draft);
  if(edit.attempt && (!changes||JSON.stringify(edit.attempt.changes)!==JSON.stringify({...changes,updatedAt:edit.attempt.changes.updatedAt})))
    throw error('pending-operation','앞선 저장 결과를 먼저 확인해야 합니다. 새 입력을 복사해 둔 뒤 기록을 다시 열어 주세요.');
  if(!changes)return {unchanged:true};
  const patch=edit.attempt?.patch||revisionPatch(edit,changes);
  let saved,recordData,version,applySaved=true,subsequentlyChanged=false;
  if(state.demo){
    if(JSON.stringify(record)!==JSON.stringify(edit.record))throw error('conflict','다른 곳에서 기록이 변경되었습니다. 입력 내용을 복사해 둔 뒤 최신 기록을 다시 열어 주세요.');
    saved={...record,...patch};
  }else{
    if(!Number.isSafeInteger(edit.version)||edit.version<1)throw error('version-required','기록 버전을 확인할 수 없습니다. 입력 내용을 복사해 둔 뒤 새로고침해 주세요.');
    const ref=state.db?.doc(edit.collection+'/'+edit.id);
    if(typeof ref?.updateIfVersion!=='function')throw error('unsupported','안전한 수정 기능을 불러오지 못했습니다. 입력 내용을 복사해 둔 뒤 새로고침해 주세요.');
    edit.attempt??={changes:structuredClone(changes),patch:structuredClone(patch)};
    const doc=await ref.updateIfVersion(patch,edit.version,{baseData:edit.record,editId:edit.editId});
    if(!doc?.exists)throw error('unavailable','저장 결과를 확인할 수 없습니다. 입력 내용을 유지한 채 연결 상태를 확인해 주세요.');
    // Keep the pure server snapshot separate from UI identity fields for other editors.
    recordData=structuredClone(doc.data());version=doc.version;
    saved={...structuredClone(recordData),_id:edit.id};
    subsequentlyChanged=doc.version>edit.version+1;
    const key=edit.collection+'/'+edit.id,knownVersion=state.docVersions?.[key];
    if(Number.isSafeInteger(knownVersion)&&knownVersion>doc.version){
      applySaved=false;subsequentlyChanged=true;
    }else{
      (state.docVersions??={})[key]=doc.version;
      (state.docUpdatedAt??={})[key]=doc.updatedAt||null;
      (state.docUpdatedBy??={})[key]=doc.updatedBy||null;
    }
  }
  // Do not fabricate other records or replace a later navigation choice.
  const index=state[edit.collection].findIndex(row=>idOf(row)===edit.id);
  if(applySaved&&index>=0)state[edit.collection][index]=saved;
  return {unchanged:false,subsequentlyChanged,...(!state.demo?{recordData,version}:{})};
}
