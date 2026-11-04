import {buildTimelineRows,PROGRESS_STAGES} from './crm2-timeline.mjs?v=20261104-records-1';

export const ACTIVITY_TYPES=['첫 미팅','현장 방문','요구 확인','내방','화상','제안·발표','전화','메일','미팅'];
export const suggestedProgress=type=>({'첫 미팅':'meeting','현장 방문':'visit','요구 확인':'qualification','제안·발표':'proposal'}[type]||'');
export const progressLabel=stage=>Object.fromEntries(PROGRESS_STAGES)[stage]||'단계 미정';
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const companyId=c=>c._id||c.id;
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};

export function currentProgress(state,id,year){
 const company=state.companies.find(c=>companyId(c)===id);
 return company?buildTimelineRows([company],state.activities,state.opportunities,state.tasks,{year,profiles:state.profiles,projects:state.projects})[0]:null;
}

export function progressFields(state,{id,type='',year=2026}={}){
 const row=currentProgress(state,id,year),stage=suggestedProgress(type)||row?.stageKey||'discovery';
 return `<section class="crm-progress-choice" data-progress-choice>
  <strong>업체 진행 단계 <span class="muted">선택 사항</span></strong>
  <p class="small muted" data-progress-current>현재 ${year}년 · ${esc(row?.stageLabel||'업체 선택 필요')}</p>
  <label class="crm-inline-check"><input type="checkbox" name="updateProgress"> 진행 단계도 함께 변경</label>
  <fieldset class="form-row" data-progress-fields disabled>
   <label>적용 연도<select name="progressYear">${[2026,2027].map(y=>`<option value="${y}" ${Number(year)===y?'selected':''}>${y}년</option>`).join('')}</select></label>
   <label>변경할 단계<select name="progressStage">${PROGRESS_STAGES.map(([key,label])=>`<option value="${key}" ${stage===key?'selected':''}>${label}</option>`).join('')}</select></label>
  </fieldset>
  <small>완료한 활동만 단계와 함께 저장할 수 있습니다. 체크하지 않으면 현재 단계를 유지합니다.</small>
 </section>`;
}

export function syncProgressFields(state,form,suggest=false){
 const section=form?.querySelector('[data-progress-choice]');if(!section)return;
 const input=name=>form.elements.namedItem(name);
 const scheduled=input('meetingStatus')?.value==='예정';
 const check=input('updateProgress');check.disabled=scheduled;if(scheduled)check.checked=false;
 section.querySelector('[data-progress-fields]').disabled=!check.checked||scheduled;
 const id=input('companyId')?.value,year=Number(input('progressYear').value);
 const row=currentProgress(state,id,year);
 section.querySelector('[data-progress-current]').textContent=`현재 ${year}년 · ${row?.stageLabel||'업체 선택 필요'}${scheduled?' / 예정 활동은 단계 변경 없이 저장':''}`;
 if(suggest){const type=input('meetingType')?.value||input('activityType')?.value;input('progressStage').value=suggestedProgress(type)||row?.stageKey||'discovery';}
}

export function selectedProgress(fd){
 if(fd.get('updateProgress')!=='on')return null;
 const year=Number(fd.get('progressYear')),stage=String(fd.get('progressStage')||'');
 if(![2026,2027].includes(year)||!PROGRESS_STAGES.some(([key])=>key===stage))throw new Error('적용 연도와 변경할 진행 단계를 확인해 주세요.');
 if(fd.get('meetingStatus')==='예정')throw new Error('예정 활동은 진행 단계를 변경할 수 없습니다.');
 return {year,stage};
}

export async function saveProgress(state,id,{year,stage},{sourceActivityId=null,note='',now=new Date().toISOString()}={}){
 if(!state.canWrite)throw new Error('진행 단계 수정 권한이 없습니다.');
 if(!state.companies.some(c=>companyId(c)===id))throw new Error('업체 정보를 찾을 수 없습니다.');
 if(![2026,2027].includes(Number(year))||!PROGRESS_STAGES.some(([key])=>key===stage))throw new Error('변경할 진행 단계를 확인해 주세요.');
 let profile=state.profiles[id]||{},exists=!!profile._id,ref;
 if(!state.demo){ref=state.db.doc(`crm2Profiles/${id}`);const snap=await ref.get();exists=snap.exists;profile=exists?{...snap.data(),_id:id}:{};}
 const key=String(year),all=object(profile.yearProgress),previous=object(all[key]);
 if(previous.stage===stage){state.profiles[id]=profile;return {changed:false};}
 const history=[...(Array.isArray(previous.history)?previous.history:[]),{id:crypto.randomUUID(),stage,at:now,by:state.userId||null,...(sourceActivityId?{sourceActivityId}:{}),...(note?{note}:{} )}];
 const record={...previous,stage,updatedAt:now,history};
 const patch={yearProgress:{...all,[key]:record},updatedAt:now};
 if(!state.demo){if(exists)await ref.update(patch);else await ref.set(patch);}
 state.profiles[id]={...state.profiles[id],...profile,...patch,_id:id};
 return {changed:true};
}

export function validateContact(values){
 const result={};
 for(const key of ['contactPerson','phone','email'])result[key]=String(values[key]??'').trim();
 if(result.contactPerson.length>300||result.phone.length>300||result.email.length>600)throw new Error('담당자 또는 연락처가 너무 깁니다.');
 if(result.phone&&!/[0-9]{2}/.test(result.phone))throw new Error('전화번호를 확인해 주세요.');
 if(result.email&&result.email.split(/[,;\s]+/).filter(Boolean).some(e=>!/^([^<>@\s]+)@([^<>@\s]+)\.[^<>@\s]+$/.test(e)))throw new Error('이메일 주소를 확인해 주세요. 여러 주소는 쉼표로 구분하세요.');
 return result;
}

export async function saveContact(state,id,values){
 if(!state.canWrite)throw new Error('연락처 수정 권한이 없습니다.');
 if(!state.companies.some(c=>companyId(c)===id))throw new Error('업체 정보를 찾을 수 없습니다.');
 const now=new Date().toISOString(),patch={...validateContact(values),updatedAt:now,contactEditedAt:now};
 let existing=state.contacts[id]||{},ref,exists=false;
 if(!state.demo){ref=state.db.doc(`data/contacts/items/${id}`);const snap=await ref.get();exists=snap.exists;existing=exists?snap.data():{};
  if(exists)await ref.update(patch);else await ref.set(patch);
 }
 const record={...existing,...patch};
 state.contacts[id]=record;(state.contactOverrides??={})[id]=record;
 return record;
}
