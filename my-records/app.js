import {PersonalAPI,friendly} from './api.js';
import {RecordsSession} from './session.js';
import {h,formatDate} from './model.js';
const api=new PersonalAPI(),q=id=>document.getElementById(id);let session=null,available=false;
const status=(text,error=false)=>{q('status').textContent=text;q('status').classList.toggle('error',error);};
const clearPasswords=()=>document.querySelectorAll('input[type=password]').forEach(input=>input.value='');
function draw(){
 const phase=session?.phase??'signed-out';
 q('login-panel').hidden=phase!=='signed-out';q('change-panel').hidden=phase!=='change';q('records-panel').hidden=phase!=='ready';q('session-actions').hidden=phase==='signed-out';
 document.querySelectorAll('button').forEach(button=>button.disabled=!!session?.busy||!available);
 if(phase!=='ready'){q('records').replaceChildren();q('identity').textContent='';return;}
 const model=session.records;q('identity').textContent=`${model.schoolYear}학년도 · ${model.studentNumber}`;
 q('records').innerHTML=model.courses.length?model.courses.map(course=>`<article class="course-card"><div class="course-head"><h3>${h(course.name)}</h3><span class="count">${course.count}회</span></div><p class="course-meta">${course.schoolYear}학년도 ${course.term}학기 · ${course.grade}학년 ${course.classNumber}반${course.section?' · '+h(course.section):''}</p>${course.count?`<details><summary>발표 날짜 ${course.count}건 보기</summary><ol class="date-list">${[...course.eventDates].sort((a,b)=>Date.parse(b)-Date.parse(a)).map(date=>`<li><time datetime="${h(date)}">${h(formatDate(date))}</time></li>`).join('')}</ol></details>`:'<p class="muted">아직 발표 기록이 없습니다.</p>'}</article>`).join(''):'<div class="panel"><p>현재 학년도에 연결된 수업이 없습니다. 관리자에게 문의하세요.</p></div>';
}
q('login-form').onsubmit=async event=>{
 event.preventDefault();if(!available||session.busy){clearPasswords();return;}const number=q('student-number').value.trim();let password=q('login-password').value;clearPasswords();
 try{const signingIn=session.login(number,password);password='';draw();status('개인 계정을 확인하는 중입니다…');await signingIn;draw();status(session.phase==='change'?'첫 로그인입니다. 먼저 비밀번호를 변경하세요.':session.phase==='ready'?'본인 발표 기록을 불러왔습니다.':'로그아웃했습니다.');}
 catch(error){draw();status(friendly(error),true);}finally{password='';clearPasswords();}
};
q('change-form').onsubmit=async event=>{
 event.preventDefault();if(session?.busy){clearPasswords();return;}
 let current=q('current-password').value,password=q('new-password').value,confirmation=q('confirm-password').value;clearPasswords();
 try{const changing=session.changePassword(current,password,confirmation);current='';password='';confirmation='';draw();status('비밀번호를 변경하는 중입니다…');const result=await changing;draw();if(result?.requiresSignIn){q('login-password').focus();status('비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인하세요.');}}
 catch(error){draw();status(friendly(error),true);}finally{current='';password='';confirmation='';clearPasswords();}
};
q('refresh-records').onclick=async()=>{if(session?.busy)return;try{const reading=session.refresh();draw();status('본인 기록을 다시 확인하는 중입니다…');await reading;draw();status(session.phase==='change'?'비밀번호를 변경한 뒤 다시 로그인하세요.':'최신 기록을 불러왔습니다.');}catch(error){draw();status(friendly(error),true);}};
q('logout').onclick=async()=>{if(session?.busy)return;const leaving=session.logout();clearPasswords();draw();status('로그아웃했습니다.');await leaving;q('student-number').value='';};
window.addEventListener('pagehide',()=>{clearPasswords();session?.clear();draw();});
window.addEventListener('pageshow',event=>{if(event.persisted){clearPasswords();session?.clear();draw();status('개인 계정으로 다시 로그인하세요.');}});
try{if(location.hash)history.replaceState(null,'',location.pathname+location.search);const config=await api.init();session=new RecordsSession(api,config);available=true;q('login-year').textContent=`${config.schoolYear}학년도 · 1학년`;draw();status('개인 학번과 비밀번호로 로그인하세요.');}catch(error){clearPasswords();draw();status(friendly(error),true);}
