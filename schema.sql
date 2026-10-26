-- 디밀리언 영업 관리 · Supabase 설정
-- Supabase 대시보드 → SQL Editor → New query 에 이 파일 전체를 붙여 넣고 Run 한 번.
-- 여러 번 실행해도 안전하게 작성했습니다.

-- =========================================================
-- 1. 사람 명단 (로그인 계정 ↔ 이름·권한)
--    admin = 관리자 (모든 수정·삭제, 단가·원가, 목표, 사람 관리)
--    sales = 영업담당 (업체·미팅·과제 입력과 수정, 연락처 열람)
--    view  = 보기 전용 (연락처 가려짐)
--    pending = 승인 대기 (가입만 하고 아무것도 못 봄, 새 가입자의 기본값)
-- =========================================================
create table if not exists public.members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  login      text not null unique,
  name       text not null,
  role       text not null default 'pending' check (role in ('admin', 'sales', 'view', 'pending')),
  created_at timestamptz not null default now()
);
alter table public.members enable row level security;

-- 지금 로그인한 사람의 권한 (명단에 없으면 null)
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public
as $$ select role from public.members where user_id = auth.uid() $$;

-- 가입하면 명단에 '승인 대기'로 자동 추가 (이름은 가입할 때 쓴 이름)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.members (user_id, login, name, role)
  values (new.id, split_part(new.email, '@', 1),
          coalesce(nullif(left(trim(new.raw_user_meta_data ->> 'name'), 20), ''), split_part(new.email, '@', 1)),
          'pending')
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 이미 있던 계정도 명단에 채우기
insert into public.members (user_id, login, name, role)
select id, split_part(email, '@', 1), split_part(email, '@', 1), 'pending' from auth.users
on conflict (user_id) do nothing;

drop policy if exists "members read" on public.members;
create policy "members read" on public.members for select to authenticated
  using (user_id = auth.uid() or public.my_role() in ('admin', 'sales', 'view'));
drop policy if exists "members admin update" on public.members;
create policy "members admin update" on public.members for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- =========================================================
-- 2. 데이터 (업체·미팅·과제 등) — 경로별 JSON 문서
--    path 예: companies/h001, activities/h001-0, data/contacts/items/h001
-- =========================================================
create table if not exists public.docs (
  path       text primary key check (length(path) between 3 and 400 and path !~ '^/' and path ~ '/'),
  collection text generated always as (regexp_replace(path, '/[^/]+$', '')) stored,
  data       jsonb not null default '{}'::jsonb,
  version    bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists docs_collection_idx on public.docs (collection);
alter table public.docs enable row level security;
alter table public.docs replica identity full;

create or replace function public.docs_touch() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs
  for each row execute function public.docs_touch();

-- 읽기 권한: 단가·원가는 관리자만, 연락처·변경 기록은 관리자·영업담당만
create or replace function public.can_read(p text) returns boolean
language sql stable as $$
  select case
    when coalesce(public.my_role(), 'pending') = 'pending' then false
    when p like 'data/costs/%' then public.my_role() = 'admin'
    when p like 'data/contacts/%' or p like 'data/log/%' then public.my_role() in ('admin', 'sales')
    else true
  end $$;

-- 쓰기 권한: 단가·원가·목표·동기화 상태는 관리자만, 나머지는 관리자·영업담당
create or replace function public.can_write(p text) returns boolean
language sql stable as $$
  select case
    when coalesce(public.my_role(), 'pending') = 'pending' then false
    when p like 'data/costs/%' or p like 'targets/%' or p like 'sync/%' then public.my_role() = 'admin'
    else public.my_role() in ('admin', 'sales')
  end $$;

drop policy if exists "docs read" on public.docs;
create policy "docs read" on public.docs for select to authenticated using (public.can_read(path));
drop policy if exists "docs insert" on public.docs;
create policy "docs insert" on public.docs for insert to authenticated with check (public.can_write(path));
drop policy if exists "docs update" on public.docs;
create policy "docs update" on public.docs for update to authenticated
  using (public.can_write(path)) with check (public.can_write(path));
drop policy if exists "docs delete" on public.docs;
create policy "docs delete" on public.docs for delete to authenticated using (public.can_write(path));

-- 일부 필드만 고치기 (다른 사람이 동시에 다른 칸을 고쳐도 덮어쓰지 않도록 서버에서 합침)
create or replace function public.doc_merge(p_path text, p_patch jsonb, p_remove text[] default '{}')
returns table (path text, data jsonb, version bigint)
language plpgsql security invoker set search_path = public
as $$
#variable_conflict use_column
begin
  return query
    update public.docs d set data = (d.data || p_patch) - p_remove
    where d.path = p_path
    returning d.path, d.data, d.version;
  if not found then
    raise exception 'not-found: %', p_path using errcode = 'P0002';
  end if;
end $$;

revoke all on public.docs, public.members from anon;
grant select, insert, update, delete on public.docs to authenticated;
grant select, update on public.members to authenticated;
grant execute on function public.doc_merge(text, jsonb, text[]) to authenticated;
grant execute on function public.my_role(), public.can_read(text), public.can_write(text) to authenticated;

-- 실시간 반영 (다른 사람이 고치면 내 화면에도 바로)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'members') then
    alter publication supabase_realtime add table public.members;
  end if;
end $$;

-- =========================================================
-- 3. 파일함 (계약서·견적서·제안서 업로드)
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 20971520)
on conflict (id) do nothing;

drop policy if exists "files read" on storage.objects;
create policy "files read" on storage.objects for select to authenticated
  using (bucket_id = 'files' and public.my_role() in ('admin', 'sales', 'view'));
drop policy if exists "files upload" on storage.objects;
create policy "files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and public.my_role() in ('admin', 'sales'));
drop policy if exists "files delete" on storage.objects;
create policy "files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and public.my_role() in ('admin', 'sales'));

-- =========================================================
-- 4. 첫 관리자 지정 — 가입한 뒤 아래 'hryoon' 을 본인 아이디(메일 @ 앞부분)로 바꿔 이 줄만 실행하세요.
--    그다음부터 다른 사람 승인은 사이트의 권한·변경 기록 → 사람 관리에서 합니다.
-- =========================================================
-- update public.members set role = 'admin', name = '윤홍렬' where login = 'hryoon';
