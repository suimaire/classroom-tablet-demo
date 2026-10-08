-- Authoritative definition inspected on 2026-10-08; no user data.
CREATE OR REPLACE FUNCTION public.hafs_record(p_course uuid, p_request uuid, p_student uuid, p_version bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; v bigint; old hafs_private.events; recent uuid;
begin
 u:=hafs_private.require_role(p_course,array['teacher','admin']);
 select version into v from hafs_private.courses where id=p_course for update;
 perform hafs_private.require_role(p_course,array['teacher','admin']);
 select * into old from hafs_private.events where id=p_request;
 if found then if old.course_id<>p_course or old.student_id<>p_student or old.actor<>u then raise exception 'IDEMPOTENCY_CONFLICT'; end if;return old.id;end if;
 if p_version is null or v<>p_version then raise exception 'STALE_VERSION'; end if;
 if not exists(select 1 from hafs_private.students where id=p_student and course_id=p_course and active) then raise exception 'UNKNOWN_STUDENT';end if;
 select id into recent from hafs_private.events where course_id=p_course and actor=u and student_id=p_student and at>clock_timestamp()-interval '700 milliseconds' and cancelled_at is null order by at desc limit 1;
 if recent is not null then return recent;end if;
 insert into hafs_private.events(id,course_id,student_id,actor) values(p_request,p_course,p_student,u);
 insert into hafs_private.audit(course_id,actor,action,details) values(p_course,u,'participation_recorded',jsonb_build_object('event',p_request));
 return p_request;
end $function$
;
-- Authoritative definition inspected on 2026-10-08; no user data.
CREATE OR REPLACE FUNCTION public.hafs_undo(p_course uuid, p_event uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; changed boolean;
begin
 u:=hafs_private.require_role(p_course,array['teacher','admin']);
 perform 1 from hafs_private.courses where id=p_course for update;
 perform hafs_private.require_role(p_course,array['teacher','admin']);
 update hafs_private.events set cancelled_at=clock_timestamp() where id=p_event and course_id=p_course and cancelled_at is null;
 changed:=found;
 if changed then insert into hafs_private.audit(course_id,actor,action,details) values(p_course,u,'participation_cancelled',jsonb_build_object('event',p_event));end if;
 return changed;
end $function$
;
-- Authoritative definition inspected on 2026-10-08; no user data.
CREATE OR REPLACE FUNCTION hafs_private.require_role(c uuid, roles text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid();r text;
begin
 perform hafs_private.require_active_auth_user(u);
 select role into r from hafs_private.memberships where course_id=c and user_id=u and role=any(roles) and expires_at>clock_timestamp();
 if r is null or (r='submitter' and not hafs_private.active_student_representative(c,u))
  or (r<>'submitter' and (exists(select 1 from hafs_private.student_accounts where user_id=u)
   or exists(select 1 from auth.users where id=u and raw_app_meta_data->>'hafs_student_namespace'='mchisnymlincoejkxmxm'))) then
  raise exception 'NOT_AUTHORIZED' using errcode='42501';
 end if;
 return u;
end $function$
;
CREATE OR REPLACE FUNCTION public.hafs_teacher_snapshot(p_course uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 perform hafs_private.require_role(p_course,array['teacher','admin']);
 select jsonb_build_object('id',c.id,'name',c.name,'version',c.version,'layout',c.layout,'rules',c.reference_rules,
  'students',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'number',s.number,'name',s.name,
   'count',coalesce(t.n,0),'lastAt',t.last_at,
   'referenceScore',(select (r->>'score')::numeric from jsonb_array_elements(c.reference_rules) r
    where coalesce(t.n,0)>=(r->>'min')::integer order by (r->>'min')::integer desc limit 1))
   order by s.number,s.id),'[]'::jsonb)
   from hafs_private.students s left join
    (select student_id,count(*) n,max(at) last_at from hafs_private.events where course_id=p_course and cancelled_at is null group by student_id) t
    on t.student_id=s.id where s.course_id=c.id and s.active),
  'events',(select coalesce(jsonb_agg(t order by t.at desc,t.id desc),'[]'::jsonb) from
   (select e.id,e.student_id,e.at,e.cancelled_at,s.number,s.name,s.active
    from hafs_private.events e join hafs_private.students s on s.course_id=e.course_id and s.id=e.student_id
    where e.course_id=c.id order by e.at desc,e.id desc limit 100)t))
 into result from hafs_private.courses c where c.id=p_course;
 return result;
end $function$
;
