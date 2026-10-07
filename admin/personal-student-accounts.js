import {safeAccountList,createMissingAccounts,validateResetPassword} from './personal-student-model.js';
const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stateLabel={uncreated:'미생성',missing:'미생성',reserved:'생성 확인 중',password_required:'첫 비밀번호 변경 필요',active:'사용 중',password_changing:'변경 확인 중',resetting:'재설정 확인 중',disabled:'사용 중지'};
const errorMessage=error=>{
 const code=error?.code??error?.message??'';
 if(/NOT_AUTHORIZED|ADMIN_REQUIRED/.test(code))return '관리자만 개인 계정을 관리할 수 있습니다.';
 if(/PGRST202|NOT_FOUND/.test(code))return '개인 계정 서버 기능이 아직 준비되지 않았습니다.';
 if(/INVALID_PASSWORD|WEAK_PASSWORD/.test(code))return '비밀번호 형식을 확인하세요.';
 return '결과를 확인하지 못했습니다. 목록을 새로고침하여 계정 상태를 확인하세요.';
};
export function mountPersonalStudentAccounts(root,{request,isCurrent=()=>true,loadConfig=async()=>{const r=await fetch(new URL('../my-records/config.json',import.meta.url),{cache:'no-store'});if(!r.ok)throw Error('CONFIG');return r.json();}}){
 let model=null,schoolYear=null,busy=false,disposed=false,stopping=false,epoch=0,resetNumber=null,resetUncertain=false;
 const current=()=>!disposed&&isCurrent(),q=selector=>root.querySelector(selector);
 const clear=()=>root.querySelectorAll('input[type=password]').forEach(input=>input.value='');
 const status=text=>{if(current()&&q('[data-personal-status]'))q('[data-personal-status]').textContent=text;};
 const lock=value=>{busy=value;if(current()){root.querySelectorAll('button,input').forEach(input=>input.disabled=value);if(q('[data-personal-stop]'))q('[data-personal-stop]').disabled=!value;if(resetUncertain)root.querySelectorAll('[data-personal-reset]').forEach(button=>button.disabled=true);if(!value&&model&&!model.accounts.some(account=>!account.hasAccount))q('[data-personal-create]')?.querySelectorAll('button,input').forEach(input=>input.disabled=true);}};
 function draw(){
  if(!current()||!model)return;clear();resetNumber=null;
  const existing=model.accounts.filter(a=>a.hasAccount).length,missing=model.eligibleCount-existing;
  root.innerHTML=`<section class="panel"><h2>1학년 개인 계정</h2><p>${schoolYear}학년도 · 현재 1학년 명렬에 등록된 학생의 본인 발표 기록용 계정입니다. 반대표도 개인 계정을 별도로 사용합니다.</p><div class="stats"><div class="stat"><small>대상 학생</small><strong>${model.eligibleCount}명</strong></div><div class="stat"><small>개인 계정 있음</small><strong>${existing}명</strong></div><div class="stat"><small>생성 대상</small><strong>${missing}명</strong></div></div><p>학생 로그인 ID는 학번 5자리입니다. 개인 계정은 자리표 제출 계정·교사 계정과 별도로 관리하며 첫 로그인에 비밀번호 변경이 필요합니다.</p><form data-personal-create><label>초기 비밀번호 접두<input name="prefix" type="password" autocomplete="off" maxlength="67" required ${missing?'':'disabled'}></label><p class="muted">직접 입력한 접두 뒤에 각 학생의 학번을 붙입니다. 합친 비밀번호는 6자 이상, 72바이트 이하여야 합니다. 다른 학생의 초기 비밀번호를 추측할 수 있으므로 사용 전에 학생에게 직접 전달하고 바로 변경하도록 안내하세요. 입력값은 저장하지 않습니다.</p><label><input name="confirm" type="checkbox" required ${missing?'':'disabled'}> 현재 목록의 미생성 개인 계정 ${missing}개를 생성합니다. 기존 계정의 비밀번호는 변경하지 않습니다.</label><button type="submit" class="primary" ${missing?'':'disabled'}>미생성 개인 계정 일괄 생성</button><button type="button" data-personal-stop disabled>남은 생성 중단</button></form><div class="toolbar"><button type="button" data-personal-refresh>목록 새로고침</button><a href="../my-records/" target="_blank" rel="noopener">학생 개인 기록 화면</a></div><p data-personal-status role="status" aria-live="polite"></p><div data-personal-reset-panel></div><div class="table-wrap"><table><thead><tr><th>학번</th><th>연결 수업</th><th>개인 계정 상태</th><th>관리</th></tr></thead><tbody>${model.accounts.map(account=>`<tr><td>${h(account.studentNumber)}</td><td>${account.courseIds.length}개</td><td>${h(stateLabel[account.state]??'상태 확인 필요')}${account.hasAccount&&account.passwordChangeRequired&&account.state==='active'?' · 비밀번호 변경 필요':''}</td><td>${account.hasAccount&&['active','password_required'].includes(account.state)?`<button type="button" data-personal-reset="${h(account.studentNumber)}">비밀번호 재설정</button>`:'—'}</td></tr>`).join('')}</tbody></table></div></section>`;
 }
 async function refresh(){
  if(busy||!current())return;lock(true);const own=++epoch;
  try{
   schoolYear??=(await loadConfig()).schoolYear;if(!Number.isInteger(schoolYear)||schoolYear<2020||schoolYear>2100)throw Error('CONFIG');
   const next=await request({action:'list',schoolYear});if(!current()||own!==epoch)return;model=safeAccountList(next,schoolYear);resetUncertain=false;draw();status('현재 대상과 개인 계정 상태를 확인했습니다.');
  }finally{if(current()&&own===epoch)lock(false);}
 }
 function resetForm(studentNumber){
  clear();resetNumber=studentNumber;q('[data-personal-reset-panel]').innerHTML=`<section class="panel"><h3>${h(studentNumber)} 개인 계정 비밀번호 재설정</h3><p>본인 기록용 개인 계정에만 적용됩니다. 학생은 재설정 후 새 비밀번호를 다시 변경해야 합니다. 재설정 비밀번호는 6자 이상, 72바이트 이하로 입력하세요.</p><form data-personal-reset-form><label>재설정 비밀번호<input name="password" type="password" autocomplete="new-password" minlength="6" maxlength="72" required></label><label>재설정 비밀번호 확인<input name="confirmation" type="password" autocomplete="new-password" minlength="6" maxlength="72" required></label><label><input name="confirm" type="checkbox" required> ${h(studentNumber)} 학생의 개인 계정 비밀번호를 재설정합니다.</label><button type="submit" class="primary">입력한 비밀번호로 재설정</button><button type="button" data-personal-reset-cancel>취소</button></form></section>`;q('[data-personal-reset-panel] input[type=password]').focus();
 }
 async function onSubmit(event){
  const form=event.target;if(!form.matches('[data-personal-create],[data-personal-reset-form]'))return;event.preventDefault();
  if(busy||!current()||!model){clear();return;}if(!form.reportValidity())return;
  if(form.matches('[data-personal-create]')){
   let prefix=form.elements.prefix.value;clear();stopping=false;lock(true);status('개인 계정을 최대 25개씩 생성하는 중입니다…');
   try{
    const pending=createMissingAccounts({model,prefix,request,isCurrent:()=>current()&&!stopping,onProgress:progress=>status(`${progress.processed}/${progress.target}개 확인 · 신규 ${progress.created}개 생성`)});prefix='';
    const result=await pending;if(!current())return;
    if(result.uncertain){status('일부 계정의 생성 결과가 미확인입니다. 남은 생성을 중단했습니다. 목록을 새로고침한 후 상태를 확인하세요.');}
    else if(result.stopped){status('남은 계정 생성을 중단했습니다. 목록을 새로고침하여 처리된 계정을 확인하세요.');}
    else{lock(false);await refresh();status(`신규 개인 계정 ${result.created}개를 생성했습니다. 기존 계정은 그대로 유지했습니다.`);}
   }catch(error){status(error?.message?.includes('비밀번호')||error?.message?.includes('접두')?error.message:errorMessage(error));}
   finally{prefix='';clear();if(current())lock(false);}
  }else{
   let password=form.elements.password.value,confirmation=form.elements.confirmation.value;clear();let payload;
   try{
    validateResetPassword(password);if(password!==confirmation)throw Error('두 비밀번호를 같은 값으로 입력하세요.');
    payload={action:'reset',schoolYear,studentNumber:resetNumber,requestId:crypto.randomUUID(),password};password='';confirmation='';lock(true);status('개인 계정 비밀번호를 재설정하는 중입니다…');
    const result=await request(payload);if(!current())return;
    if(result?.state!=='password_required'||result.requiresSignIn!==true)throw Error('RESET_UNCONFIRMED');
    lock(false);await refresh();status('개인 계정 비밀번호를 재설정했습니다. 입력한 비밀번호를 학생에게 직접 전달하세요.');
   }catch(error){if(payload&&current()){resetUncertain=true;resetNumber=null;q('[data-personal-reset-panel]').replaceChildren();}status(/^(초기 비밀번호|재설정 비밀번호|두 비밀번호)/.test(error?.message??'')?error.message:errorMessage(error));}
   finally{password='';confirmation='';if(payload)payload.password='';clear();if(current())lock(false);}
  }
 }
 async function onClick(event){
  const button=event.target.closest('button');if(!button||!current())return;
  if(button.hasAttribute('data-personal-stop')){stopping=true;clear();status('현재 요청을 확인한 뒤 남은 생성을 중단합니다.');return;}
  if(busy)return;
  if(button.hasAttribute('data-personal-refresh')){try{await refresh();}catch(error){status(errorMessage(error));}}
  else if(button.dataset.personalReset)resetForm(button.dataset.personalReset);
  else if(button.hasAttribute('data-personal-reset-cancel')){clear();resetNumber=null;q('[data-personal-reset-panel]').replaceChildren();}
 }
 root.innerHTML='<section class="panel"><h2>1학년 개인 계정</h2><p data-personal-status role="status" aria-live="polite">현재 학년도 대상과 계정 상태를 확인하는 중입니다…</p></section>';
 root.addEventListener('submit',onSubmit);root.addEventListener('click',onClick);
 return {refresh,dispose(){disposed=true;stopping=true;epoch++;clear();model=null;root.removeEventListener('submit',onSubmit);root.removeEventListener('click',onClick);}};
}
