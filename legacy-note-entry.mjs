import {freeformNoteRecord} from './crm2-records.mjs?v=20261110-notes-1';

const failure=(code,message)=>Object.assign(new Error(message),{code});
function checkSession(state,draft){
  if(state.canWrite!==true)throw failure('permission-denied','메모 작성 권한을 확인해 주세요.');
  if(typeof state.userId!=='string'||!state.userId.trim()||!state.db||!state.userCap||
    (draft&&(state.userId!==draft.userId||state.db!==draft.db||state.userCap!==draft.userCap)))
    throw failure('unauthenticated','로그인 상태가 바뀌었거나 확인되지 않습니다. 입력 내용을 복사해 둔 뒤 다시 열어 주세요.');
  if(!state.companies?.some(row=>row._id===(draft?.companyId)))throw failure('not-found','업체 정보를 찾을 수 없습니다. 입력 내용은 그대로 남아 있습니다.');
}
export function captureLegacyNote(state,companyId){
  checkSession(state,{companyId,userId:state.userId,db:state.db,userCap:state.userCap});
  return {companyId,userId:state.userId,db:state.db,userCap:state.userCap,id:'note-'+crypto.randomUUID(),attempt:null};
}
export async function saveLegacyNote(getState,draft,text){
  checkSession(getState(),draft);
  const record=freeformNoteRecord({companyId:draft.companyId,summary:text,createdBy:draft.userId,now:draft.attempt?.createdAt||new Date().toISOString()});
  if(draft.attempt&&draft.attempt.summary!==record.summary)
    throw failure('pending-operation','앞선 저장 결과를 먼저 확인해야 합니다. 바꾼 내용을 복사해 두고 이전 입력으로 다시 저장하거나 기록을 확인해 주세요.');
  // Recheck the capability; the bridge separately verifies the current Supabase account.
  const [userId,canWrite]=await Promise.all([draft.userCap.id(),draft.userCap.can('data.write')]);
  checkSession(getState(),draft);
  if(userId!==draft.userId)throw failure('unauthenticated','로그인 계정이 바뀌었습니다. 입력 내용을 복사해 둔 뒤 다시 열어 주세요.');
  if(canWrite!==true)throw failure('permission-denied','메모 작성 권한이 없어 저장하지 못했습니다. 입력 내용은 그대로 남아 있습니다.');
  const ref=draft.db.doc('activities/'+draft.id);
  if(typeof ref?.createIfAbsent!=='function')throw failure('unsupported','안전한 메모 저장 기능을 불러오지 못했습니다. 입력 내용을 복사해 둔 뒤 새로고침해 주세요.');
  draft.attempt??=structuredClone(record);
  const doc=await ref.createIfAbsent(draft.attempt,{expectedUserId:draft.userId});
  if(!doc?.exists)throw failure('unavailable','저장 결과를 확인하지 못했습니다. 입력 내용은 그대로 남아 있습니다.');
  return {id:draft.id,companyId:draft.companyId,recordData:structuredClone(doc.data()),version:doc.version};
}

// Body-level overlay keeps drafts intact through realtime renders and navigation.
export function createLegacyNoteEntry({getState,onSaved=()=>{},notify=()=>{},document=globalThis.document,window=document.defaultView}){
  let current=null;
  const make=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
  function close(){
    if(!current||current.saving)return false;
    const old=current;current=null;old.layer.remove();
    for(const [node,inert] of old.background)node.inert=inert;
    document.body.style.overflow=old.overflow;if(old.focus?.isConnected)old.focus.focus();return true;
  }
  function open(companyId){
    if(current){current.area.focus();return false;}
    let draft;try{draft=captureLegacyNote(getState(),companyId);}catch(error){notify(error.message);return false;}
    const company=getState().companies.find(row=>row._id===companyId);
    const layer=make('div',undefined,'legacy-edit-layer');layer.id='legacyNoteLayer';
    const panel=make('section',undefined,'legacy-edit-panel legacy-note-panel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','legacyNoteTitle');
    const title=make('h2','메모 남기기');title.id='legacyNoteTitle';
    const context=make('p',company.name,'legacy-edit-context');
    const form=make('form');form.id='legacyNoteForm';
    const label=make('label','메모');label.htmlFor='legacyNoteText';
    const area=make('textarea');area.id='legacyNoteText';area.name='noteText';area.rows=10;area.placeholder='생각나는 내용을 편하게 적어 주세요.';
    const hint=make('p','작성한 내용 그대로 저장합니다. 통화·방문 실적이나 일정은 만들지 않습니다.','muted');hint.id='legacyNoteHint';area.setAttribute('aria-describedby',hint.id);
    const errorNode=make('p','','legacy-edit-error');errorNode.id='legacyNoteError';errorNode.setAttribute('role','alert');errorNode.hidden=true;
    const controls=make('div',undefined,'legacy-edit-controls');
    const cancel=make('button','취소','btn');cancel.type='button';cancel.id='legacyNoteCancel';cancel.onclick=close;
    const save=make('button','저장','btn primary');save.type='submit';save.id='legacyNoteSave';
    controls.append(cancel,save);form.append(label,area,hint,errorNode,controls);panel.append(title,context,form);layer.append(panel);
    const background=[...document.querySelectorAll('body > header,body > .wrap')].map(node=>[node,!!node.inert]);
    const session={draft,area,layer,saving:false,background,overflow:document.body.style.overflow,focus:document.activeElement};current=session;
    for(const [node] of background)node.inert=true;document.body.style.overflow='hidden';document.body.append(layer);area.focus();
    form.onsubmit=async event=>{
      event.preventDefault();if(current!==session||session.saving)return;
      session.saving=true;area.disabled=true;cancel.disabled=true;save.disabled=true;save.textContent='저장 중…';errorNode.hidden=true;
      let result;
      try{result=await saveLegacyNote(getState,session.draft,area.value);}catch(error){errorNode.textContent=error?.message||'저장하지 못했습니다. 입력 내용은 그대로 남아 있습니다.';errorNode.hidden=false;}
      finally{session.saving=false;area.disabled=false;cancel.disabled=false;save.disabled=false;save.textContent='저장';}
      if(!result){area.focus();return;}
      close();
      try{onSaved(result);}catch{notify('메모를 저장했습니다. 새로고침하면 최신 내용을 볼 수 있습니다.');return;}
      notify('메모를 남겼습니다.');
    };
    layer.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key==='Tab'){
        const nodes=[area,cancel,save].filter(node=>!node.disabled),first=nodes[0],last=nodes.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    });return true;
  }
  const beforeUnload=event=>{if(current&&(current.saving||current.area.value)){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',beforeUnload);
  return {open,close,isOpen:()=>!!current,destroy(){if(current?.saving)return false;close();window.removeEventListener('beforeunload',beforeUnload);return true;}};
}
