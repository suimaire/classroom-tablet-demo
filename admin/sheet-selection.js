import {listRosterSheets} from './excel.js?v=20261003-school-1';
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function chooseRosterSheet(data){
 const sheets=listRosterSheets(data),visible=sheets.filter(s=>!s.hidden);
 if(!visible.length)throw Error('표시된 시트가 없습니다. 가져올 시트를 파일에서 표시한 후 다시 선택하세요.');
 if(sheets.length===1)return visible[0].name;
 const dialog=document.createElement('dialog');
 dialog.innerHTML=`<h2>가져올 시트 선택</h2><p>선택한 시트만 읽습니다. 숨김 시트는 제외됩니다.</p><ul>${sheets.map(s=>`<li>${escape(s.name)} · ${s.hidden?'숨김 (제외)':'표시'}</li>`).join('')}</ul><label>시트<select>${visible.map((s,i)=>`<option value="${i}">${escape(s.name)}</option>`).join('')}</select></label><div class="dialog-actions"><button data-cancel>취소</button><button data-select class="primary">이 시트 가져오기</button></div>`;
 document.body.append(dialog);dialog.showModal();
 return new Promise((resolve,reject)=>{let value;dialog.querySelector('[data-select]').onclick=()=>{value=visible[+dialog.querySelector('select').value].name;dialog.close();};dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{dialog.remove();if(value)resolve(value);else reject(Error('시트 선택을 취소했습니다.'));},{once:true});});
}
