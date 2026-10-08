# Classroom daily-record RPCs

Incremental migration for the existing `mchisnymlincoejkxmxm` project. It depends
on the existing private courses, students, events, audit, role/session checks,
and `hafs_teacher_snapshot`. It is not a clean-project schema bootstrap.

Applied on 2026-10-08 as migration version `20261008005624`. The local filename
matches the version returned by the hosted migration history. See
`deployment-verification.json` for the read-only post-deployment checks.

## Client contract

`hafs_teacher_day_counts({p_course, p_day})` returns:

- `day`, `today`: ISO calendar dates in `Asia/Seoul`; null/omitted `p_day` means today
- `timezone`: `Asia/Seoul`
- `counts`: `{student_id, count, last_at}` for students with uncancelled events on
  that date; missing entries mean zero
- `snapshot`: the unchanged `hafs_teacher_snapshot` response, including cumulative
  counts, roster, layout, rules, version, and its latest 100 events

The new daily aggregate reads the full date range, not the latest 100 events.
A shared course lock keeps it coherent with `snapshot`. Use this one RPC for a
course refresh instead of independently fetching daily/cumulative responses.
Dates outside today are read-only in the UI; no writer accepts an event date.

`hafs_record_guarded({p_course, p_request, p_student, p_version,
p_confirmed_day: null, p_confirmed_count: null})` returns one of:

- `{status: "confirmation_required", day, count}`: no event, alias, or audit row
  was written. Cancelling means make no further call.
- `{status: "recorded", event_id, day, count, inserted, replayed, deduplicated}`:
  use the actual `event_id` for undo and refresh the course. Show +1 only when
  `inserted` is true. An exact retry has `replayed=true`; a first rapid repeat
  suppressed by the existing 700ms debounce has `deduplicated=true`.

After the user confirms, repeat the same `p_request` and other inputs with the
exact returned `day` and `count`. A changed day/count asks again, including when
an undo reduced the count below two. Do not treat every HTTP 200 as an insertion.
Confirmed third and later events retain the true count, without a cap at two.

## Atomicity and security

The guard takes the same course `FOR UPDATE` lock as the existing recorder,
undo, and roster/layout writers, then rechecks authorization. The timestamp is
captured after lock acquisition and the same server timestamp determines both
the guarded KST date and inserted event. Existing idempotency binding to
course/student/actor, version checks, active student checks, server timestamps,
audit actions, and soft undo remain in force.

Successful guarded request IDs are persisted in the new private
`record_request_aliases` table. This also makes a debounced request retry-safe
after its debounce window expires. Aliases never resurrect cancelled events.
The table has RLS enabled, no client grants or policies, and references only an
existing event. Both new RPCs use a fixed empty search path and the existing
auth/session/course-role helper; anonymous execution is revoked.

The old `hafs_record` is unchanged so existing clients continue to work. Its
historical daily-confirmation and debounce-retry limitations remain for those
old clients; the updated client exclusively uses `hafs_record_guarded`.

## Verification

Run `npm ci && npm test` in this directory. All fixtures are synthetic and run
in a local in-memory PGlite database. The schema and authoritative existing RPC
definitions are test fixtures, never migration inputs for the live project.

Tests cover KST half-open boundaries, a day with over 100 events, coherent daily
and cumulative payloads, last timestamps, uncancelled counts, first/second/extra
records, stale confirmations, cancel with no writes, version/active checks,
request binding/replay, debounce aliases and delayed lost-response retry, undo,
course isolation, student/outsider/session/ban denial, and function/table grants.

PGlite does not exercise independent concurrent sessions. A PostgreSQL 17.11
synthetic fixture was initialized separately, but the execution environment
blocked Unix socket creation; the escalation launcher also failed. Concurrency
assurance therefore combines executed sequential stale-context tests with
reviewed shared/exclusive course locking, not a claimed parallel-session test.

Before deployment, inspect the existing event mutation functions and confirm
they still take the same course lock. After deployment, use `postchecks.sql`
and the Supabase security advisor. Expected advisor findings are private tables
with RLS and no policies, plus the intentionally authenticated-only SECURITY
DEFINER endpoints. No authentication settings are changed by this migration.

## Deployment and rollback

Apply this migration once through the project's existing migration workflow,
then deploy the client that calls it. Both old and new clients can coexist.
For a client rollback, leave the additive RPCs and alias table in place: the
old client ignores them. Do not drop the alias table, as that would discard
durable request identities. The migration does not alter or delete any existing
student, event, membership, account, or configuration row.

Documentation checked on 2026-10-08:
- https://supabase.com/changelog.md
- https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/database/postgres/row-level-security
