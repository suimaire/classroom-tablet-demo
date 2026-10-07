import {personalAuthEmail,safeStatus,safeRecords,validatePasswordChange} from './model.js';
export class RecordsSession{
 constructor(api,config){this.api=api;this.config=config;this.phase='signed-out';this.status=null;this.records=null;this.busy=false;this.epoch=0;}
 async login(studentNumber,password){
  if(this.busy)return;
  personalAuthEmail(studentNumber,this.config);this.busy=true;const epoch=++this.epoch;this.records=null;this.status=null;this.phase='loading';
  try{const signingIn=this.api.signIn(studentNumber,password);password='';await signingIn;if(epoch!==this.epoch)return;await this.loadStatus(studentNumber,epoch);}
  catch(error){if(epoch===this.epoch){await this.logout();throw error;}}
  finally{password='';if(epoch===this.epoch)this.busy=false;}
 }
 async loadStatus(studentNumber,epoch){
  const raw=await this.api.status();if(epoch!==this.epoch)return;
  this.status=safeStatus(raw,this.config,studentNumber);this.records=null;
  if(this.status.passwordChangeRequired){if(this.status.state!=='password_required')throw Error('계정 변경 처리 중이거나 이용할 수 없는 상태입니다. 잠시 후 다시 로그인하세요.');this.phase='change';return;}
  if(this.status.state!=='active')throw Error('개인 계정이 이용 가능한 상태가 아닙니다. 관리자에게 문의하세요.');
  const records=await this.api.records();if(epoch!==this.epoch)return;this.records=safeRecords(records,this.status);this.phase='ready';
 }
 async refresh(){
  if(this.busy||this.phase!=='ready')return;this.busy=true;const epoch=this.epoch,number=this.status.studentNumber;this.records=null;this.phase='loading';
  try{await this.loadStatus(number,epoch);}catch(error){if(epoch===this.epoch){await this.logout();throw error;}}finally{if(epoch===this.epoch)this.busy=false;}
 }
 async changePassword(currentPassword,password,confirmation){
  if(this.busy||this.phase!=='change')return;
  validatePasswordChange(currentPassword,password,confirmation);this.busy=true;const epoch=this.epoch;let payload;
  try{
   payload={action:'change-password',requestId:crypto.randomUUID(),currentPassword,password};currentPassword='';password='';confirmation='';
   const result=await this.api.changePassword(payload);if(epoch!==this.epoch)return;
   if(result?.state!=='active'||result.requiresSignIn!==true)throw Error('변경 결과를 확인하지 못했습니다. 로그아웃 후 새 비밀번호로 다시 로그인하세요.');
   await this.logout();return {requiresSignIn:true};
  }finally{if(payload){payload.currentPassword='';payload.password='';}currentPassword='';password='';confirmation='';if(epoch===this.epoch)this.busy=false;}
 }
 async logout(){this.epoch++;this.phase='signed-out';this.records=null;this.status=null;this.busy=false;await this.api.logout();}
 clear(){this.epoch++;this.phase='signed-out';this.records=null;this.status=null;this.busy=false;this.api.clear();}
}
