-- Additive CRM intake. Original customer records and permissions are unchanged.
create schema if not exists crm_private;
revoke all on schema crm_private from public, anon, authenticated;

create table if not exists public.crm_intake_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  source_key text not null check(length(source_key) between 1 and 240),
  source_type text not null check(source_type in ('email','meeting','document')),
  title text not null check(length(title) between 1 and 300),
  body text not null default '' check(length(body)<=150000),
  occurred_at timestamptz,
  company_id text,
  metadata jsonb not null default '{}' check(octet_length(metadata::text)<=150000),
  status text not null default 'pending' check(status in ('pending','approved','ignored')),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,source_key)
);
alter table public.crm_intake_sources enable row level security;
create index if not exists crm_intake_owner_status on public.crm_intake_sources(owner_id,status,created_at desc);
create policy "intake own read" on public.crm_intake_sources for select to authenticated
  using(owner_id=auth.uid() and public.my_role() in ('admin','sales'));
create policy "intake own insert" on public.crm_intake_sources for insert to authenticated
  with check(owner_id=auth.uid() and public.my_role() in ('admin','sales') and status='pending' and result is null);
create policy "intake own update" on public.crm_intake_sources for update to authenticated
  using(owner_id=auth.uid() and public.my_role() in ('admin','sales'))
  with check(owner_id=auth.uid() and public.my_role() in ('admin','sales'));
revoke all on public.crm_intake_sources from anon;
grant select,insert,update on public.crm_intake_sources to authenticated;
grant all on public.crm_intake_sources to service_role;

insert into storage.buckets(id,name,public,file_size_limit) values('crm-intake','crm-intake',false,20971520)
on conflict(id) do nothing;
create policy "intake files own read" on storage.objects for select to authenticated
 using(bucket_id='crm-intake' and (storage.foldername(name))[1]=auth.uid()::text and public.my_role() in ('admin','sales'));
create policy "intake files own insert" on storage.objects for insert to authenticated
 with check(bucket_id='crm-intake' and (storage.foldername(name))[1]=auth.uid()::text and public.my_role() in ('admin','sales'));

