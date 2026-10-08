import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const course=id(1), otherCourse=id(2), teacher=id(10), teacher2=id(11), outsider=id(12), learner=id(13);
const student=id(20), otherStudent=id(21), inactive=id(22), session=id(30);
const rpc = async (name,args=[]) => (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0].result;
const guard = (request,day=null,count=null,version=1,target=student,scope=course) => rpc('hafs_record_guarded',[scope,id(request),target,version,day,count]);
const as = async (user=teacher,sess=session) => db.query(`select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claims',$2,false)`,[user,JSON.stringify({session_id:sess})]);
const nEvents = async () => Number((await db.query('select count(*) n from hafs_private.events')).rows[0].n);
const seed = async (n,{target=student,scope=course,at=null,cancelled=false,actor=teacher2}={}) => db.query(`insert into hafs_private.events(id,course_id,student_id,actor,at,cancelled_at) values($1,$2,$3,$4,coalesce($5::timestamptz,clock_timestamp()-interval '5 seconds'),case when $6 then clock_timestamp() end)`,[id(n),scope,target,actor,at,cancelled]);
let today;

before(async () => {
 await db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('./existing-functions.sql',import.meta.url),'utf8'));
 const migrationDir=new URL('../migrations/',import.meta.url);
 if(existsSync(migrationDir)) for(const file of readdirSync(migrationDir).filter(f=>f.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(file,migrationDir),'utf8'));
 await db.query(`insert into auth.users(id) values($1),($2),($3),($4)`,[teacher,teacher2,outsider,learner]);
 await db.query(`insert into hafs_private.courses(id,name) values($1,'Synthetic course'),($2,'Other synthetic course')`,[course,otherCourse]);
 await db.query(`insert into hafs_private.students(id,course_id,number,name,active) values($1,$2,'1','Synthetic A',true),($3,$4,'1','Synthetic B',true),($5,$2,'2','Synthetic inactive',false)`,[student,course,otherStudent,otherCourse,inactive]);
 today=(await db.query(`select (clock_timestamp() at time zone 'Asia/Seoul')::date::text as day`)).rows[0].day;
});
beforeEach(async()=>{
 await db.exec('reset role');
 const aliases=(await db.query(`select to_regclass('hafs_private.record_request_aliases') is not null present`)).rows[0].present;
 await db.exec(`truncate ${aliases?'hafs_private.record_request_aliases,':''}hafs_private.events,hafs_private.audit,hafs_private.memberships,hafs_private.student_accounts,auth.sessions; update auth.users set banned_until=null,deleted_at=null,raw_app_meta_data='{}'; update hafs_private.courses set version=1;`);
 await db.query(`insert into hafs_private.memberships values($1,$2,'teacher','infinity'),($1,$3,'admin','infinity'),($4,$2,'teacher','infinity'),($1,$5,'submitter','infinity')`,[course,teacher,teacher2,otherCourse,learner]);
 await db.query(`insert into auth.sessions(id,user_id) values($1,$2),($3,$4),($5,$6),($7,$8)`,[session,teacher,id(31),teacher2,id(32),outsider,id(33),learner]);
 await as();
});
after(async()=>db.close());

