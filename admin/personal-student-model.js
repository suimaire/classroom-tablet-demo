const byteLength=value=>new TextEncoder().encode(value).length;
export function safeAccountList(raw,schoolYear){
 if(!raw||raw.schoolYear!==schoolYear||!Number.isSafeInteger(raw.eligibleCount)||!Array.isArray(raw.accounts)||raw.eligibleCount!==raw.accounts.length)throw Error('개인 계정 목록을 확인하지 못했습니다.');
 const seen=new Set(),accounts=raw.accounts.map(a=>{
  if(!a||typeof a.studentNumber!=='string'||!/^1\d{4}$/.test(a.studentNumber)||seen.has(a.studentNumber)||typeof a.hasAccount!=='boolean'||typeof a.passwordChangeRequired!=='boolean'||!Array.isArray(a.courseIds)||a.courseIds.some(id=>typeof id!=='string')||typeof a.state!=='string')throw Error('개인 계정 대상 정보를 확인하지 못했습니다.');
  seen.add(a.studentNumber);return {studentNumber:a.studentNumber,courseIds:[...a.courseIds],hasAccount:a.hasAccount,state:a.state,passwordChangeRequired:a.passwordChangeRequired};
 }).sort((a,b)=>a.studentNumber.localeCompare(b.studentNumber));
 return {schoolYear,eligibleCount:raw.eligibleCount,accounts};
}
export function validateInitialPassword(password){if(typeof password!=='string'||[...password].length<6||byteLength(password)>72||/[\u0000-\u001f\u007f]/.test(password))throw Error('초기 비밀번호는 6자 이상, 72바이트 이하이며 줄바꿈을 포함할 수 없습니다.');return password;}
export function validateResetPassword(password){validateInitialPassword(password);if([...password].length<6)throw Error('재설정 비밀번호는 6자 이상, 72바이트 이하로 입력하세요.');return password;}
export async function createMissingAccounts({model,prefix,request,isCurrent=()=>true,onProgress=()=>{},requestId=()=>crypto.randomUUID()}){
 const list=safeAccountList(model,model.schoolYear),missing=list.accounts.filter(a=>!a.hasAccount),summary={created:0,existing:list.accounts.length-missing.length,uncertain:false,stopped:false};
 try{
  if(typeof prefix!=='string'||!prefix)throw Error('초기 비밀번호 접두를 직접 입력하세요.');
  for(const account of missing)validateInitialPassword(prefix+account.studentNumber);
  for(let i=0;i<missing.length;i+=25){
   if(!isCurrent()){summary.stopped=true;break;}
   let payload={action:'create',schoolYear:list.schoolYear,requestId:requestId(),accounts:missing.slice(i,i+25).map(a=>({studentNumber:a.studentNumber,password:prefix+a.studentNumber}))};
   let result;
   try{result=await request(payload);}catch{summary.uncertain=true;break;}finally{for(const account of payload.accounts)account.password='';}
   const numbers=new Set(payload.accounts.map(a=>a.studentNumber)),results=result?.results;
   if(!Array.isArray(results)||results.length!==numbers.size||results.some(r=>!numbers.delete(r.studentNumber)||!['created','existing'].includes(r.status))||result.complete!==true){summary.uncertain=true;break;}
   summary.created+=results.filter(r=>r.status==='created').length;summary.existing+=results.filter(r=>r.status==='existing').length;
   if(isCurrent())onProgress({...summary,processed:Math.min(i+25,missing.length),target:missing.length});
  }
  return summary;
 }finally{prefix='';}
}
