const INITIALS='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

export function normalizeSearch(value){
  return String(value??'').normalize('NFKC').toLocaleLowerCase('ko')
    .replace(/[\u1100-\u1112]/g,c=>INITIALS[c.charCodeAt(0)-0x1100])
    .replace(/\s+/g,' ').trim();
}

export function matchesKoreanSearch(value,query){
  const hay=normalizeSearch(value),q=normalizeSearch(query);
  if(!q||hay.includes(q))return true;
  const pattern=[...q].map(c=>{
    const index=INITIALS.indexOf(c);
    if(index>=0){const first=0xac00+index*588;return `[${c}${String.fromCharCode(first)}-${String.fromCharCode(first+587)}]`;}
    return c===' '?'\\s*':c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  }).join('');
  return new RegExp(pattern,'u').test(hay);
}

// Preserve the live input while the IME owns it. Some browsers send a final
// input event after compositionend, so commit after that event has completed.
export function bindComposedSearch(root,{ids,onValue=()=>{},onSearch}){
  const supported=new Set(ids),composing=new Set(),pending=new Map();
  const accepts=t=>t&&supported.has(t.id)&&t.isConnected!==false;
  const cancel=t=>{if(pending.has(t)){clearTimeout(pending.get(t));pending.delete(t);}};
  const start=e=>{if(accepts(e.target)){cancel(e.target);composing.add(e.target);}};
  const input=e=>{
    const target=e.target;if(!accepts(target))return;
    onValue(target);
    if(!e.isComposing&&!composing.has(target))onSearch(target);
  };
  const end=e=>{
    const target=e.target;if(!accepts(target))return;
    onValue(target);composing.add(target);cancel(target);
    pending.set(target,setTimeout(()=>{
      pending.delete(target);composing.delete(target);
      if(accepts(target))onSearch(target);
    },0));
  };
  root.addEventListener('compositionstart',start);
  root.addEventListener('input',input);
  root.addEventListener('compositionend',end);
  return ()=>{
    root.removeEventListener('compositionstart',start);root.removeEventListener('input',input);root.removeEventListener('compositionend',end);
    for(const timer of pending.values())clearTimeout(timer);
    pending.clear();composing.clear();
  };
}