test('both new RPC contracts are installed',async()=>{
 const rows=(await db.query(`select to_regprocedure('public.hafs_record_guarded(uuid,uuid,uuid,bigint,date,bigint)') is not null guarded,to_regprocedure('public.hafs_teacher_day_counts(uuid,date)') is not null daily`)).rows[0];
 assert.equal(rows.guarded,true,'atomic daily record RPC must exist');
 assert.equal(rows.daily,true,'course-scoped daily counts RPC must exist');
});
test('selected day counts use full KST half-open range, exclude undo, and stay course scoped',async()=>{
 for(let n=0;n<105;n++) await seed(1000+n,{at:'2026-10-06T15:00:00Z'});
 await seed(1200,{at:'2026-10-06T14:59:59.999999Z'});
 await seed(1201,{at:'2026-10-07T14:59:59.999999Z'});
 await seed(1202,{at:'2026-10-07T15:00:00Z'});
 await seed(1203,{at:'2026-10-07T01:00:00Z',cancelled:true});
 await seed(1204,{at:'2026-10-07T01:00:00Z',scope:otherCourse,target:otherStudent});
 const r=await rpc('hafs_teacher_day_counts',[course,'2026-10-07']);
 assert.equal(r.day,'2026-10-07'); assert.equal(r.today,today); assert.equal(r.timezone,'Asia/Seoul');
 assert.equal(r.counts.length,1);assert.equal(r.counts[0].student_id,student);assert.equal(r.counts[0].count,106);
 assert.equal(Date.parse(r.counts[0].last_at),Date.parse('2026-10-07T14:59:59.999999Z'));
 assert.equal(r.snapshot.id,course);assert.equal(r.snapshot.version,1);assert.equal(r.snapshot.students[0].count,108);assert.equal(r.snapshot.events.length,100);
 assert.deepEqual((await rpc('hafs_teacher_day_counts',[course,'2026-09-01'])).counts,[]);
 assert.equal((await rpc('hafs_teacher_day_counts',[course,null])).day,today);
 await assert.rejects(()=>rpc('hafs_teacher_day_counts',[course,'infinity']),/INVALID_DAY/);
});
test('first/second are counted, third requires exact confirmation, cancel writes nothing',async()=>{
 let r=await guard(2000); assert.equal(r.status,'recorded'); assert.equal(r.count,1); assert.equal(r.event_id,id(2000));assert.equal(r.inserted,true);assert.equal(r.replayed,false);assert.equal(r.deduplicated,false);
 // Age the synthetic first event instead of sleeping through the debounce.
 await db.exec(`update hafs_private.events set at=at-interval '2 seconds'`);
 r=await guard(2001); assert.equal(r.status,'recorded'); assert.equal(r.count,2);
 await db.exec(`update hafs_private.events set at=at-interval '2 seconds'`);
 r=await guard(2002); assert.deepEqual(r,{status:'confirmation_required',day:today,count:2});
 assert.equal(await nEvents(),2); assert.equal(Number((await db.query('select count(*) n from hafs_private.audit')).rows[0].n),2);
 assert.equal(Number((await db.query('select count(*) n from hafs_private.record_request_aliases')).rows[0].n),2);
 // Cancel is deliberately no follow-up RPC; no guard challenge writes anything.
 r=await guard(2002,today,2); assert.equal(r.status,'recorded');assert.equal(r.count,3);assert.equal(r.event_id,id(2002));
 assert.equal(await nEvents(),3);
});
test('stale count/day confirmations require fresh confirmation without writing',async()=>{
 await seed(2100);await seed(2101);
 assert.equal((await guard(2102,today,1)).status,'confirmation_required');
 assert.equal((await guard(2102,'2000-01-01',2)).status,'confirmation_required');
 assert.equal((await guard(2102,today,null)).status,'confirmation_required');
 assert.equal(await nEvents(),2);
 await seed(2103);
 let r=await guard(2102,today,2);assert.equal(r.status,'confirmation_required');assert.equal(r.count,3);
 r=await guard(2102,today,3);assert.equal(r.status,'recorded');assert.equal(r.count,4);
});
test('confirmation context is rechecked even after undo lowers count below threshold',async()=>{
 await seed(2200);
 const r=await guard(2201,today,2);assert.equal(r.status,'confirmation_required');assert.equal(r.count,1);assert.equal(await nEvents(),1);
 assert.equal((await guard(2201,today,1)).count,2);
});
test('same request replays before threshold/version checks and returns actual undo identity',async()=>{
 await seed(2300);await seed(2301);
 const r=await guard(2302,today,2);assert.equal(r.count,3);
 const replay=await guard(2302,null,null,999);assert.equal(replay.status,'recorded');assert.equal(replay.event_id,id(2302));assert.equal(await nEvents(),3);assert.equal(replay.inserted,false);assert.equal(replay.replayed,true);assert.equal(replay.deduplicated,false);
 assert.equal(await rpc('hafs_undo',[course,replay.event_id]),true);
 assert.equal((await guard(2302)).count,2);assert.equal(await nEvents(),3);
 assert.equal((await rpc('hafs_teacher_day_counts',[course,today])).counts[0].count,2);
});
test('rapid repeat returns existing event rather than wrong request id or an extra prompt',async()=>{
 const first=await guard(2400);const duplicate=await guard(2401);
 assert.equal(duplicate.status,'recorded');assert.equal(duplicate.event_id,first.event_id);assert.equal(duplicate.count,1);assert.equal(await nEvents(),1);assert.equal(duplicate.inserted,false);assert.equal(duplicate.deduplicated,true);assert.equal(duplicate.replayed,false);
});
test('lost debounce response can be retried after debounce expiry without another event',async()=>{
 const first=await guard(2450);const duplicate=await guard(2451);
 assert.equal(duplicate.event_id,first.event_id);
 await db.exec(`update hafs_private.events set at=at-interval '5 seconds'`);
 const retried=await guard(2451);assert.equal(retried.event_id,first.event_id);assert.equal(retried.count,1);assert.equal(retried.inserted,false);assert.equal(retried.replayed,true);assert.equal(await nEvents(),1);
 await rpc('hafs_undo',[course,first.event_id]);
 assert.equal((await guard(2451)).count,0);assert.equal(await nEvents(),1);
 await as(teacher2,id(31));await assert.rejects(()=>guard(2451),/IDEMPOTENCY_CONFLICT/);
});
test('request IDs cannot be replayed by another actor, course, or student',async()=>{
 await guard(2500);
 await assert.rejects(()=>guard(2500,null,null,1,otherStudent,otherCourse),/IDEMPOTENCY_CONFLICT/);
 await assert.rejects(()=>guard(2500,null,null,1,inactive),/IDEMPOTENCY_CONFLICT/);
 await as(teacher2,id(31));await assert.rejects(()=>guard(2500),/IDEMPOTENCY_CONFLICT/);
});
test('version, active student, null request, and wrong-course checks fail before writes',async()=>{
 await assert.rejects(()=>guard(2600,null,null,0),/STALE_VERSION/);
 await assert.rejects(()=>guard(2600,null,null,null),/STALE_VERSION/);
 await assert.rejects(()=>guard(2600,null,null,1,inactive),/UNKNOWN_STUDENT/);
 await assert.rejects(()=>guard(2600,null,null,1,otherStudent),/UNKNOWN_STUDENT/);
 await assert.rejects(()=>rpc('hafs_record_guarded',[course,null,student,1,null,null]),/INVALID_REQUEST/);
 assert.equal(await nEvents(),0);
});
test('authorization rejects outsiders, student identities, expired memberships, revoked sessions, and banned users',async()=>{
 for(const user of [outsider,learner]) {
  await as(user,user===outsider?id(32):id(33));
  await assert.rejects(()=>guard(2700),/NOT_AUTHORIZED/);await assert.rejects(()=>rpc('hafs_teacher_day_counts',[course,today]),/NOT_AUTHORIZED/);
 }
 await as();await db.query(`update hafs_private.memberships set expires_at=clock_timestamp()-interval '1 second' where user_id=$1`,[teacher]);
 await assert.rejects(()=>guard(2700),/NOT_AUTHORIZED/);
 await db.query(`update hafs_private.memberships set expires_at='infinity' where user_id=$1;`,[teacher]);
 await db.query(`insert into hafs_private.student_accounts values($1)`,[teacher]);await assert.rejects(()=>guard(2700),/NOT_AUTHORIZED/);await db.exec('truncate hafs_private.student_accounts');
 await db.query(`update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id=$1`,[teacher]);await assert.rejects(()=>guard(2700),/NOT_AUTHORIZED/);
 await db.query(`update auth.users set banned_until=null where id=$1`,[teacher]);await db.query('delete from auth.sessions where id=$1',[session]);await assert.rejects(()=>guard(2700),/NOT_AUTHORIZED/);
 assert.equal(await nEvents(),0);
});
test('authenticated RPCs work but anonymous execute is denied and private tables stay private',async()=>{
 await db.exec('set role authenticated');
 assert.equal((await guard(2800)).status,'recorded');assert.equal((await rpc('hafs_teacher_day_counts',[course,today])).counts[0].count,1);
 await assert.rejects(()=>db.query('select * from hafs_private.events'),/permission denied/);
 await assert.rejects(()=>db.query('select * from hafs_private.record_request_aliases'),/permission denied/);
 await db.exec('reset role;set role anon');
 await assert.rejects(()=>guard(2801),/permission denied/);await assert.rejects(()=>rpc('hafs_teacher_day_counts',[course,today]),/permission denied/);
});
