// Display attribution only. Never use these fields for authorization.
export const accountId = value => typeof value === 'string' ? value.trim() : '';
export function accountLabel(id, profiles={}) {
  id=accountId(id);
  if(!id)return '기록 없음';
  const name=profiles[id]?.name;
  return typeof name==='string'&&name.trim()?name.trim():'이름 확인 불가';
}
export function activityIdentity(activity={}, {profiles={},lastSavedBy=null}={}) {
  const authorId=accountId(activity.createdBy),editorId=accountId(lastSavedBy);
  return {authorId,editorId,author:accountLabel(authorId,profiles),editor:accountLabel(editorId,profiles),
    participants:typeof activity.attendeesUs==='string'?activity.attendeesUs.trim():''};
}
