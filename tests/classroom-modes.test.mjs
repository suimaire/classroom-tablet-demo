import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const modulePath=new URL('../admin/participation.js',import.meta.url);
let model={};try{model=await import(modulePath);}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}

test('daily display is separate from cumulative totals and missing day means unknown, not zero',()=>{
 assert.equal(typeof model.displayParticipation,'function');
 const student={id:'synthetic-a',count:47,lastAt:'2026-10-01T03:00:00Z',referenceScore:9};
 const original=structuredClone(student),daily={day:'2026-10-08',counts:[{student_id:'synthetic-b',count:2}]};
 assert.equal(model.displayParticipation(student,'daily',daily).count,0);
 assert.equal(model.displayParticipation(student,'cumulative',daily).count,47);
 assert.equal(model.displayParticipation(student,'daily',null).count,null);
 assert.deepEqual(student,original);
});
test('daily lastAt comes from selected day and cumulative scores remain cumulative',()=>{
 assert.equal(typeof model.displayParticipation,'function');
 const result=model.displayParticipation({id:'a',count:40,lastAt:'later',referenceScore:7},'daily',{counts:[{student_id:'a',count:2,last_at:'day-time'}]});
 assert.equal(result.count,2);assert.equal(result.lastAt,'day-time');assert.equal(result.referenceScore,7);
});
test('KST day changes at 15:00 UTC independent of device zone',()=>{
 assert.equal(typeof model.kstDay,'function');
 assert.equal(model.kstDay('2026-10-07T14:59:59Z'),'2026-10-07');
 assert.equal(model.kstDay('2026-10-07T15:00:00Z'),'2026-10-08');
});
test('confirmation reports exact count and date',()=>{
 assert.equal(typeof model.extraRecordMessage,'function');
 assert.equal(model.extraRecordMessage({day:'2026-10-08',count:2},'2026-10-08'),'오늘 2회 발표했습니다. 추가로 더 기록할까요?');
 assert.equal(model.extraRecordMessage({day:'2026-10-08',count:3},'2026-10-08'),'오늘 3회 발표했습니다. 추가로 더 기록할까요?');
 assert.match(model.extraRecordMessage({day:'2026-10-07',count:2},'2026-10-08'),/2026-10-07.*2회/);
});
const app=()=>readFileSync(new URL('../admin/app.js',import.meta.url),'utf8');
test('teacher and admin have no redundant visible refresh button',()=>assert.doesNotMatch(app(),/>새로고침<\/button>/));
test('record descriptions are plain language and disclose all-time inactive CSV scope',()=>{
 assert.doesNotMatch(app(),/목록을 갱신하려면 전체 기록 조회|날짜 검색은 서버에서 전체 기록|CSV는 날짜 필터와 관계없이/);
 assert.match(app(),/날짜 선택과 관계없이/);assert.match(app(),/비활성 학생/);
});
test('date filters have a dedicated responsive class',()=>assert.match(app(),/class="flex-form history-filters"/));
test('student history backdrop is explicitly wired, not generic destructive-dialog dismissal',()=>{
 assert.match(app(),/wireStudentHistoryDismissal\(dialog,/);
});

function fakeDialog(){const handlers=new Map();return {handlers,open:true,addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,new Set());handlers.get(type).add(fn);},removeEventListener(type,fn){handlers.get(type)?.delete(fn);},getBoundingClientRect(){return {left:100,right:300,top:100,bottom:300};},emit(type,props={}){let prevented=false;for(const fn of handlers.get(type)??[])fn({target:this,clientX:50,clientY:50,preventDefault(){prevented=true;},...props});return prevented;}};}
test('student dialog closes only on outside gesture or Escape and cleans listeners',()=>{
 assert.equal(typeof model.wireStudentHistoryDismissal,'function');
 const dialog=fakeDialog();let closed=0,locked=false;
 const cleanup=model.wireStudentHistoryDismissal(dialog,()=>closed++,()=>locked);
 dialog.emit('pointerdown',{clientX:150,clientY:150});dialog.emit('click',{clientX:150,clientY:150});assert.equal(closed,0);
 dialog.emit('pointerdown');dialog.emit('click',{clientX:150,clientY:150});assert.equal(closed,0);
 dialog.emit('pointerdown');dialog.emit('click');assert.equal(closed,1);
 locked=true;dialog.emit('pointerdown');dialog.emit('click');assert.equal(dialog.emit('cancel'),true);assert.equal(closed,1);
 locked=false;assert.equal(dialog.emit('cancel'),true);assert.equal(closed,2);
 cleanup();dialog.emit('cancel');assert.equal(closed,2);
});

