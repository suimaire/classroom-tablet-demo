import {periodOptions,coursesForPeriod,courseLabel,periodKey} from './course-selection.js?v=20261004-period-1';
import {teacherLoginLabel} from './teacher-login.js?v=20261006-credentials-1';
import {friendly} from './api.js?v=20261002-students-1';
const terminalCodes=new Set(['NOT_AUTHORIZED','INVALID_REQUEST','INVALID_EMAIL','INVALID_PASSWORD','PASSWORD_NOT_ALLOWED','INVALID_EXPIRY','PROTECTED_ACCOUNT','ACCOUNT_OWNERSHIP_CONFLICT','ACCOUNT_NOT_ELIGIBLE','ROLE_CONFLICT','ALIAS_CONFLICT','STALE_VERSION','IDEMPOTENCY_CONFLICT','AUTH_USER_INACTIVE','TEACHER_ACCOUNT_CONFLICT','USE_TEACHER_ACCOUNT','INELIGIBLE_ACCOUNT','INVALID_TEACHER_EMAIL','INVALID_TEACHER_CHANGES','STALE_TEACHER_ACCOUNT']);
const errorCode=error=>error?.code||error?.message||'';
const messageFor=error=>{const code=errorCode(error);if(code==='PASSWORD_REQUIRED')return '신규 계정 생성에 6~128자의 초기 비밀번호가 필요합니다. 아래에 다시 입력하고 동일 요청을 확인하세요.';if(['IDEMPOTENCY_CONFLICT','REQUEST_CONFLICT'].includes(code))return '요청 내용 충돌로 저장을 중단했습니다. 목록과 계정을 다시 확인해 주세요.';if(['STALE_VERSION','STALE_TEACHER_ACCOUNT'].includes(code))return '다른 작업으로 교사 권한이 바뀌었습니다. 목록과 이메일을 다시 확인한 뒤 검토해 주세요.';if(['INELIGIBLE_ACCOUNT','ACCOUNT_NOT_ELIGIBLE','PROTECTED_ACCOUNT','ACCOUNT_OWNERSHIP_CONFLICT','TEACHER_ACCOUNT_CONFLICT','ROLE_CONFLICT','ALIAS_CONFLICT'].includes(code))return '이 이메일은 교사 계정 관리 대상으로 사용할 수 없습니다. 계정 소유와 종류를 관리자에게 확인하세요.';if(['INVALID_TEACHER_EMAIL','INVALID_EMAIL'].includes(code))return '교사 ID는 이메일 또는 영문자만 1~32자로 입력하세요.';if(['INVALID_TEACHER_CHANGES','INVALID_EXPIRY'].includes(code))return '선택한 학급과 366일 이내의 만료일을 다시 확인하세요.';return friendly(error);};
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusLabel=value=>value==='active'?'사용 중':value==='expired'?'만료':value||'등록됨';
const localDate=value=>{const date=new Date(value||Date.now()+30*86400000);date.setMinutes(date.getMinutes()-date.getTimezoneOffset());return date.toISOString().slice(0,16);};

