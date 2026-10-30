begin;
do $$
declare actor uuid; response jsonb; work jsonb; first_job jsonb; second_job jsonb; secret_id_fixture uuid;
begin
 select user_id into actor from public.members where role='admin' limit 1;
 if exists(select 1 from crm_private.mail_connections where user_id=actor) then raise exception 'existing connection: skip fixture test'; end if;
 response:=public.crm_mail_service('connect',actor,'{"email":"synthetic@example.com","login":"synthetic","password":"synthetic-fixture-only"}');
 select secret_id into secret_id_fixture from crm_private.mail_connections where user_id=actor;
 if not exists(select 1 from vault.decrypted_secrets v where v.id=secret_id_fixture and v.decrypted_secret='synthetic-fixture-only' and v.secret<>'synthetic-fixture-only') then raise exception 'vault storage failed'; end if;
 response:=public.crm_mail_service('status',actor);
 if response ? 'password' or response ? 'secret_id' then raise exception 'credential exposed in status'; end if;
 work:=public.crm_mail_service('claim',actor);if jsonb_array_length(work)<>1 then raise exception 'claim failed'; end if;
 first_job:=work->0;
 second_job:=public.crm_mail_service('claim',actor);if jsonb_array_length(second_job)<>0 then raise exception 'lease failed'; end if;
 perform public.crm_mail_service('finish',null,jsonb_build_object('id',first_job->>'id','lease',first_job->>'lease','cursors','{}'::jsonb));
 perform public.crm_mail_service('disconnect',actor);
 if jsonb_array_length(public.crm_mail_service('claim',actor))<>0 then raise exception 'disconnect failed'; end if;
end $$;
rollback;
select jsonb_build_object('synthetic_connections_remaining',(select count(*) from crm_private.mail_connections where email='synthetic@example.com'),
 'new_intake_warning_functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'crm_%' and p.prosecdef and has_function_privilege('anon',p.oid,'execute'))) as verification;