-- One transaction, row lock and deterministic document IDs make retries safe.
create or replace function public.crm_intake_approve(p_id uuid,p_company text,p_record jsonb,p_tasks jsonb default '[]',p_document jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.crm_intake_sources; a_id text; t_id text; t jsonb; t_ids jsonb:='[]';
  co jsonb; doc jsonb; n integer:=0; dt timestamptz; due date; existing text; outcome jsonb;
begin
 if auth.uid() is null or coalesce(public.my_role(),'pending') not in ('admin','sales') then raise exception 'permission denied'; end if;
 select * into s from public.crm_intake_sources where id=p_id and owner_id=auth.uid() for update;
 if not found then raise exception 'source not found'; end if;
 if s.status='approved' then return s.result; end if;
 if s.status<>'pending' then raise exception 'source is not pending'; end if;
 select data into co from public.docs where path='companies/'||p_company for update;
 if not found then raise exception 'company not found'; end if;
 if length(trim(coalesce(p_record->>'title','')))=0 or length(p_record->>'title')>160
   or length(trim(coalesce(p_record->>'summary','')))=0 or length(p_record->>'summary')>150000 then raise exception 'title and summary required'; end if;
 dt:=(p_record->>'date')::timestamptz;
 if dt is null or dt>now()+interval '5 minutes' then raise exception 'completed record date required'; end if;
 if s.source_type='meeting' and coalesce(p_record->>'type','') not in ('첫 미팅','현장 방문','내방','화상','제안·발표','미팅') then raise exception 'invalid meeting type'; end if;
 if jsonb_typeof(p_tasks)<>'array' or jsonb_array_length(p_tasks)>20 then raise exception 'invalid tasks'; end if;
 a_id:='intake-'||s.id::text;
 insert into public.docs(path,data) values('activities/'||a_id,jsonb_build_object(
   'companyId',p_company,'date',dt,'type',case when s.source_type='email' then '메일' when s.source_type='document' then '자료 등록' else p_record->>'type' end,
   'title',p_record->>'title','summary',p_record->>'summary','status','완료',
   'source','crm-intake','sourceId',s.id,'sourceType',s.source_type,
   'direction',s.metadata->>'direction','createdAt',now(),'updatedAt',now()))
 on conflict(path) do nothing;
 for t in select value from jsonb_array_elements(p_tasks) loop
   n:=n+1;
   if length(trim(coalesce(t->>'title','')))=0 or length(t->>'title')>180 then raise exception 'invalid task title'; end if;
   due:=nullif(t->>'dueAt','')::date;
   select path into existing from public.docs where collection='tasks' and data->>'companyId'=p_company
     and trim(data->>'title')=trim(t->>'title') and coalesce(data->>'status','todo') not in ('done','cancelled','deleted') limit 1;
   if existing is not null then t_ids:=t_ids||jsonb_build_array(split_part(existing,'/',2));continue; end if;
   t_id:=a_id||'-task-'||n;
   insert into public.docs(path,data) values('tasks/'||t_id,jsonb_build_object('companyId',p_company,
     'title',trim(t->>'title'),'dueAt',due,'status','todo','priority','normal','assigneeId',auth.uid(),
     'sourceActivityId',a_id,'sourceId',s.id,'source','crm-intake','createdAt',now())) on conflict(path) do nothing;
   t_ids:=t_ids||jsonb_build_array(t_id);
 end loop;
 if p_document is not null then
   if s.source_type<>'document' or length(coalesce(p_document->>'id',''))=0 or length(coalesce(p_document->>'name',''))=0
     or not exists(select 1 from storage.objects where bucket_id='files' and name=p_document->>'id') then raise exception 'document file not found'; end if;
   doc:=jsonb_build_object('id',p_document->>'id','name',left(p_document->>'name',300),'kind',left(coalesce(p_document->>'kind','기타'),30),
       'size',coalesce((p_document->>'size')::bigint,0),'at',now(),'sourceId',s.id);
   update public.docs set data=jsonb_set(co,'{docs}',coalesce(co->'docs','[]')||jsonb_build_array(doc)) where path='companies/'||p_company;
 end if;
 outcome:=jsonb_build_object('activityId',a_id,'taskIds',t_ids,'companyId',p_company);
 update public.crm_intake_sources set status='approved',company_id=p_company,result=outcome,updated_at=now() where id=s.id;
 return outcome;
end $$;
revoke all on function public.crm_intake_approve(uuid,text,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.crm_intake_approve(uuid,text,jsonb,jsonb,jsonb) to authenticated;

create table crm_private.mail_connections (
 id uuid primary key default gen_random_uuid(),user_id uuid not null unique references auth.users(id),
 email text not null,login text not null,secret_id uuid not null,enabled boolean not null default true,
 cursors jsonb not null default '{}',locked_until timestamptz,lease uuid,
 last_sync timestamptz,last_error text,created_at timestamptz not null default now()
);
alter table crm_private.mail_connections enable row level security;
revoke all on crm_private.mail_connections from public,anon,authenticated;

-- Service-only interface: no mailbox credentials can be queried by a browser.
create or replace function public.crm_mail_service(p_action text,p_user uuid default null,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare c crm_private.mail_connections; secret uuid; result jsonb; job_lease uuid:=gen_random_uuid();
begin
 if p_action='check_tick' then
   return to_jsonb(exists(select 1 from vault.decrypted_secrets where name='crm_mail_tick_key' and decrypted_secret=p_data->>'key'));
 elsif p_action='status' then
   select jsonb_build_object('email',email,'enabled',enabled,'lastSync',last_sync,'lastError',last_error) into result
     from crm_private.mail_connections where user_id=p_user;
   return coalesce(result,'null'::jsonb);
 elsif p_action='connect' then
   if not exists(select 1 from public.members where user_id=p_user and role in ('admin','sales')) then raise exception 'permission denied'; end if;
   select * into c from crm_private.mail_connections where user_id=p_user for update;
   if found then perform vault.update_secret(c.secret_id,p_data->>'password');secret:=c.secret_id;
   else secret:=vault.create_secret(p_data->>'password','crm_mail_'||p_user::text,'CRM Daum IMAP');end if;
   insert into crm_private.mail_connections(user_id,email,login,secret_id) values(p_user,p_data->>'email',p_data->>'login',secret)
     on conflict(user_id) do update set email=excluded.email,login=excluded.login,enabled=true,
       cursors=case when crm_private.mail_connections.email=excluded.email then crm_private.mail_connections.cursors else '{}' end,
       locked_until=null,lease=null,last_error=null;
   return jsonb_build_object('connected',true);
 elsif p_action='disconnect' then
   update crm_private.mail_connections set enabled=false,locked_until=null,lease=null where user_id=p_user;
   return jsonb_build_object('connected',false);
 elsif p_action='claim' then
   with chosen as (select mc.id from crm_private.mail_connections mc join public.members m on m.user_id=mc.user_id
     where mc.enabled and m.role in ('admin','sales') and (p_user is null or mc.user_id=p_user)
       and (mc.locked_until is null or mc.locked_until<now()) order by mc.last_sync nulls first limit 4 for update of mc skip locked),
   locked as (update crm_private.mail_connections mc set lease=job_lease,locked_until=now()+interval '3 minutes' from chosen where mc.id=chosen.id returning mc.*)
   select jsonb_agg(jsonb_build_object('id',mc.id,'userId',mc.user_id,'email',mc.email,'login',mc.login,'cursors',mc.cursors,
     'lease',mc.lease,'password',v.decrypted_secret)) into result from locked mc join vault.decrypted_secrets v on v.id=mc.secret_id;
   return coalesce(result,'[]');
 elsif p_action='finish' then
   update crm_private.mail_connections set cursors=coalesce(p_data->'cursors',cursors),
     last_sync=case when p_data->>'error' is null then now() else last_sync end,last_error=left(p_data->>'error',200),locked_until=null,lease=null
     where id=(p_data->>'id')::uuid and lease=(p_data->>'lease')::uuid;
   return 'true';
 end if;
 raise exception 'invalid action';
end $$;
revoke all on function public.crm_mail_service(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.crm_mail_service(text,uuid,jsonb) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ begin
 if not exists(select 1 from vault.secrets where name='crm_mail_tick_key') then
   perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'crm_mail_tick_key','CRM mail scheduler authentication');
 end if;
end $$;
create or replace function crm_private.dispatch_mail() returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from crm_private.mail_connections where enabled) then return; end if;
 perform net.http_post(url:='https://ndndqrapznpqxbfgohfj.supabase.co/functions/v1/crm-mail-sync',
   headers:=jsonb_build_object('Content-Type','application/json','x-crm-tick',(select decrypted_secret from vault.decrypted_secrets where name='crm_mail_tick_key')),
   body:='{"action":"tick"}'::jsonb,timeout_milliseconds:=120000);
end $$;
revoke all on function crm_private.dispatch_mail() from public,anon,authenticated;
select cron.schedule('crm-mail-collect','*/30 * * * *','select crm_private.dispatch_mail()');