// Only the non-secret intent survives an ambiguous response. A retry never invents
// a new operation ID and never resets an existing account's password.
export function createTeacherAccountController({list,lookup,save,isCurrent=()=>true,onChange=()=>{},newId=()=>crypto.randomUUID()}){
 let state={model:null,target:null,pending:null,busy:false,message:'',adding:false},disposed=false,epoch=0,activeRequest=null;
 const current=n=>!disposed&&isCurrent()&&n===epoch;
 const notify=()=>{if(!disposed&&isCurrent())onChange({...state});};
 async function run(work){if(state.busy||disposed||!isCurrent())return;const n=++epoch;state.busy=true;notify();try{await work(n);}catch(error){if(current(n)){const terminal=terminalCodes.has(errorCode(error)),wasSave=!!state.pending;if(terminal){state.pending=null;state.target=null;}state.message=state.pending?'저장 결과가 아직 확인되지 않았습니다. 동일 요청으로 다시 확인하세요. '+messageFor(error):(terminal&&wasSave?'권한을 저장하지 못했습니다. 목록과 계정을 다시 확인하세요. ':'')+messageFor(error);}}finally{if(current(n)){state.busy=false;notify();}}}
 return {
  getState:()=>({...state}),
  beginAdd:()=>{if(state.busy||state.pending||disposed||!isCurrent())return;epoch++;state.target=null;state.adding=true;state.message='1. 새 교사의 ID를 입력하고 중복 여부를 확인하세요.';notify();},
  refresh:()=>run(async n=>{const model=await list();if(current(n)){state.model=model;state.target=null;state.adding=false;state.message='목록을 확인했습니다.';}}),
  lookup:email=>run(async n=>{if(state.pending)return;const result=await lookup(email.trim().toLowerCase());if(current(n)){state.adding=false;state.target={...result,email:result.email||email.trim().toLowerCase()};state.message=result.userId?'기존 교사 계정입니다. 비밀번호를 변경하지 않습니다.':'신규 교사 계정입니다. 초기 비밀번호를 직접 입력하세요.';}}),
  submit:(intent,password='')=>{
   if(state.busy||disposed||!isCurrent()){password='';return Promise.resolve();}
   if(!state.pending){state.pending={...structuredClone(intent),requestId:newId()};}
   const request={...state.pending,...(password?{password}:{})};activeRequest=request;password='';
   return run(async n=>{try{const result=await save(request);if(!current(n))return;state.pending=null;state.target=null;state.adding=false;state.message=result.accountCreated?'교사 계정과 학급 권한을 저장했습니다. 입력한 초기 비밀번호는 교사에게 직접 전달하세요.':'학급 권한을 저장했습니다. 기존 비밀번호는 유지됩니다.';try{const model=await list();if(current(n))state.model=model;}catch{if(current(n))state.message+=' 목록 갱신에 실패했습니다. 새로고침해 주세요.';}}finally{if('password'in request)request.password='';if(activeRequest===request)activeRequest=null;}});
  },
  cancel:()=>{if(state.busy||state.pending)return;epoch++;state.target=null;state.adding=false;state.message='입력을 취소했습니다.';notify();},
  dispose:()=>{disposed=true;epoch++;if(activeRequest&&'password'in activeRequest)activeRequest.password='';activeRequest=null;state={model:null,target:null,pending:null,busy:false,message:'',adding:false};}
 };
}

