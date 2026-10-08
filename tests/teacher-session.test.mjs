import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CloudAPI,APIError,friendly} from '../admin/api.js';

const project='https://synthetic.supabase.co';
const key='hafs.teacher.session.v1:'+project;
const now=1800000000000;
const tokenSet=(suffix='one',expiresAt=now+3600000)=>({access_token:'synthetic-access-'+suffix,refresh_token:'synthetic-refresh-'+suffix,expires_at:expiresAt/1000,expires_in:3600});
const stored=(changes={})=>({version:1,access:'synthetic-access-one',refresh:'synthetic-refresh-one',expires:now+3600000,selectedCourseId:null,...changes});
function memoryStorage(){const entries=new Map();return {entries,getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,String(v)),removeItem:k=>entries.delete(k)};}
function setup(t){
 const storage=memoryStorage();
 t.mock.method(Date,'now',()=>now);
 const previous=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:storage});
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'sessionStorage',previous);else delete globalThis.sessionStorage;});
 const api=new CloudAPI();api.config={supabaseUrl:project,publishableKey:'sb_publishable_synthetic'};
 return {api,storage,reloaded:()=>{const next=new CloudAPI();next.config=api.config;return next;}};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('login stores only existing token pair, absolute expiry, and optional course in this tab',t=>{
 const {api,storage}=setup(t);
 api.session({...tokenSet(),password:'never-persist',user:{email:'synthetic@example.invalid'},photos:['never-persist'],events:['never-persist']});
 assert.deepEqual(JSON.parse(storage.getItem(key)),stored());
 assert.equal(storage.entries.size,1);
});
test('reload restores original absolute expiry without adding another lifetime',t=>{
 const {api,reloaded}=setup(t);api.session(tokenSet());
 t.mock.method(Date,'now',()=>now+1800000);
 const next=reloaded();assert.equal(typeof next.restoreSession,'function');assert.equal(next.restoreSession(),true);
 assert.equal(next.access,'synthetic-access-one');assert.equal(next.refresh,'synthetic-refresh-one');assert.equal(next.expires,now+3600000);
});
test('server absolute expiry is respected instead of replacing it with expires_in',t=>{
 const {api,storage}=setup(t);api.session(tokenSet('one',now+900000));
 assert.equal(api.expires,now+900000);assert.equal(JSON.parse(storage.getItem(key)).expires,now+900000);
});
test('course selection is optional metadata and never persists classroom data',t=>{
 const {api,storage,reloaded}=setup(t);api.session(tokenSet());assert.equal(typeof api.rememberCourse,'function');
 api.rememberCourse('synthetic-course-a');const next=reloaded();assert.equal(next.restoreSession(),true);
 assert.equal(next.selectedCourseId,'synthetic-course-a');assert.deepEqual(JSON.parse(storage.getItem(key)),stored({selectedCourseId:'synthetic-course-a'}));
 next.rememberCourse(null);assert.equal(next.selectedCourseId,null);
});
test('a separate tab and another project cannot restore the first tab session',t=>{
 const {api,storage,reloaded}=setup(t);api.session(tokenSet());const otherProject=reloaded();otherProject.config={...api.config,supabaseUrl:'https://other-synthetic.supabase.co'};
 assert.equal(typeof otherProject.restoreSession,'function');assert.equal(otherProject.restoreSession(),false);
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:memoryStorage()});
 assert.equal(reloaded().restoreSession(),false);assert.equal(storage.entries.size,1);
});
test('malformed, incomplete, and extra-field stored sessions are discarded',t=>{
 const {storage,reloaded}=setup(t);
 const invalid=['{', 'null', '[]', JSON.stringify(stored({version:2})),JSON.stringify(stored({access:''})),JSON.stringify(stored({refresh:{secret:'invalid'}})),JSON.stringify(stored({expires:'3600'})),JSON.stringify(stored({expires:-1})),JSON.stringify(stored({expires:null})),JSON.stringify(stored({selectedCourseId:{id:'invalid'}})),JSON.stringify({...stored(),password:'never-restore'})];
 for(const value of invalid){storage.setItem(key,value);const api=reloaded();assert.equal(typeof api.restoreSession,'function');assert.equal(api.restoreSession(),false);assert.equal(api.access,'');assert.equal(storage.getItem(key),null);}
});
test('unavailable or full sessionStorage keeps password login usable in memory',t=>{
 const {api,reloaded,storage}=setup(t);storage.setItem=()=>{throw Error('quota');};
 assert.doesNotThrow(()=>api.session(tokenSet()));assert.equal(api.access,'synthetic-access-one');
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,get(){throw Error('blocked');}});
 const next=reloaded();assert.equal(typeof next.restoreSession,'function');assert.equal(next.restoreSession(),false);
 assert.doesNotThrow(()=>next.session(tokenSet()));assert.equal(next.access,'synthetic-access-one');
});
test('expired restored access refreshes once before the authoritative course check',async t=>{
 const {storage,reloaded}=setup(t);storage.setItem(key,JSON.stringify(stored({expires:now-1,selectedCourseId:'synthetic-course-a'})));
 const api=reloaded();assert.equal(typeof api.restoreSession,'function');assert.equal(api.restoreSession(),true);
 const calls=[];api.request=async(path,args,token)=>{calls.push({path,args,token});return path.includes('refresh_token')?tokenSet('two'):[{id:'synthetic-course-a',role:'teacher'}];};
 assert.deepEqual(await api.rpc('hafs_my_courses'),[{id:'synthetic-course-a',role:'teacher'}]);
 assert.deepEqual(calls,[{path:'/auth/v1/token?grant_type=refresh_token',args:{refresh_token:'synthetic-refresh-one'},token:undefined},{path:'/rest/v1/rpc/hafs_my_courses',args:{},token:'synthetic-access-two'}]);
 assert.deepEqual(JSON.parse(storage.getItem(key)),stored({access:'synthetic-access-two',refresh:'synthetic-refresh-two',selectedCourseId:'synthetic-course-a'}));
});
test('failed refresh clears restored tokens and never sends the protected RPC',async t=>{
 const {storage,reloaded}=setup(t);storage.setItem(key,JSON.stringify(stored({expires:now-1})));const api=reloaded();
 assert.equal(typeof api.restoreSession,'function');api.restoreSession();const calls=[];
 api.request=async path=>{calls.push(path);throw new APIError('invalid_refresh_token',400);};
 await assert.rejects(api.rpc('hafs_my_courses'),e=>e.status===401);
 assert.deepEqual(calls,['/auth/v1/token?grant_type=refresh_token']);assert.equal(api.access,'');assert.equal(api.refresh,'');assert.equal(api.expires,0);assert.equal(storage.getItem(key),null);
});
test('401 from an authenticated RPC clears memory and tab storage',async t=>{
 const {api,storage}=setup(t);api.session(tokenSet());api.request=async()=>{throw new APIError('invalid JWT',401);};
 await assert.rejects(api.rpc('hafs_my_courses'),e=>e.status===401);assert.equal(api.access,'');assert.equal(storage.getItem(key),null);
});
test('401 from an edge function clears the session after membership is checked',async t=>{
 const {api,storage}=setup(t);api.session(tokenSet());const calls=[];api.request=async path=>{calls.push(path);if(path.includes('/functions/'))throw new APIError('unauthorized',401);return [];};
 const body={password:'never-persist'};await assert.rejects(api.edge('synthetic-edge',body),e=>e.status===401);
 assert.deepEqual(calls,['/rest/v1/rpc/hafs_my_courses','/functions/v1/synthetic-edge']);assert.equal(body.password,'');assert.equal(api.access,'');assert.equal(storage.getItem(key),null);
});
test('logout clears tokens, course, and storage before waiting on the server',async t=>{
 const {api,storage,reloaded}=setup(t);api.session(tokenSet());const response=deferred();let outgoing;
 api.request=(path,args,token)=>{outgoing={path,token};return response.promise;};
 const pending=api.logout();assert.equal(api.access,'');assert.equal(api.refresh,'');assert.equal(api.expires,0);assert.equal(storage.getItem(key),null);
 assert.equal(api.selectedCourseId,null);assert.equal(reloaded().restoreSession(),false);assert.deepEqual(outgoing,{path:'/auth/v1/logout',token:'synthetic-access-one'});
 response.reject(Error('offline'));await pending;
});
test('a login response arriving after logout cannot persist or restore a session',async t=>{
 const {api,storage}=setup(t);const response=deferred();api.request=()=>response.promise;
 const pending=api.signInPassword('synthetic@example.invalid','never-persist');await api.logout();response.resolve(tokenSet());
 await assert.rejects(pending,e=>e.status===401);assert.equal(api.access,'');assert.equal(storage.getItem(key),null);
});
test('a refresh response arriving after logout cannot re-create tab storage',async t=>{
 const {api,storage}=setup(t);api.session(tokenSet('one',now-1));const response=deferred();
 api.request=path=>path.includes('refresh_token')?response.promise:Promise.resolve({});
 const pending=api.rpc('hafs_my_courses');await api.logout();response.resolve(tokenSet('two'));
 await assert.rejects(pending,e=>e.status===401);assert.equal(api.access,'');assert.equal(storage.getItem(key),null);
});
test('late 401 from a previous session cannot clear a new login',async t=>{
 const {api,storage}=setup(t);api.session(tokenSet());const response=deferred();api.request=path=>path.includes('/rest/')?response.promise:Promise.resolve(tokenSet('two'));
 const old=api.rpc('hafs_my_courses');await api.signInPassword('synthetic@example.invalid','never-persist');response.reject(new APIError('old unauthorized',401));
 await assert.rejects(old,e=>e.status===401);assert.equal(api.access,'synthetic-access-two');assert.equal(JSON.parse(storage.getItem(key)).access,'synthetic-access-two');
});
test('simultaneous protected reads share one refresh and store the rotated pair',async t=>{
 const {api,storage}=setup(t);api.session(tokenSet('one',now-1));const response=deferred();let refreshes=0;
 api.request=path=>{if(path.includes('refresh_token')){refreshes++;return response.promise;}return Promise.resolve([]);};
 const first=api.rpc('hafs_my_courses'),second=api.rpc('hafs_my_courses');assert.equal(refreshes,1);response.resolve(tokenSet('two'));
 await Promise.all([first,second]);assert.equal(JSON.parse(storage.getItem(key)).refresh,'synthetic-refresh-two');
});
test('late refresh failure cannot clear a new session or its in-flight refresh',async t=>{
 const {api,storage}=setup(t);api.session(tokenSet('one',now-1));const oldResponse=deferred(),newResponse=deferred();let refreshes=0;
 api.request=path=>path.includes('refresh_token')?(++refreshes===1?oldResponse.promise:newResponse.promise):path.includes('grant_type=password')?Promise.resolve(tokenSet('two',now-1)):Promise.resolve([]);
 const old=api.rpc('hafs_my_courses');await api.signInPassword('synthetic@example.invalid','never-persist');
 const current=api.rpc('hafs_my_courses'),currentRefresh=api.refreshing;
 oldResponse.reject(new APIError('invalid_refresh_token',400));await assert.rejects(old);
 assert.equal(api.access,'synthetic-access-two');assert.equal(api.refreshing,currentRefresh);assert.equal(JSON.parse(storage.getItem(key)).access,'synthetic-access-two');
 newResponse.resolve(tokenSet('three'));await current;assert.equal(api.access,'synthetic-access-three');assert.equal(api.refreshing,null);
});
test('failed storage update removes stale rotated credentials while keeping live tokens',t=>{
 const {api,storage,reloaded}=setup(t);api.session(tokenSet());storage.setItem=()=>{throw Error('quota');};api.session(tokenSet('two'));
 assert.equal(api.access,'synthetic-access-two');assert.equal(storage.getItem(key),null);assert.equal(reloaded().restoreSession(),false);
});
test('invalid token response and failed network refresh discard persisted sessions',async t=>{
 const {api,storage}=setup(t);api.session(tokenSet());assert.throws(()=>api.session({access_token:42,refresh_token:'invalid',expires_in:3600}),e=>e.status===401);
 assert.equal(api.access,'');assert.equal(storage.getItem(key),null);
 api.session(tokenSet('one',now-1));api.request=async()=>{throw Error('offline');};await assert.rejects(api.rpc('hafs_my_courses'),e=>e.status===401);
 assert.equal(api.refresh,'');assert.equal(storage.getItem(key),null);
});
test('successful login clears password from outgoing object and persists no identity metadata',async t=>{
 const {api,storage}=setup(t);let body;
 api.request=async(path,args)=>{body=args;return {...tokenSet(),user:{email:'synthetic@example.invalid'}};};
 await api.signInPassword('synthetic@example.invalid','never-persist');assert.equal(body.password,'');assert.deepEqual(JSON.parse(storage.getItem(key)),stored());
});
test('a normal RPC network failure retains its original session for exact-request retry',async t=>{
 const {api,storage}=setup(t);api.session(tokenSet());api.request=async()=>{throw Error('offline');};
 await assert.rejects(api.rpc('hafs_record_guarded',{p_request:'synthetic-request'}),/offline/);assert.equal(api.access,'synthetic-access-one');assert.deepEqual(JSON.parse(storage.getItem(key)),stored());
});
test('transport advice does not tell teachers to discard an uncertain pending record by reloading',()=>{
 assert.doesNotMatch(friendly(new APIError('TIMEOUT')),/새로고침/);
 assert.doesNotMatch(friendly(new APIError('STALE_VERSION',409)),/새로고침/);
 assert.match(friendly(new APIError('TIMEOUT')),/동일 요청/);
 const source=readFileSync(new URL('../admin/api.js',import.meta.url),'utf8');assert.doesNotMatch(source,/localStorage/);
});
test('terminal authorization clears UI through the session-lost hook even when a module catches errors',async t=>{
 const {api,storage}=setup(t);api.session(tokenSet());let calls=0;
 api.onSessionLost=()=>{calls++;assert.equal(api.access,'');assert.equal(storage.getItem(key),null);};
 api.request=async()=>{throw new APIError('expired',401);};
 await api.rpc('hafs_teacher_account_list').catch(()=>{});assert.equal(calls,1);
});
test('a stale authorization failure cannot notify away a newly signed-in session',async t=>{
 const {api}=setup(t);api.session(tokenSet());let calls=0;api.onSessionLost=()=>calls++;
 const d=deferred();api.request=()=>d.promise;const pending=api.rpc('hafs_teacher_account_list');
 api.generation++;api.session(tokenSet('new'));d.reject(new APIError('expired',401));await pending.catch(()=>{});
 assert.equal(calls,0);assert.equal(api.access,'synthetic-access-new');
});
test('session-lost observer exceptions cannot break credential cleanup',t=>{
 const {api,storage}=setup(t);api.session(tokenSet());api.onSessionLost=()=>{throw Error('observer');};
 assert.doesNotThrow(()=>api.clearSession());assert.equal(api.access,'');assert.equal(storage.getItem(key),null);
});
test('revoked course authorization notifies UI even when the module swallows the error',async t=>{
 const {api}=setup(t);let lost=0;api.onSessionLost=()=>lost++;
 for(const error of [new APIError('denied',403),new APIError('NOT_AUTHORIZED',400),new APIError('AUTH_USER_INACTIVE',400)]){
  api.session(tokenSet());api.request=async()=>{throw error;};await api.rpc('hafs_teacher_account_list').catch(()=>{});assert.equal(api.access,'');
 }
 assert.equal(lost,3);api.session(tokenSet());api.request=async()=>{throw new APIError('INVALID_INPUT',400);};await api.rpc('hafs_teacher_account_list').catch(()=>{});assert.equal(lost,3);assert.notEqual(api.access,'');
});
