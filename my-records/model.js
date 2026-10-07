const bytes=value=>new TextEncoder().encode(value).length;
const number=value=>typeof value==='string'&&/^1\d{4}$/.test(value);
export const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function personalAuthEmail(studentNumber,config){
 if(!number(studentNumber)||!Number.isInteger(config?.schoolYear)||config.schoolYear<2020||config.schoolYear>2100)throw Error('1학년 학번 5자리를 입력하세요.');
 const match=/^https:\/\/([a-z0-9-]+)\.supabase\.co$/.exec(config.supabaseUrl);
 if(!match)throw Error('개인 계정 연결 설정을 확인하세요.');
 return `${match[1]}.personal.${config.schoolYear}.${studentNumber}@students.invalid`;
}
export function safeStatus(raw,config,expectedNumber){
 if(!raw||raw.schoolYear!==config.schoolYear||!number(raw.studentNumber)||raw.studentNumber!==expectedNumber||typeof raw.passwordChangeRequired!=='boolean'||typeof raw.state!=='string')throw Error('개인 계정 정보를 확인하지 못했습니다. 다시 로그인하세요.');
 return {schoolYear:raw.schoolYear,studentNumber:raw.studentNumber,passwordChangeRequired:raw.passwordChangeRequired,state:raw.state};
}
export function safeRecords(raw,status){
 if(!raw||raw.schoolYear!==status.schoolYear||raw.studentNumber!==status.studentNumber||!Array.isArray(raw.courses))throw Error('본인 기록을 확인하지 못했습니다. 다시 로그인하세요.');
 const seen=new Set();
 const courses=raw.courses.map(c=>{
  if(!c||typeof c.courseId!=='string'||seen.has(c.courseId)||typeof c.name!=='string'||c.schoolYear!==status.schoolYear||c.grade!==1||!Number.isInteger(c.term)||!Number.isInteger(c.classNumber)||!Number.isSafeInteger(c.count)||c.count<0||!Array.isArray(c.eventDates)||c.count!==c.eventDates.length||c.eventDates.some(d=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(d)||!Number.isFinite(Date.parse(d))))throw Error('기록 형식을 확인하지 못했습니다. 새로고침하거나 관리자에게 문의하세요.');
  seen.add(c.courseId);
  return {courseId:c.courseId,name:c.name,schoolYear:c.schoolYear,term:c.term,grade:c.grade,classNumber:c.classNumber,section:typeof c.section==='string'?c.section:'',count:c.count,eventDates:[...c.eventDates]};
 });
 return {schoolYear:raw.schoolYear,studentNumber:raw.studentNumber,courses};
}
export function validatePasswordChange(current,password,confirmation){
 if(typeof current!=='string'||!current||bytes(current)>72||typeof password!=='string'||password!==confirmation||password===current||[...password].length<6||bytes(password)>72||/[\u0000-\u001f\u007f]/.test(password))throw Error('현재 비밀번호와 서로 일치하는 새 비밀번호를 확인하세요. 새 비밀번호는 기존과 다르게 6자 이상, 72바이트 이하로 입력하고 줄바꿈은 넣지 마세요.');
 return password;
}
export const formatDate=value=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
