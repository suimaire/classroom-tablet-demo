import {personalAuthEmail} from './model.js';
export class PersonalAPIError extends Error{constructor(code,status=0){super(code);this.code=code;this.status=status;}}
const wipe=body=>{if(body&&typeof body==='object'){if('password'in body)body.password='';if('currentPassword'in body)body.currentPassword='';}};
export class PersonalAPI{
 constructor({fetch:fetcher=globalThis.fetch.bind(globalThis)}={}){this.fetch=fetcher;this.access='';this.refresh='';this.expires=0;this.refreshing=null;this.generation=0;}
 async init(){const r=await this.fetch(new URL('./config.json',import.meta.url),{cache:'no-store'});if(!r.ok)throw Error('서버 설정을 읽을 수 없습니다.');this.config=await r.json();if(this.config.enabled!==true||!this.config.publishableKey?.startsWith('sb_publishable_'))throw Error('개인 계정 설정이 완료되지 않았습니다.');personalAuthEmail('10101',this.config);return this.config;}
 async request(path,body,token){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);let serialized='';
  try{
   serialized=JSON.stringify(body);wipe(body);
   const sending=this.fetch(this.config.supabaseUrl+path,{method:'POST',headers:{'Content-Type':'application/json',apikey:this.config.publishableKey,...(token?{Authorization:'Bearer '+token}:{})},body:serialized,signal:controller.signal,cache:'no-store'});serialized='';
   const r=await sending,result=await r.json().catch(()=>({}));
   if(!r.ok)throw new PersonalAPIError(result.error_code??result.code??result.error??result.message??`HTTP_${r.status}`,r.status);
   return result;
  }catch(error){if(error.name==='AbortError')throw new PersonalAPIError('TIMEOUT');throw error;}
  finally{serialized='';wipe(body);clearTimeout(timer);}
 }
 session(result){if(!result.access_token||!result.refresh_token)throw Error('로그인을 확인하지 못했습니다.');this.access=result.access_token;this.refresh=result.refresh_token;this.expires=Date.now()+(result.expires_in||3600)*1000;}
 async signIn(studentNumber,password){const epoch=++this.generation;try{const pending=this.request('/auth/v1/token?grant_type=password',{email:personalAuthEmail(studentNumber,this.config),password});password='';const result=await pending;if(epoch!==this.generation)throw new PersonalAPIError('CANCELLED',401);this.session(result);}finally{password='';}}
 async authorized(path,body){
  const epoch=this.generation;
  try{
   if(!this.access)throw new PersonalAPIError('LOGIN_REQUIRED',401);
   if(Date.now()>this.expires-60000){
    if(!this.refreshing){const g=this.generation;this.refreshing=this.request('/auth/v1/token?grant_type=refresh_token',{refresh_token:this.refresh}).then(result=>{if(g!==this.generation)throw new PersonalAPIError('CANCELLED',401);this.session(result);}).finally(()=>this.refreshing=null);}
    await this.refreshing;
   }
   if(epoch!==this.generation)throw new PersonalAPIError('CANCELLED',401);
   const result=await this.request(path,body,this.access);if(epoch!==this.generation)throw new PersonalAPIError('CANCELLED',401);return result;
  }finally{wipe(body);}
 }
 status(){return this.authorized('/rest/v1/rpc/hafs_personal_status',{});}
 records(){return this.authorized('/rest/v1/rpc/hafs_personal_records',{});}
 changePassword(body){return this.authorized('/functions/v1/personal-student-accounts',body);}
 clear(){this.generation++;this.access='';this.refresh='';this.expires=0;}
 async logout(){const access=this.access;this.clear();if(access)await this.request('/auth/v1/logout',{},access).catch(()=>{});}
}
export function friendly(error){
 const code=error?.code??error?.message??'';
 const messages={CURRENT_PASSWORD_MISMATCH:'현재 비밀번호를 확인하세요.',SAME_PASSWORD:'새 비밀번호는 현재 비밀번호와 다르게 입력하세요.',OPERATION_PENDING:'비밀번호 변경 결과를 확인 중입니다. 잠시 후 로그아웃하고 새 비밀번호로 먼저 로그인해 보세요.',WEAK_PASSWORD:'새 비밀번호 형식을 확인하세요.',AUTH_RATE_LIMIT:'요청이 많습니다. 잠시 후 다시 시도하세요.',invalid_credentials:'학번 또는 비밀번호를 확인하세요.',INVALID_CURRENT_PASSWORD:'현재 비밀번호를 확인하세요.',same_password:'새 비밀번호는 현재 비밀번호와 다르게 입력하세요.',INVALID_PASSWORD:'새 비밀번호 형식을 확인하세요.',PASSWORD_CHANGE_REQUIRED:'먼저 비밀번호를 변경하세요.',NOT_AUTHORIZED:'이 개인 계정으로 본인 기록을 확인할 수 없습니다.',INELIGIBLE_ACCOUNT:'현재 1학년 개인 계정이 아닙니다. 관리자에게 문의하세요.',ACCOUNT_CHANGE_PENDING:'비밀번호 변경 결과를 확인 중입니다. 잠시 후 다시 로그인하세요.',PASSWORD_CHANGE_PENDING:'비밀번호 변경 결과를 확인 중입니다. 잠시 후 다시 로그인하세요.',TIMEOUT:'연결 결과를 확인하지 못했습니다. 비밀번호 변경 중이었다면 로그아웃 후 새 비밀번호로 먼저 로그인해 보세요.',PGRST202:'개인 기록 서버 기능이 아직 준비되지 않았습니다.'};
 for(const [key,message]of Object.entries(messages))if(code.includes(key))return message;
 if(error instanceof PersonalAPIError)return error.status===401?'로그인이 만료되었습니다. 다시 로그인하세요.':error.status===429?'요청이 많습니다. 잠시 후 다시 시도하세요.':'요청을 완료하지 못했습니다. 입력값과 계정 상태를 확인하세요.';
 return error?.message||'요청을 완료하지 못했습니다.';
}
