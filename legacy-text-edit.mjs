import {captureTextEdit,loadTextEdit,saveTextEdit} from './crm2-text-edit.mjs?v=20261110-legacy-edit-1';

// A separate overlay survives legacy list/detail redraws and never rewrites unrelated fields.
export function createLegacyTextEditor({getState,onSaved=()=>{},notify=()=>{},document=globalThis.document,window=document.defaultView}){
  let current=null;
  const make=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
  function close(){
    if(!current||current.saving)return false;
    const old=current;current=null;old.layer.remove();
    for(const [node,inert] of old.background)node.inert=inert;
    document.body.style.overflow=old.overflow;
    if(old.focus?.isConnected)old.focus.focus();
    return true;
  }
  async function open({collection,id,field,label='내용',context='',directField=false}){
    if(current){current.area.focus();return false;}
    let initial;
    try{initial=captureTextEdit(getState(),collection,id,field);}catch(error){notify(error.message);return false;}
    const layer=make('div',undefined,'legacy-edit-layer');layer.id='legacyTextEditLayer';
    const panel=make('section',undefined,'legacy-edit-panel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','legacyEditTitle');
    const title=make('h2',label+' 수정');title.id='legacyEditTitle';
    const subtitle=make('p',context,'legacy-edit-context');
    const hint=make('p','이 내용만 고칩니다. 이전 문장은 수정 이력에 남습니다.','muted');
    const form=make('form');form.id='legacyTextEditForm';
    const fieldLabel=make('label',label);fieldLabel.htmlFor='legacyEditText';
    const area=make('textarea');area.id='legacyEditText';area.name='editText';area.rows=12;area.value=initial.value;area.readOnly=true;
    const status=make('p','최신 내용을 불러오는 중…','muted');status.id='legacyEditStatus';status.setAttribute('role','status');
    const errorNode=make('p','', 'legacy-edit-error');errorNode.id='legacyEditError';errorNode.setAttribute('role','alert');errorNode.hidden=true;
    const controls=make('div',undefined,'legacy-edit-controls');
    const cancel=make('button','취소','btn');cancel.type='button';cancel.id='legacyEditCancel';cancel.onclick=close;
    const save=make('button','저장','btn primary');save.type='submit';save.id='legacyEditSave';save.disabled=true;
    controls.append(cancel,save);form.append(fieldLabel,area,status,errorNode,controls);panel.append(title,subtitle,hint,form);layer.append(panel);
    const background=[...document.querySelectorAll('body > header,body > .wrap')].map(node=>[node,!!node.inert]);
    const session={layer,area,form,edit:null,saving:false,focus:document.activeElement,background,overflow:document.body.style.overflow};
    current=session;for(const [node] of background)node.inert=true;document.body.style.overflow='hidden';document.body.append(layer);cancel.focus();
    form.onsubmit=async event=>{
      event.preventDefault();if(current!==session||session.saving||!session.edit)return;
      session.saving=true;area.disabled=true;cancel.disabled=true;save.disabled=true;save.textContent='저장 중…';errorNode.hidden=true;
      let result,state;
      try{state=getState();result=await saveTextEdit(state,session.edit,area.value);}
      catch(error){errorNode.textContent=error?.message||'저장하지 못했습니다. 입력 내용은 그대로 남아 있습니다.';errorNode.hidden=false;}
      finally{session.saving=false;area.disabled=false;cancel.disabled=false;save.disabled=false;save.textContent='저장';}
      if(!result){area.focus();return;}
      close();
      // A rendering error after the confirmed write must never look like a failed save/retry.
      try{onSaved({state,edit:session.edit,result});}catch{notify('저장했습니다. 화면을 새로고침하면 최신 내용을 볼 수 있습니다.');return;}
      notify(result.unchanged?'변경한 내용이 없습니다.':result.subsequentlyChanged?'저장했습니다. 이후 변경된 최신 내용도 함께 표시합니다.':'내용을 수정했습니다.');
    };
    layer.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key==='Tab'){
        const nodes=[...panel.querySelectorAll('button,textarea,summary')].filter(node=>!node.disabled),first=nodes[0],last=nodes.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    });
    try{
      const edit=await loadTextEdit(getState(),collection,id,field,{directField});
      if(current!==session)return false;
      session.edit=edit;area.value=edit.value;area.readOnly=false;save.disabled=false;status.textContent='날짜·작성자·출처·상태·다음 기한은 바뀌지 않습니다.';
      const revisions=(Array.isArray(edit.record.crmTextEdits)?edit.record.crmTextEdits:[]).filter(item=>item?.field===field&&typeof item.before==='string');
      if(revisions.length){
        const details=make('details',undefined,'legacy-edit-history');details.append(make('summary',`이전 내용 ${revisions.length}건`),make('p','필요한 문장을 복사해 위 내용에 붙여 넣을 수 있습니다.','muted'));
        for(const revision of revisions.slice().reverse()){const article=make('article');article.append(make('small',revision.at||'수정일 미기록'),make('pre',revision.before));details.append(article);}
        controls.before(details);
      }
      area.focus();return true;
    }catch(error){
      if(current!==session)return false;
      status.textContent='최신 내용을 확인하지 못해 저장할 수 없습니다. 닫았다가 다시 열어 주세요.';errorNode.textContent=error.message;errorNode.hidden=false;area.readOnly=true;area.focus();return false;
    }
  }
  const beforeUnload=event=>{if(current?.saving||(current?.edit&&current.area.value!==current.edit.value.replace(/\r\n?/g,'\n'))){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',beforeUnload);
  return {open,close,isOpen:()=>!!current,destroy(){if(current?.saving)return false;close();window.removeEventListener('beforeunload',beforeUnload);return true;}};
}
