// Display-only daily counts. Cumulative student records are never rewritten.
export const kstDay=value=>new Date(+new Date(value)+9*3600000).toISOString().slice(0,10);
export function displayParticipation(student,mode,dayData){
 if(mode!=='daily')return student;
 const daily=dayData?.counts?.find(row=>row.student_id===student.id);
 return {...student,count:dayData?(Number(daily?.count)||0):null,lastAt:daily?.last_at??null};
}
export function extraRecordMessage(result,today=kstDay(Date.now())){
 return `${result.day===today?'오늘':result.day} ${Number(result.count)}회 발표했습니다. 추가로 더 기록할까요?`;
}
// The native dialog provides focus trapping. Dismiss only this history dialog,
// and only when a pointer both starts and finishes outside its visible box.
export function wireStudentHistoryDismissal(dialog,onDismiss,isBusy=()=>false){
 let startedOutside=false;
 const outside=e=>{const r=dialog.getBoundingClientRect();return e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
 const down=e=>{startedOutside=outside(e);};
 const click=e=>{const dismiss=startedOutside&&outside(e);startedOutside=false;if(dismiss&&!isBusy())onDismiss();};
 const cancel=e=>{e.preventDefault();if(!isBusy())onDismiss();};
 dialog.addEventListener('pointerdown',down);dialog.addEventListener('click',click);dialog.addEventListener('cancel',cancel);
 return ()=>{dialog.removeEventListener('pointerdown',down);dialog.removeEventListener('click',click);dialog.removeEventListener('cancel',cancel);};
}
