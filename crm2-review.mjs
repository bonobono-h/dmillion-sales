// Presentation-only activity review. Never writes or transmits customer data.
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function activityReviewHTML(fd,{companyName,progressLabel=String}={}){
  const get=name=>String(fd.get(name)||'').trim();
  if(!get('companyId')||!companyName)throw new Error('대상 업체를 확인해 주세요.');
  if(!get('meetingTitle')||!get('meetingSummary'))throw new Error('활동 제목과 핵심 내용을 입력해 주세요.');
  if(get('nextDue')&&!get('nextAction'))throw new Error('후속 일정이 있다면 다음 해야 할 일도 입력해 주세요.');
  const date=get('meetingAt');
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date)||Number.isNaN(new Date(date).getTime()))throw new Error('활동 일시를 확인해 주세요.');
  if(get('updateProgress')==='on'&&get('meetingStatus')==='예정')throw new Error('예정 활동은 진행 단계를 변경할 수 없습니다.');
  const row=(label,value)=>`<div class="crm-review-row"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
  return `<div class="crm-review-intro"><span>마지막 확인</span><h3>저장 전 확인</h3><p>아래 내용을 확인하고 승인해 주세요. 아직 저장되지 않았습니다.</p></div><dl class="crm-review-summary">${row('대상 업체',companyName)}${row('활동',`${date.replace('T',' ')} · ${get('meetingType')} · ${get('meetingStatus')}`)}${row('활동 제목',get('meetingTitle'))}${row('대화 내용',get('meetingSummary'))}${row('다음 행동',get('nextAction')||'없음')}${get('nextAction')?row('기한 / 후속 업무',`${get('nextDue')||'일정 미정'} · ${get('createTask')==='on'?'CRM 업무 등록 (같은 미완료 업무는 중복 제외)':'활동 기록에만 보관'}`):''}${get('attendeesClient')?row('고객 측 참석자',get('attendeesClient')):''}${get('attendeesUs')?row('디밀리언 참석자',get('attendeesUs')):''}${row('진행 단계',get('updateProgress')==='on'?`변경: ${get('progressYear')}년 · ${progressLabel(get('progressStage'))}`:'현재 단계 유지')}</dl><p class="crm-review-safe">승인한 활동과 선택한 후속 업무만 반영합니다. 금액·계약 상태는 변경하지 않습니다.</p><label class="crm-review-confirm"><input type="checkbox" name="approveReview" required> 위 내용을 확인했습니다.</label>`;
}
