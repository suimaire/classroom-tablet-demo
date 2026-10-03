import {friendly} from './api.js?v=20261002-students-1';
import {validateRoster} from './model.js?v=20261004-formula-1';
export const sameClass=(a,b)=>['schoolYear','term','grade','classNumber','section'].every(k=>a[k]!==undefined&&String(a[k])===String(b[k]));
export function mergeSchoolClass(existing,incoming,newId=()=>crypto.randomUUID()){
 const all=existing.filter(s=>s.active!==false).map(({id,number,name})=>({id,number,name})), byNumber=new Map(existing.map(s=>[s.number,s]));
 const changes={added:[],updated:[],same:[],preserved:all.filter(s=>!incoming.some(x=>x.number===s.number)),removed:[]};
 for(const s of incoming){const old=byNumber.get(s.number);if(old?.active===false)throw Error('비활성 학생과 학번이 충돌합니다. 해당 학급에서 복원 여부를 먼저 확인하세요.');if(old){if(old.name===s.name)changes.same.push(s);else{changes.updated.push({number:s.number,before:old.name,name:s.name});all.find(x=>x.id===old.id).name=s.name;}}else{const value={id:newId(),number:s.number,name:s.name};all.push(value);changes.added.push(value);}}
 validateRoster(all);if(new TextEncoder().encode(JSON.stringify(all)).length>200000)throw Error('학급 명렬이 서버 크기 제한 200KB를 넘습니다.');return {rows:all,changes};
}
const complete=(snapshot,rows)=>rows.every(s=>snapshot.students.some(x=>x.active!==false&&x.id===s.id&&x.number===s.number&&x.name===s.name));
export function createSchoolImport({rpc,newId=()=>crypto.randomUUID(),onChange=()=>{}}){
 let entries=[],busy=false,stopped=false;
 const emit=()=>onChange();
 return {get entries(){return entries;},get busy(){return busy;},get pending(){return entries.some(e=>e.status==='unknown'||e.status==='creating');},
 stop(){stopped=true;emit();},
 clear(){if(busy||this.pending)throw Error('결과 확인을 먼저 완료하세요.');entries=[];emit();},
 async prepare(groups,targets){if(busy||this.pending)throw Error('진행 중인 작업 결과를 먼저 확인하세요.');busy=true;entries=[];emit();try{
 const catalog=await rpc('hafs_my_courses'),scopes=targets.some(t=>t.create)?await rpc('hafs_class_creation_options'):[];
 const used=new Set(),quota=new Map();const prepared=[];
 for(let i=0;i<groups.length;i++){const group=groups[i],target=targets[i];if(!target)throw Error('모든 학급의 대상을 선택하세요.');let e={group,target,status:'ready',error:'',requestId:newId()};
 if(target.create){if(catalog.some(c=>sameClass(c,group)))throw Error('이미 존재하는 학급은 새로 만들 수 없습니다. 대상 학급을 선택하세요.');const scope=scopes.find(s=>s.id===target.scopeId);const n=(quota.get(target.scopeId)||0)+1;quota.set(target.scopeId,n);if(!scope||scope.remaining<n||group.schoolYear<scope.yearFrom||group.schoolYear>scope.yearTo||Date.parse(scope.expiresAt)<=Date.now())throw Error('학급 생성 권한·학년도·할당량을 확인하세요.');e.scopeLabel=scope.label;e.expiresAt=scope.expiresAt;e.version=null;e.courseId=null;Object.assign(e,mergeSchoolClass([],group.students,newId));}
 else{const c=catalog.find(c=>c.id===target.courseId&&c.role==='admin');if(!c||used.has(c.id))throw Error('관리 권한이 없거나 여러 반을 같은 학급에 연결했습니다.');if(catalog.some(x=>sameClass(x,group)&&x.role!=='admin')&&!sameClass(c,group))throw Error('접근 권한이 없는 기존 학급과 충돌합니다.');used.add(c.id);e.courseId=c.id;e.courseName=c.name;const s=await rpc('hafs_admin_roster',{p_course:c.id});e.version=s.version;Object.assign(e,mergeSchoolClass(s.students,group.students,newId));}prepared.push(e);}
 entries=prepared;
 }finally{busy=false;emit();}},
 async run(){if(busy||!entries.length)return;busy=true;stopped=false;emit();try{
 for(const e of entries){if(stopped)break;if(e.status==='done')continue;if(e.status==='failed')break;
 try{
 if(!e.courseId){e.status='creating';emit();const {students,...payload}=e.group;const created=await rpc('hafs_create_class',{p_scope:e.target.scopeId,p_request:e.requestId,p_payload:payload});e.courseId=created.id;const fresh=await rpc('hafs_admin_roster',{p_course:e.courseId});if(fresh.students.length)throw Error('생성된 학급 명렬이 변경되었습니다. 새로 검토하세요.');e.version=fresh.version;e.status='ready';}
 // Verify authorization and current contents before any replacement or uncertain retry.
 const catalog=await rpc('hafs_my_courses');if(!catalog.some(c=>c.id===e.courseId&&c.role==='admin'))throw Error('NOT_AUTHORIZED');
 const fresh=await rpc('hafs_admin_roster',{p_course:e.courseId});
 if(e.version===null){if(fresh.students.length)throw Error('STALE_VERSION: 생성된 학급 명렬을 다시 검토하세요.');e.version=fresh.version;}
 if(complete(fresh,e.rows)){e.status='done';e.error='';emit();continue;}
 if(fresh.version!==e.version)throw Error('STALE_VERSION: 학급 자료가 변경되었습니다. 완료된 반은 유지하고 파일을 다시 검토하세요.');
 if(stopped){e.status='ready';emit();break;}
 e.status='unknown';emit();await rpc('hafs_replace_roster',{p_course:e.courseId,p_expected:e.version,p_students:e.rows});e.status='done';e.error='';emit();
 }catch(error){const raw=error.message||String(error);if(e.status!=='unknown'&&e.status!=='creating'||/STALE_VERSION|NOT_AUTHORIZED|AUTH_USER_INACTIVE|INVALID_|DUPLICATE_|CLASS_LIMIT|CLASS_ALREADY|CLASS_YEAR/.test(raw)||error.status>=400&&error.status<500)e.status='failed';e.error=friendly(error);emit();break;}
 }
 }finally{busy=false;emit();}}
 };
}
