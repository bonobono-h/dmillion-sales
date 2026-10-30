begin;
do $$ begin
 if exists(select 1 from public.docs where path like '%__intake_test__%') then raise exception 'fixture collision'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select user_id from public.members where role='admin' limit 1),'role','authenticated')::text,true);
insert into public.docs(path,data) values('companies/__intake_test__','{"name":"가상 검증 업체","stage":"리드"}');
insert into public.crm_intake_sources(id,owner_id,source_key,source_type,title,body,occurred_at)
values('9f802baa-aeb6-4013-a96a-bd01e2864de5',auth.uid(),'__intake_test__','meeting','가상 검증 미팅','할 일: 검증 업무',now()-interval '1 minute');
set local role authenticated;
select public.crm_intake_approve('9f802baa-aeb6-4013-a96a-bd01e2864de5','__intake_test__',
 jsonb_build_object('title','가상 검증 미팅','summary','합성 자료 검증','date',now()-interval '1 minute','type','미팅'),
 '[{"title":"가상 검증 업무","dueAt":null}]');
select public.crm_intake_approve('9f802baa-aeb6-4013-a96a-bd01e2864de5','__intake_test__',
 jsonb_build_object('title','두 번째 호출','summary','중복 생성 금지','date',now()-interval '1 minute','type','미팅'),'[]');
do $$ begin
 if (select count(*) from public.docs where path like 'activities/intake-9f802baa%')<>1 then raise exception 'activity retry failed'; end if;
 if (select count(*) from public.docs where path like 'tasks/intake-9f802baa%')<>1 then raise exception 'task retry failed'; end if;
 if (select data->>'stage' from public.docs where path='companies/__intake_test__')<>'리드' then raise exception 'company stage changed'; end if;
 if (select status from public.crm_intake_sources where id='9f802baa-aeb6-4013-a96a-bd01e2864de5')<>'approved' then raise exception 'source not approved'; end if;
 if has_function_privilege('authenticated','public.crm_mail_service(text,uuid,jsonb)','execute') then raise exception 'mail secret function exposed'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"deadbeef-0000-4000-a000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.crm_intake_sources where id='9f802baa-aeb6-4013-a96a-bd01e2864de5') then raise exception 'source ownership policy failed'; end if;
end $$;
reset role;
rollback;
select jsonb_build_object('test_records_remaining',(select count(*) from public.docs where path like '%__intake_test__%' or path like '%intake-9f802baa%'),
 'source_records_remaining',(select count(*) from public.crm_intake_sources where source_key='__intake_test__'),
 'anon_can_read_sources',has_table_privilege('anon','public.crm_intake_sources','select'),
 'anon_can_read_mail_secret_rpc',has_function_privilege('anon','public.crm_mail_service(text,uuid,jsonb)','execute'),
 'authenticated_can_read_mail_secret_rpc',has_function_privilege('authenticated','public.crm_mail_service(text,uuid,jsonb)','execute'),
 'cron_enabled',(select active from cron.job where jobname='crm-mail-collect')) as verification;
