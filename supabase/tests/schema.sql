-- Synthetic local test fixture. Never run this file on a connected project.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema hafs_private;
create table auth.users(id uuid primary key, deleted_at timestamptz, banned_until timestamptz, raw_app_meta_data jsonb default '{}');
create table auth.sessions(id uuid primary key, user_id uuid, not_after timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create table hafs_private.courses(id uuid primary key,name text not null,version bigint not null default 1,layout jsonb not null default '{"cols":1,"rows":1,"cells":[],"boardSide":"top"}',reference_rules jsonb);
create table hafs_private.students(id uuid primary key,course_id uuid not null references hafs_private.courses(id),number text not null,name text not null,active boolean not null default true,unique(course_id,id));
create table hafs_private.events(id uuid primary key,course_id uuid not null references hafs_private.courses(id),student_id uuid not null,actor uuid not null,at timestamptz not null default clock_timestamp(),cancelled_at timestamptz,foreign key(course_id,student_id) references hafs_private.students(course_id,id));
create index on hafs_private.events(course_id,student_id,at) where cancelled_at is null;
create index on hafs_private.events(course_id,at desc,id desc);
create table hafs_private.memberships(course_id uuid,user_id uuid,role text,expires_at timestamptz,primary key(course_id,user_id));
create table hafs_private.student_accounts(user_id uuid);
create table hafs_private.audit(id bigint generated always as identity primary key,course_id uuid not null,actor uuid not null,action text not null,details jsonb not null,at timestamptz not null default clock_timestamp());
-- require_role resolves this function, but teacher/admin-only RPCs cannot reach
-- its submitter branch. It is not used to authorize any test identity.
create function hafs_private.active_student_representative(uuid,uuid) returns boolean language sql as $$ select false $$;
-- Authoritative auth/session gate inspected on 2026-10-08.
create function hafs_private.require_active_auth_user(u uuid) returns void language plpgsql security definer set search_path='' as $$
declare session_id text := auth.jwt()->>'session_id';
begin
 if u is null or u is distinct from auth.uid()
    or not exists(select 1 from auth.users where id=u and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp())) then
  raise exception 'NOT_AUTHORIZED' using errcode='42501';
 end if;
 if session_id is null or session_id!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  raise exception 'NOT_AUTHORIZED' using errcode='42501';
 end if;
 if not exists(select 1 from auth.sessions where id=session_id::uuid and user_id=u and (not_after is null or not_after>clock_timestamp())) then
  raise exception 'NOT_AUTHORIZED' using errcode='42501';
 end if;
end $$;
grant usage on schema auth,public to authenticated;
grant execute on all functions in schema auth to authenticated;
