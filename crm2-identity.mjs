// Display attribution only. Never use these fields for authorization.
export const accountId = value => typeof value === 'string' ? value.trim() : '';
export function accountLabel(id, profiles={}) {
  id=accountId(id);
  if(!id)return '기록 없음';
  const name=profiles[id]?.name;
  return typeof name==='string'&&name.trim()?name.trim():'이름 확인 불가';
}
// A descriptive JSON source, not an authenticated account or authorization claim.
export function activitySourceLabel(activity={}) {
  if(activity.source==='crm2-note')return '직접 작성 메모';
  const actor=activity.sourceActor;
  return activity.source==='dot-conversation'&&actor?.kind==='service'&&actor?.id==='dot'
    ?'dot 대화 정리':'';
}
export function activityIdentity(activity={}, {profiles={},lastSavedBy=null}={}) {
  const authorId=accountId(activity.createdBy),editorId=accountId(lastSavedBy);
  return {sourceLabel:activitySourceLabel(activity),authorId,editorId,author:accountLabel(authorId,profiles),editor:accountLabel(editorId,profiles),
    participants:typeof activity.attendeesUs==='string'?activity.attendeesUs.trim():''};
}