export function mountTeacherAccounts(root,options){
 let view,controller;
 const current=()=>options.isCurrent?.()!==false;
 const clearPassword=()=>root.querySelectorAll('input[type=password]').forEach(node=>node.value='');
 const focusEditor=()=>{if(current())root.querySelector('[data-save] h3')?.focus();};
 const courseTitle=c=>{const key=periodKey(c);return `${key==='unknown'?'학기 정보 없음':key.replace(':','학년도 ')+'학기'} · ${courseLabel(c)}`;};
 function draw(state){
  if(!current())return;view=state;const {model,target,pending,busy,message,adding}=state;
  // Keep the form stable while locked; submit/dispose explicitly clears secrets.
  if(busy&&root.querySelector('[data-teacher-panel]')){root.querySelectorAll('button,input,select').forEach(n=>n.disabled=true);return;}
  root.innerHTML=`<section class="panel" data-teacher-panel><h2>교사 계정·담당 학급</h2><p>새 교사를 추가하거나 기존 교사의 담당 학급과 이용 기간을 변경하세요. 관리자 권한이 있는 학급만 표시하며, 교사에게는 담당 학급의 교사 권한만 부여합니다.</p>
  ${pending?'<p class="notice warning">직전 저장 결과가 미확인입니다. 새 계정을 추가하지 말고 아래에서 동일 요청의 저장 여부를 확인하세요.</p>':''}
  <div class="toolbar"><button type="button" class="primary" data-add ${busy||pending||!model?'disabled':''}>새 교사 추가</button><button type="button" data-refresh ${busy||pending?'disabled':''}>목록 새로고침</button></div>
  ${model?`${adding&&!pending?`<form data-lookup class="teacher-editor"><h3>1. 새 교사 ID 확인</h3><label>교사 ID<input name="email" type="text" autocomplete="off" required maxlength="254" aria-describedby="teacher-id-help"></label><p id="teacher-id-help">이메일 또는 영문자만 1~32자. 기존 ID이면 계정을 새로 만들지 않고 담당 학급 편집으로 이동합니다.</p><div class="toolbar"><button type="submit" class="primary">ID 확인하고 계속</button><button type="button" data-cancel>취소</button></div></form>`:''}
  ${target&&!pending?editor(model,target):''}
  ${pending?`<form data-retry class="teacher-editor"><h3>저장 결과 확인</h3><p>같은 요청 번호로 저장 여부를 확인합니다. 신규 계정 비밀번호가 다시 필요하다는 안내가 나온 경우에만 재입력하세요.</p><label>신규 계정 초기 비밀번호 (필요한 경우)<input name="password" type="password" autocomplete="new-password" minlength="6" maxlength="128" ${pending.expectedUserId?'disabled':''}></label><button type="submit" class="primary">동일 요청으로 저장 확인</button></form>`:''}
  <h3>등록된 교사</h3><div class="teacher-list">${model.items.length?model.items.map(item=>`<div class="student-row"><strong>${escape(teacherLoginLabel(item.email))}</strong><span>${item.memberships.map(m=>{const c=model.courses.find(c=>c.id===m.courseId);return `${escape(c?courseTitle(c):'학급 정보 없음')} · ${escape(statusLabel(m.status))} · ${m.expiresAt?escape(new Date(m.expiresAt).toLocaleString('ko-KR')):'만료 정보 없음'}`;}).join('<br>')}</span><button type="button" data-teacher="${escape(teacherLoginLabel(item.email))}" ${pending?'disabled':''}>담당 학급 편집</button>${options.manage?`<button type="button" data-credential="${escape(item.userId)}" data-action="change-id" ${pending?'disabled':''}>ID 변경</button><button type="button" data-credential="${escape(item.userId)}" data-action="reset-password" ${pending?'disabled':''}>비밀번호 재설정</button>`:''}</div>`).join(''):'<p class="empty">등록된 교사가 없습니다. ‘새 교사 추가’로 시작하세요.</p>'}</div>`:'<p>교사 목록을 불러오세요.</p>'}
  <p role="status" aria-live="polite" data-status>${escape(message)}</p></section>`;
  if(busy)root.querySelectorAll('button,input,select').forEach(n=>n.disabled=true);
 }
 function editor(model,target){
  const item=target.memberships?target:model.items.find(i=>i.userId===target.userId),isNew=!target.userId;
  return `<form data-save class="teacher-editor"><h3 tabindex="-1">${isNew?'2. 새 교사 정보와 담당 학급':'담당 학급 편집'} · ${escape(teacherLoginLabel(target.email))}</h3>
  ${isNew?'<label>초기 비밀번호<input name="password" type="password" autocomplete="new-password" required minlength="6" maxlength="128"></label><p class="muted">6~128자. 숫자만 또는 숫자와 영문 조합도 가능하며 기존 특수문자도 사용할 수 있습니다. 저장 후 교사에게 직접 전달하세요. 이메일은 자동 발송되지 않습니다.</p>':'<p class="muted">계정 ID와 비밀번호는 유지됩니다. 변경할 학급만 선택하세요.</p>'}
  <h4>${isNew?'담당 학급 선택 (복수 선택)':'담당 학급 추가·해제·기간 변경'}</h4><p>${isNew?'한 개 이상의 학급을 선택하고 이용 만료일을 확인하세요.':'변경 없음인 학급은 그대로 유지됩니다.'} 만료일은 기기 시간대 기준이며 오늘부터 366일 이내로 지정합니다.</p>
  ${periodOptions(model.courses).map(period=>`<section class="teacher-course-period"><h4>${escape(period.label)}</h4><div class="teacher-course-list">${coursesForPeriod(model.courses,period.key).map(c=>{const member=item?.memberships.find(m=>m.courseId===c.id);return `<fieldset data-course="${escape(c.id)}"><legend>${escape(courseLabel(c))}</legend>${isNew?'<label class="teacher-assign"><input name="assign" type="checkbox"> 담당 학급으로 선택</label>':`<p>${member?`현재: ${escape(statusLabel(member.status))} · ${member.expiresAt?escape(new Date(member.expiresAt).toLocaleString('ko-KR')):'만료 정보 없음'}`:'현재: 담당하지 않음'}</p><label>변경할 내용<select name="access"><option value="unchanged">변경 없음</option><option value="grant">담당 추가·기간 변경</option><option value="revoke">담당 해제</option></select></label>`}<label>이용 만료일<input name="expires" type="datetime-local" value="${escape(localDate(member?.expiresAt))}" disabled></label></fieldset>`;}).join('')}</div></section>`).join('')}
  ${model.courses.length?'':'<p class="notice warning">관리 권한이 있는 학급이 없어 저장할 수 없습니다.</p>'}
  <label><input name="confirm" type="checkbox" required> 교사 ID, 선택한 담당 학급과 만료일을 확인했습니다.</label><div class="toolbar"><button type="submit" class="primary" ${model.courses.length?'':'disabled'}>${isNew?'교사 계정 추가':'담당 학급 변경 저장'}</button><button type="button" data-cancel>취소</button></div></form>`;
 }
 controller=createTeacherAccountController({...options,onChange:draw});
 async function submit(e){
  if(!e.target.matches('[data-lookup],[data-save],[data-retry]'))return;e.preventDefault();if(view?.busy||!current()){clearPassword();return;}const form=e.target;if(!form.reportValidity())return;
  if(form.matches('[data-lookup]')){clearPassword();await controller.lookup(form.elements.email.value);focusEditor();return;}
  let password=form.elements.password?.value||'';clearPassword();
  if(form.matches('[data-retry]')){const request=controller.submit(null,password);password='';await request;return;}
  try{
   const changes=[...form.querySelectorAll('[data-course]')].filter(row=>row.querySelector('[name=assign]')?.checked||row.querySelector('[name=access]')?.value&&row.querySelector('[name=access]').value!=='unchanged').map(row=>{const access=row.querySelector('[name=assign]')?.checked??(row.querySelector('[name=access]').value==='grant'),raw=row.querySelector('[name=expires]').value;let expiresAt=null;if(access){const expires=new Date(raw);if(!raw||!Number.isFinite(expires.getTime())||expires.getTime()<=Date.now()||expires.getTime()>Date.now()+366*86400000)throw Error('허용할 학급마다 오늘부터 366일 이내의 미래 만료일을 선택하세요.');expiresAt=expires.toISOString();}return {courseId:row.dataset.course,access,expiresAt};});
   if(!changes.length)throw Error(view.target.userId?'변경할 학급을 하나 이상 선택하세요.':'담당 학급을 하나 이상 선택하세요.');if(!view.target.userId&&!changes.some(c=>c.access))throw Error('신규 교사의 담당 학급을 선택하세요.');
   const request=controller.submit({action:'save',email:view.target.email,expectedUserId:view.target.userId??null,expected:view.target.revision,changes},password);password='';await request;
  }catch(error){if(current())root.querySelector('[data-status]').textContent=error.message;}finally{password='';clearPassword();}
 }
 async function click(e){
  const b=e.target.closest('button');if(!b||view?.busy||!current())return;
  if(b.hasAttribute('data-add')){clearPassword();controller.beginAdd();root.querySelector('[data-lookup] [name=email]')?.focus();}
  else if(b.dataset.credential){clearPassword();await options.manage?.(b.dataset.credential,b.dataset.action);}
  else if(b.hasAttribute('data-cancel')){clearPassword();controller.cancel();root.querySelector('[data-add]')?.focus();}
  else if(b.hasAttribute('data-refresh')){clearPassword();await controller.refresh();}
  else if(b.dataset.teacher){clearPassword();await controller.lookup(b.dataset.teacher);focusEditor();}
 }
 function change(e){const row=e.target.closest('[data-course]');if(!row)return;const grant=row.querySelector('[name=assign]')?.checked??(row.querySelector('[name=access]').value==='grant');row.querySelector('[name=expires]').disabled=!grant;}
 root.addEventListener('submit',submit);root.addEventListener('click',click);root.addEventListener('change',change);draw(controller.getState());
 return {refresh:()=>controller.refresh(),dispose:()=>{clearPassword();controller.dispose();root.removeEventListener('submit',submit);root.removeEventListener('click',click);root.removeEventListener('change',change);}};
}
