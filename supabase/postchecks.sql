-- Metadata and unauthenticated denial checks only. No student data is selected.
select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
 p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('hafs_teacher_day_counts','hafs_record_guarded');

select c.relname,c.relrowsecurity,
 has_table_privilege('anon',c.oid,'SELECT') as anon_select,
 has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select,
 has_table_privilege('authenticated',c.oid,'INSERT') as authenticated_insert
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='hafs_private' and c.relname='record_request_aliases';

-- Expected: both return SQLSTATE 42501 / NOT_AUTHORIZED without a real session.
-- Run separately when the SQL client stops on errors.
-- select public.hafs_teacher_day_counts('00000000-0000-4000-8000-000000000000',null);
-- select public.hafs_record_guarded('00000000-0000-4000-8000-000000000000',
--  '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',1,null,null);
