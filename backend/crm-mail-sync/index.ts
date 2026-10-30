import PostalMime from 'npm:postal-mime@4.2.0';
import {Imap} from '../imap.mjs';
import {emailAddresses,sourceHash,stripEmailHtml} from '../../crm2-intake-core.mjs';

const base=Deno.env.get('SUPABASE_URL')||'';
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const allowedOrigin='https://bonobono-h.github.io';
const cors={'Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
async function rest(path:string,init:RequestInit={}){
 const r=await fetch(base+path,{...init,headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',...init.headers}});
 if(!r.ok)throw new Error('CRM_STORAGE');return r.status===204?null:await r.json();
}
const rpc=(action:string,user:string|null=null,data:unknown={})=>rest('/rest/v1/rpc/crm_mail_service',{method:'POST',body:JSON.stringify({p_action:action,p_user:user,p_data:data})});
const cleanError=(error:unknown)=>{
 const code=error instanceof Error?error.message:'';
 if(code==='IMAP_AUTH')return '다음메일 로그인 실패: IMAP 사용 설정·앱 비밀번호·로그인 ID를 확인하세요.';
 if(code==='IMAP_TIMEOUT')return '메일 서버 응답 시간이 초과됐습니다. 다음 수집 때 다시 시도합니다.';
 return '메일 수집이 완료되지 않았습니다. 연결 상태를 확인하고 다시 시도하세요.';
};
async function knownContacts(){
 const rows=[];for(let offset=0;;offset+=1000){const chunk=await rest('/rest/v1/docs?collection=eq.data%2Fcontacts%2Fitems&select=path,data&offset='+offset+'&limit=1000');rows.push(...chunk);if(chunk.length<1000)break;}
 const byAddress=new Map<string,Set<string>>();
 for(const r of rows){const id=r.path.split('/').at(-1);for(const a of emailAddresses([r.data.email,r.data.emails].join(' '))){const ids=byAddress.get(a)||new Set();ids.add(id);byAddress.set(a,ids);}}
 return byAddress;
}
function candidates(mail:any,known:Map<string,Set<string>>,own:string){
 const all=[mail.from,...(mail.to||[]),...(mail.cc||[])].flatMap(x=>x?.group||[x]).map(x=>x?.address||'');
 const ids=new Set<string>();for(const a of all){if(a.toLowerCase()===own.toLowerCase())continue;for(const id of known.get(a.toLowerCase())||[])ids.add(id);}return [...ids];
}
async function collect(connection:any){
 const cursors=structuredClone(connection.cursors||{});let imap:Imap|undefined;let count=0;let timer:number|undefined;
 try{
  const work=async()=>{
   const conn=await Deno.connectTls({hostname:'imap.daum.net',port:993});imap=new Imap(conn);await imap.login(connection.login,connection.password);
   const known=await knownContacts(),folders=await imap.folders();
   const sinceDate=new Date(Date.now()-7*86400000),months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
   const since=`${sinceDate.getUTCDate()}-${months[sinceDate.getUTCMonth()]}-${sinceDate.getUTCFullYear()}`;
   let processed=0;
   for(const folder of folders){
    const validity=await imap.examine(folder.name);const old=cursors[folder.name];
    let last=old?.validity===validity?Number(old.lastUid||0):0;
    const ids=(await imap.search(last,since)).slice(0,30);
    for(const uid of ids){
     if(processed>=45)break;
     const header=await imap.header(uid),head=await PostalMime.parse(header.raw,{maxNestingDepth:20});
     const linked=candidates(head,known,connection.email);
     if(linked.length){
      const oversized=header.size>2500000;
      const mail=oversized?head:await PostalMime.parse(await imap.message(uid),{maxNestingDepth:20});
      const key=await sourceHash(mail.messageId?'email|'+mail.messageId:['email',connection.email.toLowerCase(),folder.name,validity,uid].join('|'));
      const text=String(mail.text||stripEmailHtml(mail.html)||'');
      const date=mail.date&&Number.isFinite(Date.parse(mail.date))?new Date(mail.date).toISOString():null;
      const payload={owner_id:connection.userId,source_key:'mail:'+key,source_type:'email',title:String(mail.subject||'제목 없는 메일').slice(0,300),
       body:oversized?'메일 크기가 커서 본문을 수집하지 않았습니다. 다음메일에서 원문을 확인하세요.':text.slice(0,150000),occurred_at:date,company_id:linked.length===1?linked[0]:null,
       metadata:{direction:folder.direction,from:mail.from?.address||'',to:(mail.to||[]).flatMap(x=>x.group||[x]).map(x=>x.address).filter(Boolean).join(', '),
        cc:(mail.cc||[]).flatMap(x=>x.group||[x]).map(x=>x.address).filter(Boolean).join(', '),messageId:mail.messageId||'',folder:folder.name,uid,uidValidity:validity,
        candidates:linked,bodyTruncated:oversized||text.length>150000,attachments:(mail.attachments||[]).map(x=>({name:x.filename||'첨부',mimeType:x.mimeType})),collector:'daum-imap'}};
      const inserted=await rest('/rest/v1/crm_intake_sources?on_conflict=owner_id,source_key',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify(payload)});count+=inserted.length;
     }
     last=uid;cursors[folder.name]={validity,lastUid:last};processed++;
    }
   }
   if(!folders.some(x=>x.direction==='sent'))return '받은메일은 확인했습니다. 보낸메일함을 찾지 못해 다음메일의 폴더 설정 확인이 필요합니다.';
   return null;
  };
  const error=await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{imap?.close();reject(new Error('IMAP_TIMEOUT'));},55000);})]);
  await rpc('finish',null,{id:connection.id,lease:connection.lease,cursors,error});return {count,error};
 }catch(error){const message=cleanError(error);await rpc('finish',null,{id:connection.id,lease:connection.lease,cursors,error:message});return {count,error:message};}
 finally{if(timer)clearTimeout(timer);imap?.close();}
}
Deno.serve(async(req:Request)=>{
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'POST required'},405);
 try{
  if(Number(req.headers.get('content-length')||0)>8192)return json({error:'Request too large'},413);
  const text=await req.text();if(text.length>8192)return json({error:'Request too large'},413);const data=JSON.parse(text);
  if(data.action==='tick'){
   const valid=await rpc('check_tick',null,{key:req.headers.get('x-crm-tick')||''});if(!valid)return json({error:'Unauthorized'},401);
   const connections=await rpc('claim');const results=[];for(const c of connections)results.push(await collect(c));return json({results});
  }
  const token=req.headers.get('authorization')||'';if(!/^Bearer /i.test(token))return json({error:'로그인이 필요합니다.'},401);
  const userResp=await fetch(base+'/auth/v1/user',{headers:{apikey:service,Authorization:token}});if(!userResp.ok)return json({error:'로그인이 필요합니다.'},401);
  const user=await userResp.json();const members=await rest('/rest/v1/members?user_id=eq.'+encodeURIComponent(user.id)+'&select=role');
  if(!['admin','sales'].includes(members[0]?.role))return json({error:'영업담당 이상 권한이 필요합니다.'},403);
  if(data.action==='status')return json({connection:await rpc('status',user.id),intervalMinutes:30});
  if(data.action==='disconnect')return json(await rpc('disconnect',user.id));
  if(data.action==='connect'){
   if(typeof data.email!=='string'||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)||data.email.length>200||typeof data.password!=='string'||!data.password||data.password.length>200)return json({error:'메일 주소와 앱 비밀번호를 확인하세요.'},400);
   const login=String(data.login||data.email).trim();if(login.length>200||/[\r\n\0]/.test(login))return json({error:'로그인 ID를 확인하세요.'},400);
   let imap:Imap|undefined;let timer:number|undefined;
   try{await Promise.race([(async()=>{const conn=await Deno.connectTls({hostname:'imap.daum.net',port:993});imap=new Imap(conn);await imap.login(login,data.password);})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{imap?.close();reject(new Error('IMAP_TIMEOUT'));},15000);})]);}
   catch(error){return json({error:cleanError(error)},400);}finally{if(timer)clearTimeout(timer);imap?.close();}
   await rpc('connect',user.id,{email:data.email.trim().toLowerCase(),login,password:data.password});return json({connected:true});
  }
  if(data.action==='sync'){
   const connections=await rpc('claim',user.id);if(!connections.length)return json({error:'메일 연결을 먼저 완료하거나 진행 중인 수집이 끝난 뒤 다시 시도하세요.'},409);
   return json({results:await Promise.all(connections.map(collect))});
  }
  return json({error:'지원하지 않는 요청입니다.'},400);
 }catch{return json({error:'요청을 완료하지 못했습니다. 잠시 후 다시 시도하세요.'},500);}
});
