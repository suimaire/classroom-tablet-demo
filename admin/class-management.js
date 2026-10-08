import {friendly} from './api.js?v=20261008-session-1';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const terminal=new Set(['INVALID_CLASS','CLASS_YEAR_NOT_ALLOWED','CLASS_ALREADY_EXISTS','CLASS_LIMIT_REACHED','IDEMPOTENCY_CONFLICT','NOT_AUTHORIZED','AUTH_USER_INACTIVE','PGRST202']);
const messages={PGRST202:'필요한 학급 생성 서버 기능이 아직 배포되지 않았습니다.',INVALID_CLASS:'학년도·학기·학년·반·분반을 확인하세요.',CLASS_YEAR_NOT_ALLOWED:'생성 권한에 포함된 학년도를 선택하세요.',CLASS_ALREADY_EXISTS:'같은 학년도·학기·학년·반·분반이 이미 있습니다. 상단 새로고침을 누르고 학급 선택 목록을 확인하세요.',CLASS_LIMIT_REACHED:'허용된 학급 생성 수를 모두 사용했습니다. 관리자에게 확인하세요.',IDEMPOTENCY_CONFLICT:'직전 요청 내용과 다릅니다. 학급 목록을 확인한 뒤 다시 시작하세요.',NOT_AUTHORIZED:'학급 생성 권한이 없거나 만료되었습니다. 다시 로그인하거나 관리자에게 확인하세요.'};
const codeFor=e=>{if(e?.status===404&&/Could not find the function/i.test(e?.message||''))return 'PGRST202';const text=e?.code||e?.message||'';return [...terminal].find(k=>text===k||text.includes(k))||text;};
export function normalizeClass(values){
 if(!values||typeof values!=='object')throw Error('INVALID_CLASS');
 const integer=(key,min,max)=>{const raw=values[key];if((typeof raw!=='string'&&typeof raw!=='number')||!/^\d+$/.test(String(raw)))throw Error('INVALID_CLASS');const n=Number(raw);if(!Number.isInteger(n)||n<min||n>max)throw Error('INVALID_CLASS');return n;};
 const section=typeof values.section==='string'?values.section.trim().toUpperCase():null;
 if(section===null||!/^[A-Z0-9]{0,6}$/.test(section))throw Error('INVALID_CLASS');
 return {schoolYear:integer('schoolYear',2000,2199),term:integer('term',1,2),grade:integer('grade',1,12),classNumber:integer('classNumber',1,99),section};
}
export const className=p=>`${p.schoolYear}학년도 ${p.term}학기 · ${p.grade}-${p.classNumber}${p.section}`;
export function createClassController({list,create,onCreated=()=>{},onChange=()=>{},isCurrent=()=>true,newId=()=>crypto.randomUUID()}){
 let state={scopes:null,review:null,pending:null,created:null,busy:false,message:''},disposed=false,epoch=0;
 const current=n=>!disposed&&isCurrent()&&n===epoch;
 const notify=()=>{if(!disposed&&isCurrent())onChange(structuredClone(state));};
 async function run(work){if(disposed||state.busy||!isCurrent())return;const n=++epoch;state.busy=true;notify();try{await work(n);}catch(e){if(current(n)){const code=codeFor(e);if(terminal.has(code)){state.pending=null;state.review=null;}state.message=(state.pending?'생성 결과가 아직 확인되지 않았습니다. 동일 요청으로 다시 확인하세요. ':'')+(messages[code]||friendly(e));}}finally{if(current(n)){state.busy=false;notify();}}}
 const open=()=>run(async n=>{if(!state.created)return;try{await onCreated(structuredClone(state.created));}catch(e){if(current(n))state.message='학급은 생성됐지만 화면을 열지 못했습니다. 다시 열거나 상단 새로고침을 누르고 학급 선택 목록을 확인하세요. '+friendly(e);}});
 return {
  getState:()=>structuredClone(state),
  refresh:()=>run(async n=>{if(state.pending)return;const scopes=await list();if(current(n)){state.scopes=scopes;state.review=null;state.message=scopes.length?'생성할 학급 정보를 입력하세요.':'현재 계정에 활성화된 학급 생성 권한이 없습니다.';}}),
  review:(scopeId,values)=>{if(disposed||state.busy||state.pending||!isCurrent())return;const payload=normalizeClass(values),scope=state.scopes?.find(s=>s.id===scopeId);if(!scope||!scope.remaining||payload.schoolYear<scope.yearFrom||payload.schoolYear>scope.yearTo)throw Error('허용된 학년도와 남은 생성 수를 확인하세요.');state.review={scopeId,payload};state.created=null;state.message='학급 정보와 관리 권한 만료일을 검토하세요.';notify();},
  cancel:()=>{if(disposed||state.busy||state.pending||!isCurrent())return;state.review=null;state.message='입력을 다시 확인하세요.';notify();},
  submit:()=>{if(disposed||state.busy||!isCurrent()||(!state.review&&!state.pending))return Promise.resolve();if(!state.pending)state.pending={...structuredClone(state.review),requestId:newId()};return run(async n=>{const result=await create(structuredClone(state.pending));if(!current(n))return;state.pending=null;state.review=null;state.created=result;state.message='빈 학급을 생성했습니다. 명렬·사진·자리표와 교사 권한을 설정하세요.';try{await onCreated(structuredClone(result));}catch(e){if(current(n))state.message+=' 학급 화면을 열지 못했습니다. 아래 버튼으로 다시 여세요.';}});},
  open,
  dispose:()=>{disposed=true;epoch++;state={scopes:null,review:null,pending:null,created:null,busy:false,message:''};}
 };
}
export function mountClassManagement(root,options){
 let view,controller;
 const current=()=>options.isCurrent?.()!==false;
 const expires=s=>new Date(s.expiresAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
 const defaults={schoolYear:new Date().getFullYear(),term:new Date().getMonth()<7?1:2,grade:1,classNumber:1,section:''};
 let draft={...defaults},scopeId='';
 function draw(state){if(!current())return;view=state;const {scopes,review,pending,created,busy,message}=state;
 if(busy&&root.querySelector('[data-class-panel]')){root.querySelectorAll('button,input,select').forEach(n=>n.disabled=true);return;}
 const selected=scopes?.find(s=>s.id===scopeId)||scopes?.[0];if(selected){scopeId=selected.id;if(draft.schoolYear<selected.yearFrom||draft.schoolYear>selected.yearTo)draft.schoolYear=selected.yearFrom;}
 const reviewScope=scopes?.find(s=>s.id===(pending||review)?.scopeId),intent=(pending||review)?.payload;
 root.innerHTML=`<section class="panel" data-class-panel><h2>학급 추가</h2><p>학년도·학기·학년·반을 지정해 빈 학급을 만듭니다. 학생·사진·교사 권한은 생성 후 직접 등록합니다.</p>${scopes===null?'<p>생성 권한을 확인 중입니다.</p>':!scopes.length?'<p class="notice">이 계정에는 활성화된 학급 생성 권한이 없습니다.</p>':intent?`<div class="notice"><h3>${escape(className(intent))}</h3><p>${escape(reviewScope?.label||'')} · 생성자에게만 관리자 권한 부여<br>관리 권한 만료: ${reviewScope?escape(expires(reviewScope)):'서버에서 확인'} (한국 시간)</p><p>명렬·사진·발표 기록은 빈 상태이며, 교사는 자동으로 연결되지 않습니다.</p></div>${pending?'<p class="notice warning">직전 요청의 결과가 미확인입니다. 새 요청 대신 동일 요청으로 확인합니다. 화면을 이동했다면 생성된 학급 목록을 먼저 확인하세요.</p>':'<label><input type="checkbox" data-confirm> 학급 정보와 관리 권한 만료일을 확인했습니다.</label>'}<div class="toolbar"><button type="button" data-create class="primary">${pending?'동일 요청으로 생성 확인':'검토한 학급 생성'}</button>${pending?'':'<button type="button" data-cancel>수정</button>'}</div>`:created?`<p class="notice">${escape(created.name)} · 생성 완료</p><button type="button" data-open class="primary">생성한 학급 열기</button>`:`<form data-class-form><div class="class-fields">${scopes.length>1?`<label>학교·작업 공간<select name="scope">${scopes.map(s=>`<option value="${escape(s.id)}" ${s.id===scopeId?'selected':''}>${escape(s.label)}</option>`).join('')}</select></label>`:`<p>${escape(selected.label)}</p>`}<label>학년도<select name="schoolYear">${Array.from({length:selected.yearTo-selected.yearFrom+1},(_,i)=>selected.yearFrom+i).map(y=>`<option ${y===Number(draft.schoolYear)?'selected':''}>${y}</option>`).join('')}</select></label><label>학기<select name="term"><option value="1" ${Number(draft.term)===1?'selected':''}>1학기</option><option value="2" ${Number(draft.term)===2?'selected':''}>2학기</option></select></label><label>학년<input name="grade" type="number" min="1" max="12" step="1" required value="${escape(draft.grade)}"></label><label>반<input name="classNumber" type="number" min="1" max="99" step="1" required value="${escape(draft.classNumber)}"></label><label>분반 (선택, 예: A)<input name="section" maxlength="6" pattern="[A-Za-z0-9]{0,6}" value="${escape(draft.section)}"></label></div><p class="muted">생성 가능 ${selected.remaining}개 · 관리자 권한 만료 ${escape(expires(selected))} (한국 시간)</p><button type="submit" class="primary" ${selected.remaining?'':'disabled'}>생성 내용 검토</button></form>`}<p data-class-status role="status" aria-live="polite">${escape(message)}</p>${!pending&&!review&&!created?'<button type="button" data-refresh>권한 새로고침</button>':''}</section>`;
 if(busy)root.querySelectorAll('button,input,select').forEach(n=>n.disabled=true);
 }
 function stash(form){for(const key of Object.keys(defaults)){if(form.elements[key])draft[key]=form.elements[key].value;}if(form.elements.scope)scopeId=form.elements.scope.value;}
 function showError(e){root.querySelector('[data-class-status]').textContent=messages[codeFor(e)]||friendly(e);}
 function submit(e){if(!e.target.matches('[data-class-form]'))return;e.preventDefault();if(view?.busy||!current())return;const form=e.target;if(!form.reportValidity())return;stash(form);try{controller.review(scopeId,draft);}catch(e){showError(e);}}
 function change(e){const form=e.target.closest('[data-class-form]');if(!form)return;stash(form);if(e.target.name==='scope')draw(view);}
 async function click(e){const b=e.target.closest('button');if(!b||view?.busy||!current())return;if(b.hasAttribute('data-refresh'))await controller.refresh();else if(b.hasAttribute('data-cancel'))controller.cancel();else if(b.hasAttribute('data-open'))await controller.open();else if(b.hasAttribute('data-create')){if(!view.pending&&!root.querySelector('[data-confirm]')?.checked){showError(Error('확인란을 선택하세요.'));return;}await controller.submit();}}
 controller=createClassController({...options,onChange:draw});root.addEventListener('submit',submit);root.addEventListener('click',click);root.addEventListener('change',change);draw(controller.getState());
 return {refresh:()=>controller.refresh(),getState:()=>controller.getState(),dispose:()=>{controller.dispose();root.removeEventListener('submit',submit);root.removeEventListener('click',click);root.removeEventListener('change',change);}};
}