function runRecord(results,{confirm=true,refreshError=false}={}){
 const text=app(),start=text.indexOf('async function completeRecord('),end=text.indexOf('// Saved-record feedback:',start),calls=[],messages=[];
 const context={animations:0,pendingRecord:{p_course:'course-a',p_request:'request-a',p_student:'student-a',p_version:4},generation:1,api:{access:'synthetic',rpc:async(name,args)=>{calls.push({name,args:structuredClone(args)});const result=results.shift();if(result instanceof Error){if(result.status===401)context.api.access='';throw result;}return result;}},snapshot:{events:[]},historyData:{events:[]},dayData:{},extraRecordMessage:model.extraRecordMessage,kstDay:()=> '2026-10-08',window:{confirm:message=>{messages.push(message);return confirm;}},refresh:async()=>{if(refreshError)throw Error('network');},signout(){context.signedOut=true;},render(){},celebrateRecord(){context.animations++;},recordNotice(){},notice(){},Date};
 vm.createContext(context);vm.runInContext(text.slice(start,end),context);
 return context.completeRecord().then(()=>({calls,messages,context}),error=>({calls,messages,context,error}));
}
test('third record asks first; cancellation sends no second write',async()=>{
 const r=await runRecord([{status:'confirmation_required',day:'2026-10-08',count:2}],{confirm:false});
 assert.equal(r.calls[0].name,'hafs_record_guarded');assert.equal(r.calls.length,1);assert.equal(r.messages.length,1);assert.equal(r.context.pendingRecord,null);
});
test('approved extra record repeats same request with observed day and count',async()=>{
 const r=await runRecord([{status:'confirmation_required',day:'2026-10-08',count:2},{status:'recorded',day:'2026-10-08',event_id:'event-a',count:3}]);
 assert.equal(r.calls.length,2);assert.equal(r.calls[1].args.p_request,'request-a');assert.equal(r.calls[1].args.p_confirmed_day,'2026-10-08');assert.equal(r.calls[1].args.p_confirmed_count,2);assert.equal(r.context.pendingRecord,null);
});
test('uncertain guarded save retains the exact request and confirmation for retry',async()=>{
 const r=await runRecord([{status:'confirmation_required',day:'2026-10-08',count:2},Error('network')]);
 assert.equal(r.calls.length,2);assert.equal(r.context.pendingRecord.p_request,'request-a');assert.equal(r.context.pendingRecord.p_confirmed_count,2);assert.match(r.error.message,/network/);
});
test('successful save followed by failed refresh does not leave a replayable new record',async()=>{
 const r=await runRecord([{status:'recorded',day:'2026-10-08',event_id:'event-a',count:1}],{refreshError:true});assert.equal(r.context.pendingRecord,null);assert.equal(r.calls.length,1);
});

function classroomContext(){
 const text=app(),calls=[],state={content:{innerHTML:''}},students=[{id:'a',number:'001',name:'합성가',count:40},{id:'b',number:'002',name:'합성나',count:20}];
 const context={snapshot:{students,layout:{rows:1,cols:2,boardSide:'bottom',cells:students.map((s,i)=>({row:1,col:i+1,kind:'desk',studentId:s.id}))}},course:{id:'course',name:'합성 학급'},countMode:'daily',selectedDay:'2026-10-08',dayData:{day:'2026-10-08',today:'2026-10-08',counts:[{student_id:'a',count:2}]},kstDay:()=> '2026-10-08',displayParticipation:model.displayParticipation,seatingStatus:()=>({ready:true}),admin:()=>false,h:String,date:String,image:()=>'<span class="portrait"></span>',q:selector=>state[selector]??(selector==='#content'?state.content:{}),document:{querySelectorAll:()=>[]},participationControls:()=>'<div class="participation-controls"></div>',bindParticipationControls(){},applyTodayBadges(){},watchTeacherSeatFit(){},act:fn=>fn(),calls};
 vm.createContext(context);const start=text.indexOf('function classView('),end=text.indexOf('async function completeRecord(',start);vm.runInContext(text.slice(start,end),context);return {context,state};
}
test('actual seating renderer shows selected-day zero without altering cumulative snapshot',()=>{
 const {context,state}=classroomContext();context.classView();assert.match(state.content.innerHTML,/>0회</);assert.match(state.content.innerHTML,/>2회</);assert.doesNotMatch(state.content.innerHTML,/>40회</);assert.equal(context.snapshot.students[0].count,40);
 context.countMode='cumulative';context.classView();assert.match(state.content.innerHTML,/>40회</);
});
test('actual historical seating renderer disables only record actions and keeps history available',()=>{
 const {context,state}=classroomContext();context.selectedDay='2026-10-07';context.classView();assert.match(state.content.innerHTML,/data-record="a" disabled/);assert.match(state.content.innerHTML,/data-student-history="a"/);
});

