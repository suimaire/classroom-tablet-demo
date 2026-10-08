export class APIError extends Error{constructor(code,status=0){super(code);this.code=code;this.status=status;}}
const authorizationLost=error=>error?.status===401||error?.status===403||/NOT_AUTHORIZED|AUTH_USER_INACTIVE/.test(error?.message??'');
const validToken=value=>typeof value==='string'&&value.length>0&&value.length<=16384&&/^[A-Za-z0-9._~-]+$/.test(value);
const validCourseId=value=>value==null||(typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value));
const validSession=value=>value&&typeof value==='object'&&!Array.isArray(value)&&value.version===1&&validToken(value.access)&&validToken(value.refresh)&&Number.isSafeInteger(value.expires)&&value.expires>0&&validCourseId(value.selectedCourseId)&&Object.keys(value).every(key=>['version','access','refresh','expires','selectedCourseId'].includes(key));
export class CloudAPI{
 constructor(){this.access='';this.refresh='';this.expires=0;this.refreshing=null;this.generation=0;this.selectedCourseId=null;}
 async init(){const r=await fetch(new URL('./config.json',import.meta.url),{cache:'no-store'});if(!r.ok)throw Error('서버 설정을 읽을 수 없습니다.');this.config=await r.json();if(this.config.enabled!==true||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(this.config.supabaseUrl)||!this.config.publishableKey?.startsWith('sb_publishable_'))throw Error('서버 설정이 완료되지 않았습니다.');}
 async request(path,body,token){const c=new AbortController(),t=setTimeout(()=>c.abort(),15000);try{const r=await fetch(this.config.supabaseUrl+path,{method:'POST',headers:{'Content-Type':'application/json',apikey:this.config.publishableKey,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:c.signal,cache:'no-store'});const j=await r.json().catch(()=>({}));if(!r.ok)throw new APIError(j.error_code??j.message??j.error_description??j.error??j.code??`HTTP_${r.status}`,r.status);return j;}catch(e){if(e.name==='AbortError')throw new APIError('요청 시간이 초과되었습니다. 발표 저장 결과가 불확실하면 동일 요청으로 확인해 주세요.');throw e;}finally{clearTimeout(t);}}
 sessionKey(){return this.config?.supabaseUrl?'hafs.teacher.session.v1:'+this.config.supabaseUrl:null;}
 forgetStoredSession(){try{const key=this.sessionKey();if(key)globalThis.sessionStorage?.removeItem(key);}catch{}}
 persistSession(){
  const value={version:1,access:this.access,refresh:this.refresh,expires:this.expires,selectedCourseId:this.selectedCourseId};
  if(!validSession(value))return;
  try{const key=this.sessionKey();if(key)globalThis.sessionStorage?.setItem(key,JSON.stringify(value));}
  catch{this.forgetStoredSession();} // Storage may be blocked or full; keep the current memory-only login usable.
 }
 clearSession(){this.generation++;this.access='';this.refresh='';this.expires=0;this.refreshing=null;this.selectedCourseId=null;this.forgetStoredSession();try{this.onSessionLost?.();}catch{}}
 restoreSession(){
  let value;
  try{const key=this.sessionKey(),raw=key?globalThis.sessionStorage?.getItem(key):null;if(!raw)return false;if(raw.length>40000)throw Error('Invalid session');value=JSON.parse(raw);}
  catch{this.clearSession();return false;}
  if(!validSession(value)){this.clearSession();return false;}
  // This is only a restore hint. Every read still goes to Supabase and rechecks course membership.
  // Preserve the saved deadline exactly; an expired access token must use the existing refresh flow.
  this.access=value.access;this.refresh=value.refresh;this.expires=value.expires;this.selectedCourseId=value.selectedCourseId??null;
  return true;
 }
 rememberCourse(id){this.selectedCourseId=validCourseId(id)?id??null:null;if(this.access)this.persistSession();}
 session(s){
  const expires=s?.expires_at!==undefined?s.expires_at*1000:Date.now()+(s?.expires_in??3600)*1000;
  if(!validToken(s?.access_token)||!validToken(s?.refresh_token)||!Number.isSafeInteger(expires)||expires<=0||(s?.expires_at!==undefined&&typeof s.expires_at!=='number')||(s?.expires_in!==undefined&&(typeof s.expires_in!=='number'||!Number.isFinite(s.expires_in)||s.expires_in<=0))){this.clearSession();throw new APIError('로그인이 완료되지 않았습니다.',401);}
  this.access=s.access_token;this.refresh=s.refresh_token;this.expires=expires;this.persistSession();
 }
 async signInPassword(email,password){const g=++this.generation;this.refreshing=null;const body={email,password};password='';let pending;try{pending=this.request('/auth/v1/token?grant_type=password',body);}finally{body.password='';}const s=await pending;if(g!==this.generation)throw new APIError('취소된 로그인입니다.',401);this.selectedCourseId=null;this.session(s);}
 async rpc(name,args={}){
  const epoch=this.generation;
  try{
   if(!this.access)throw new APIError('로그인이 필요합니다.',401);
   if(Date.now()>this.expires-60000){
    if(!this.refreshing){
     const g=this.generation;
     const task=this.request('/auth/v1/token?grant_type=refresh_token',{refresh_token:this.refresh}).then(s=>{
      if(g!==this.generation)throw new APIError('로그아웃되었습니다.',401);
      this.session(s);
     }).catch(error=>{
      if(g===this.generation){this.clearSession();throw new APIError('로그인을 다시 확인해 주세요.',401);}
      throw error;
     }).finally(()=>{if(this.refreshing===task)this.refreshing=null;});
     this.refreshing=task;
    }
    await this.refreshing;
   }
   if(epoch!==this.generation)throw new APIError('로그아웃되었습니다.',401);
   const result=await this.request('/rest/v1/rpc/'+name,args,this.access);
   if(epoch!==this.generation)throw new APIError('로그아웃되었습니다.',401);
   return result;
  }catch(error){if(authorizationLost(error)&&epoch===this.generation)this.clearSession();throw error;}
 }
 async edge(name,args){
  const epoch=this.generation;
  try{
   await this.rpc('hafs_my_courses');
   if(epoch!==this.generation)throw new APIError('로그아웃되었습니다.',401);
   let pending;try{pending=this.request('/functions/v1/'+name,args,this.access);}finally{if('password'in args)args.password='';}
   const result=await pending;if(epoch!==this.generation)throw new APIError('로그아웃되었습니다.',401);return result;
  }catch(error){if(authorizationLost(error)&&epoch===this.generation)this.clearSession();throw error;}
  finally{if('password'in args)args.password='';}
 }
 async logout(){const a=this.access;this.clearSession();if(a)await this.request('/auth/v1/logout',{},a).catch(()=>{});}
}
export const friendly=e=>{const msg=e?.message||String(e);const codes={invalid_credentials:'ID 또는 비밀번호를 확인하세요.',email_not_confirmed:'계정 활성화가 완료되지 않았습니다. 관리자에게 확인하세요.',STALE_VERSION:'다른 기기에서 자료가 바뀌었습니다. 최신 자료를 다시 불러온 뒤 검토해 주세요.',NOT_AUTHORIZED:'이 학급의 접근 권한이 없거나 만료되었습니다.',AUTH_USER_INACTIVE:'계정이 비활성 상태입니다. 관리자에게 확인해 주세요.',INCOMPLETE_ROSTER:'모든 재적 학생을 한 번씩 자리표에 배치해 주세요.',DUPLICATE_IDENTITY:'중복 학번 또는 다른 학급 학생 ID입니다.',INVALID_ROSTER:'명렬 형식을 확인해 주세요.',UNKNOWN_STUDENT:'현재 반에 등록되지 않은 학생입니다.',PGRST202:'필요한 서버 기능이 아직 배포되지 않았습니다.'};for(const [k,v]of Object.entries(codes))if(msg.includes(k))return v;return e instanceof APIError?(e.status===401?'로그인이 만료되었습니다. 다시 로그인하세요.':e.status===429?'요청이 많습니다. 잠시 후 다시 시도하세요.':e.status===0?'연결을 확인하지 못했습니다. 발표 저장 결과가 불확실하면 동일 요청으로 확인해 주세요.':'요청을 완료하지 못했습니다. 입력값과 접근 권한을 확인하세요.'):msg;};
