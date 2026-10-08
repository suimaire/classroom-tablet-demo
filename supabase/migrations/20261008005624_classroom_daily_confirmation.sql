-- Additive teacher classroom RPCs. Existing hafs_record and hafs_undo are
-- deliberately unchanged for older clients. No historical timestamps can be
-- supplied to the new writer. Existing role/session checks remain authoritative.

-- A debounced request needs its own durable identity: otherwise a lost response
-- retried after 700ms would become a second event. This table is private, and
-- refers only to existing events. No challenges/cancellations are stored here.
create table if not exists hafs_private.record_request_aliases (
 request_id uuid primary key,
 event_id uuid not null references hafs_private.events(id),
 created_at timestamptz not null default clock_timestamp()
);
alter table hafs_private.record_request_aliases enable row level security;
revoke all on table hafs_private.record_request_aliases from public,anon,authenticated;
create index if not exists hafs_record_request_aliases_event_idx
 on hafs_private.record_request_aliases(event_id);

create or replace function public.hafs_teacher_day_counts(
 p_course uuid,
 p_day date default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
 v_today date;
 v_day date;
 v_from timestamptz;
 v_until timestamptz;
 v_counts jsonb;
 v_snapshot jsonb;
begin
 perform hafs_private.require_role(p_course,array['teacher','admin']);
 -- Existing record/undo/layout writers use FOR UPDATE on this same row.
 -- Keep the daily and cumulative views coherent, including roster/version.
 perform 1 from hafs_private.courses where id=p_course for share;
 perform hafs_private.require_role(p_course,array['teacher','admin']);
 v_today := (clock_timestamp() at time zone 'Asia/Seoul')::date;
 v_day := coalesce(p_day,v_today);
 if not isfinite(v_day) then raise exception 'INVALID_DAY'; end if;
 v_from := v_day::timestamp at time zone 'Asia/Seoul';
 v_until := (v_day+1)::timestamp at time zone 'Asia/Seoul';
 select coalesce(jsonb_agg(jsonb_build_object('student_id',t.student_id,'count',t.n,'last_at',t.last_at) order by t.student_id),'[]'::jsonb)
 into v_counts
 from (
  select e.student_id,count(*) n,max(e.at) last_at
  from hafs_private.events e
  where e.course_id=p_course and e.cancelled_at is null
   and e.at>=v_from and e.at<v_until
  group by e.student_id
 ) t;
 v_snapshot := public.hafs_teacher_snapshot(p_course);
 return jsonb_build_object('day',v_day,'today',v_today,'timezone','Asia/Seoul','counts',v_counts,'snapshot',v_snapshot);
end;
$$;

create or replace function public.hafs_record_guarded(
 p_course uuid,
 p_request uuid,
 p_student uuid,
 p_version bigint,
 p_confirmed_day date default null,
 p_confirmed_count bigint default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
 u uuid;
 v bigint;
 old hafs_private.events;
 v_at timestamptz;
 v_day date;
 v_from timestamptz;
 v_until timestamptz;
 v_count bigint;
 v_inserted boolean := false;
 v_replayed boolean := false;
 v_deduplicated boolean := false;
begin
 u := hafs_private.require_role(p_course,array['teacher','admin']);
 -- Share the existing record/undo/layout lock. Count, confirmation and insert
 -- are serialized with every current event mutator for this course.
 select version into v from hafs_private.courses where id=p_course for update;
 perform hafs_private.require_role(p_course,array['teacher','admin']);
 if p_request is null then raise exception 'INVALID_REQUEST'; end if;

 select e.* into old
 from hafs_private.record_request_aliases a join hafs_private.events e on e.id=a.event_id
 where a.request_id=p_request;
 if not found then select * into old from hafs_private.events where id=p_request; end if;
 if found then
  if old.course_id<>p_course or old.student_id<>p_student or old.actor<>u then
   raise exception 'IDEMPOTENCY_CONFLICT';
  end if;
  -- Exactly as hafs_record: a replay is safe even after a version change,
  -- student deactivation, or undo. Never resurrect a cancelled event.
  v_replayed := true;
 else
  if p_version is null or v<>p_version then raise exception 'STALE_VERSION'; end if;
  if not exists(select 1 from hafs_private.students where id=p_student and course_id=p_course and active) then
   raise exception 'UNKNOWN_STUDENT';
  end if;
  -- One server instant supplies both the guarded KST day and inserted time.
  -- Capturing it after the course lock handles requests waiting over midnight.
  v_at := clock_timestamp();
  select * into old from hafs_private.events
  where course_id=p_course and actor=u and student_id=p_student
   and at>v_at-interval '700 milliseconds' and cancelled_at is null
  order by at desc,id desc limit 1;
  if not found then
   v_day := (v_at at time zone 'Asia/Seoul')::date;
   v_from := v_day::timestamp at time zone 'Asia/Seoul';
   v_until := (v_day+1)::timestamp at time zone 'Asia/Seoul';
   select count(*) into v_count from hafs_private.events
   where course_id=p_course and student_id=p_student and cancelled_at is null
    and at>=v_from and at<v_until;

   -- Supplied confirmation is valid only for the exact observed day/count.
   -- Changed context always asks again, even when undo lowered the count.
   if ((p_confirmed_day is not null or p_confirmed_count is not null)
       and (p_confirmed_day is distinct from v_day or p_confirmed_count is distinct from v_count))
      or (v_count>=2 and (p_confirmed_day is null or p_confirmed_count is null)) then
    return jsonb_build_object('status','confirmation_required','day',v_day,'count',v_count);
   end if;
   insert into hafs_private.events(id,course_id,student_id,actor,at)
   values(p_request,p_course,p_student,u,v_at) returning * into old;
   v_inserted := true;
   insert into hafs_private.audit(course_id,actor,action,details)
   values(p_course,u,'participation_recorded',jsonb_build_object('event',p_request));
  else
   v_deduplicated := true;
  end if;
  insert into hafs_private.record_request_aliases(request_id,event_id) values(p_request,old.id);
 end if;

 -- The actual event may be a replay or the existing 700ms debounce result.
 -- Return that ID for undo and recompute its uncancelled daily count.
 v_day := (old.at at time zone 'Asia/Seoul')::date;
 v_from := v_day::timestamp at time zone 'Asia/Seoul';
 v_until := (v_day+1)::timestamp at time zone 'Asia/Seoul';
 select count(*) into v_count from hafs_private.events
 where course_id=p_course and student_id=p_student and cancelled_at is null
  and at>=v_from and at<v_until;
 return jsonb_build_object('status','recorded','event_id',old.id,'day',v_day,'count',v_count,
  'inserted',v_inserted,'replayed',v_replayed,'deduplicated',v_deduplicated);
end;
$$;

-- SECURITY DEFINER is necessary for the same deliberately private tables as
-- the existing RPCs. No table access, role membership or auth access is granted.
revoke all on function public.hafs_teacher_day_counts(uuid,date) from public,anon;
revoke all on function public.hafs_record_guarded(uuid,uuid,uuid,bigint,date,bigint) from public,anon;
grant execute on function public.hafs_teacher_day_counts(uuid,date) to authenticated;
grant execute on function public.hafs_record_guarded(uuid,uuid,uuid,bigint,date,bigint) to authenticated;