function historyContext(pages){
 const text=app(),context={generation:1,course:{id:'course'},historyEpoch:0,historyData:{from:'2026-10-01',to:'2026-10-08',bounds:{p_from:'from',p_until:'to'},events:Array.from({length:150},(_,i)=>({id:'old-'+i})),next:{at:'next',id:'next'}},historyFrom:'2026-10-01',historyTo:'2026-10-08',historyBounds:()=>({p_from:'from',p_until:'to'}),api:{rpc:async()=>pages.shift()},tab:'history',historyView(){}};
 vm.createContext(context);vm.runInContext(text.slice(text.indexOf('async function loadHistory('),text.indexOf('function historyView(')),context);return context;
}
test('automatic history refresh preserves loaded depth and replaced cancelled state',async()=>{
 const pages=[{events:Array.from({length:100},(_,i)=>({id:'new-'+i,cancelled_at:i===0?'yes':null})),next:{at:'x',id:'x'}},{events:[{id:'new-100'}],next:null}];
 const c=historyContext(pages);await c.loadHistory(false,true);assert.equal(c.historyData.events.length,101);assert.equal(c.historyData.events[0].cancelled_at,'yes');assert.equal(c.historyData.next,null);
});
test('stale course history response cannot populate the newly selected class',async()=>{
 const c=historyContext([]);let resolve;c.api.rpc=()=>new Promise(r=>resolve=r);const pending=c.loadHistory();c.generation++;c.course={id:'other'};resolve({events:[{id:'wrong'}],next:null});await pending;assert.equal(c.historyData.events[0].id,'old-0');
});

test('deduplicated and replayed saves refresh without false +1 feedback',async()=>{
 const r=await runRecord([{status:'recorded',event_id:'previous-event',day:'2026-10-08',count:2,inserted:false,deduplicated:true}]);assert.equal(r.context.animations,0);
});

test('newly inserted record receives exactly one +1 feedback after verified reload',async()=>{
 const r=await runRecord([{status:'recorded',event_id:'new-event',day:'2026-10-08',count:1,inserted:true}]);assert.equal(r.context.animations,1);
});

test('refresh consumes one coherent server snapshot with selected-day counts',async()=>{
 const text=app(),calls=[],snapshot={version:3,students:[{id:'a',count:2}],layout:{}},context={loading:false,course:{id:'class-a'},generation:1,countMode:'daily',selectedDay:'2026-10-08',followToday:true,autoRefreshTab:()=>true,q:()=>null,document:{activeElement:null},api:{rememberCourse(){},rpc:async(name,args)=>{calls.push({name,args});if(name==='hafs_teacher_day_counts')return {day:'2026-10-08',today:'2026-10-08',counts:[{student_id:'a',count:2}],snapshot};if(name==='hafs_teacher_photos')return [];throw Error('unexpected '+name);}},admin:()=>false,dialog:{open:false},tab:'class',draft:null,rulesDraft:null,busy:false,date:()=>'',render(){},snapshot:null,dayData:null,photos:[],roster:[],queue:[],audit:[],lastSync:'',Date};
 vm.createContext(context);vm.runInContext(text.slice(text.indexOf('async function readClassroom('),text.indexOf('async function signout(')),context);await context.readClassroom(true);
 assert.equal(context.snapshot.version,3);assert.equal(context.dayData.counts[0].count,2);assert.equal(calls.filter(c=>c.name==='hafs_teacher_snapshot').length,0);
});
test('startup restores only the approved tab session and revalidates course access',()=>{
 assert.match(app(),/if\(api\.restoreSession\(\)\)await restorePage\(\)/);
 assert.match(app(),/course\?\.id\?\?api\.selectedCourseId/);
 assert.doesNotMatch(app(),/창을 새로 열면 다시 로그인합니다/);
});

test('expired authentication during a record clears the displayed classroom',async()=>{
 const error=Object.assign(Error('expired'),{status:401});const r=await runRecord([error]);assert.equal(r.context.signedOut,true);
});
test('queued session-lost UI cleanup cannot cancel a newer in-flight login',()=>{
 const tasks=[],context={api:{access:'',generation:1},course:{id:'old'},queueMicrotask:fn=>tasks.push(fn),signout(){context.out=true;}};vm.createContext(context);
 vm.runInContext(app().split('\n').find(line=>line.startsWith('api.onSessionLost=')),context);
 context.api.onSessionLost();context.api.generation++;tasks[0]();assert.equal(context.out,undefined);
});
