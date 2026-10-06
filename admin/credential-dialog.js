import {teacherAuthEmail,teacherLoginLabel} from './teacher-login.js';
const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const errors={NOT_AUTHORIZED:'이 계정에 연결된 모든 학급의 관리자 권한이 필요합니다.',INELIGIBLE_ACCOUNT:'변경할 수 없는 계정입니다. 대상 역할과 담당 학급을 확인하세요.',ALIAS_CONFLICT:'이미 사용 중이거나 과거 계정에 예약된 ID입니다.',STALE_ACCOUNT:'계정 ID가 변경되었습니다. 창을 닫고 다시 확인하세요.',ACCOUNT_CHANGE_PENDING:'이 계정에 결과가 미확인인 변경이 있습니다.',IDEMPOTENCY_CONFLICT:'요청 내용이 달라 저장을 중단했습니다.',ACCOUNT_OWNERSHIP_CONFLICT:'계정 소유 정보가 일치하지 않습니다.',UNCHANGED_ID:'기존 ID와 같습니다.',INVALID_PASSWORD:'비밀번호 길이를 확인하세요.',INVALID_ID:'이메일 또는 영문자만 1~32자로 입력하세요.',CHANGE_REJECTED:'서버가 변경을 거부했습니다. 비밀번호 정책 또는 계정 상태를 확인하세요.'};
const message=e=>errors[e?.code??e?.message]??'요청을 확인하지 못했습니다. 연결 상태를 확인하세요.';
const active=new WeakMap();
export async function openCredentialDialog({dialog,request,isCurrent,onDone=()=>{},target,action}){
 active.get(dialog)?.();let disposed=false,busy=false,model=null,pending=null;
 const current=()=>!disposed&&isCurrent()&&dialog.open;
 const q=s=>dialog.querySelector(s);
 const clear=()=>dialog.querySelectorAll('input[type=password]').forEach(n=>n.value='');
 const cancel=e=>{if(busy)e.preventDefault();};
 const dispose=event=>{if(event?.type==='close'&&dialog.open)return;disposed=true;clear();dialog.removeEventListener('cancel',cancel);dialog.removeEventListener('close',dispose);if(active.get(dialog)===dispose)active.delete(dialog);};
 active.set(dialog,dispose);dialog.addEventListener('close',dispose);dialog.addEventListener('cancel',cancel);
 dialog.innerHTML=`<header><h2>${action==='change-id'?'교사 ID 변경':target.kind==='teacher'?'교사 비밀번호 재설정':'학생 비밀번호 재설정'}</h2><button id="credential-close" aria-label="닫기">닫기</button></header><p id="credential-status" role="status">대상과 관리자 권한을 확인하는 중…</p><div id="credential-body"></div>`;
 q('#credential-close').onclick=()=>{if(!busy){clear();dialog.close();}};if(!dialog.open)dialog.showModal();
 const status=s=>{if(current())q('#credential-status').textContent=s;};
 const lock=value=>{busy=value;if(current())dialog.querySelectorAll('button,input').forEach(n=>n.disabled=value);};
 async function received(result){
  if(!current())return;
  if(result.state==='completed'){
   pending=null;clear();q('#credential-body').innerHTML='<p>기존 계정과 학급 연결은 유지됩니다. 변경된 ID 또는 비밀번호를 해당 사용자에게 직접 전달하세요.</p>';status('변경이 완료되었습니다.');
   try{await onDone();}catch{status('변경은 완료되었습니다. 목록 새로고침은 다시 시도하세요.');}
  }else if(result.state==='failed'){
   pending=null;clear();q('#credential-body').innerHTML='<p>변경이 거부되었습니다. 창을 닫고 대상과 입력값을 다시 확인하세요.</p>';status('변경하지 못했습니다.');
  }else{
   pending??={requestId:result.requestId};clear();q('#credential-body').innerHTML='<p class="notice warning">저장 결과가 미확인입니다. 비밀번호를 다시 보내지 않습니다. 아래에서 처리 상태만 확인하세요. 계속 미확인이라면 새 변경은 차단되며 운영 확인이 필요합니다.</p><button id="credential-check">동일 요청 상태 확인</button>';status('변경 결과 미확인');
   q('#credential-check').onclick=async()=>{if(busy||!current())return;lock(true);try{await received(await request({action:'status',requestId:pending.requestId}));}catch(e){status(message(e));}finally{lock(false);}};
  }
 }
 function form(){
  const minimum=6,label=target.kind==='teacher'?teacherLoginLabel(model.email):String(target.studentNumber);
  q('#credential-body').innerHTML=`<p><strong>${target.kind==='teacher'?'교사 ID':'학생 학번'}: ${h(label)}</strong></p><p class="muted">이 계정이 사용하는 모든 학급에 적용됩니다. 학급 권한·발표 기록·대표 지정은 유지됩니다.</p><form id="credential-form">${action==='change-id'?'<label>새 교사 ID<input name="newId" autocomplete="off" maxlength="254" required></label><p>이메일 또는 영문자만 1~32자. 영문 ID는 소문자로 저장하며 이전 ID는 다른 계정에 재사용할 수 없습니다.</p>':`<label>새 비밀번호<input name="password" type="password" autocomplete="new-password" minlength="${minimum}" maxlength="128" required></label><label>새 비밀번호 확인<input name="confirmation" type="password" autocomplete="new-password" minlength="${minimum}" maxlength="128" required></label><p>${minimum}~128자.${target.kind==='teacher'?' 숫자만 또는 숫자와 영문 조합도 가능합니다. 기존 특수문자도 사용할 수 있습니다.':''} 입력값은 제출 또는 창 닫기 시 지워집니다.</p>`}<label><input name="confirm" type="checkbox" required> 대상과 변경 내용을 확인했습니다.</label><button id="credential-save" type="submit" class="primary">확인한 변경 저장</button></form>`;
  q('#credential-form').onsubmit=async e=>{
   e.preventDefault();if(busy||!current()){clear();return;}const f=e.currentTarget;if(!f.reportValidity())return;
   let password='',confirmation='',payload;
   try{
    payload={action,kind:target.kind,targetId:model.userId,expectedEmail:model.email,requestId:crypto.randomUUID()};
    if(action==='change-id'){const raw=f.elements.newId.value;payload.newId=teacherLoginLabel(teacherAuthEmail(raw));}
    else{password=f.elements.password.value;confirmation=f.elements.confirmation.value;clear();if(password!==confirmation||password.length<minimum||password.length>128)throw Error('비밀번호 두 값과 길이를 확인하고 다시 입력하세요.');payload.password=password;password='';confirmation='';}
    pending={requestId:payload.requestId};lock(true);status('변경을 저장하는 중…');
    const task=request(payload);await received(await task);
   }catch(error){
    if(!current())return;
    if(pending){
     if(errors[error?.code??error?.message]){pending=null;status(message(error));}
     else await received({state:'unknown',requestId:pending.requestId});
    }else status(error.message==='비밀번호 두 값과 길이를 확인하고 다시 입력하세요.'?error.message:message(error));
   }finally{password='';confirmation='';if(payload&&'password'in payload)payload.password='';clear();lock(false);}
  };
 }
 try{
  model=await request({action:'preview',...target});if(!current())return;
  if(model.kind!==target.kind||!model.userId)throw Error('INELIGIBLE_ACCOUNT');
  if(model.blocked){
   if(model.pendingRequestId){pending={requestId:model.pendingRequestId};await received({state:'unknown',requestId:model.pendingRequestId});}
   else status('다른 관리자의 미확인 변경이 있습니다. 먼저 해당 작업의 처리 상태를 확인해야 합니다.');
  }else{form();status('대상과 관리자 권한을 확인했습니다.');}
 }catch(e){status(message(e));}
 return {dispose};
}
