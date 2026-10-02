// Pure geometry, matching and guarded upload helpers. No OCR, network or storage.
export const MAX_SHEET_BYTES=15*1024*1024, MAX_REGIONS=100, MAX_PHOTO_BATCH=40;
export function sheetFileKind(file){
  if(!file||file.size<=0||file.size>MAX_SHEET_BYTES)throw Error('사진 명렬표는 15MB 이하 파일을 선택하세요.');
  if(file.type==='application/pdf'||(!file.type&&/\.pdf$/i.test(file.name)))return 'pdf';
  if(['image/jpeg','image/png','image/webp'].includes(file.type)||(!file.type&&/\.(jpe?g|png|webp)$/i.test(file.name)))return 'image';
  throw Error('JPEG·PNG·WebP 또는 PDF 파일을 선택하세요. 한글·워드 파일은 PDF로 저장한 뒤 선택하세요.');
}
export function normalizedRegion(r){
  const value=Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(r[k])]));
  if(Object.values(value).some(n=>!Number.isFinite(n))||value.x<0||value.y<0||value.width<=0||value.height<=0||value.x+value.width>100.000001||value.y+value.height>100.000001)throw Error('사진 영역은 원본 안에 있어야 하며 너비·높이는 0보다 커야 합니다.');
  return value;
}
export function makeSheetGrid({rows,cols,bounds={x:0,y:0,width:100,height:100},inset={x:10,y:5,width:80,height:70}}){
  rows=Number(rows);cols=Number(cols);
  if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<1||cols<1||rows>20||cols>20||rows*cols>MAX_REGIONS)throw Error('행·열은 1~20, 전체 칸은 100개 이하로 입력하세요.');
  const b=normalizedRegion(bounds),c=normalizedRegion(inset);
  return Array.from({length:rows*cols},(_,i)=>({key:`grid-${i+1}`,label:`${Math.floor(i/cols)+1}행 ${i%cols+1}열`,x:b.x+(i%cols+c.x/100)*b.width/cols,y:b.y+(Math.floor(i/cols)+c.y/100)*b.height/rows,width:b.width/cols*c.width/100,height:b.height/rows*c.height/100,id:'',skip:false}));
}
export function dragRegion(a,b){return normalizedRegion({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)});}
export function cropPixels(region,width,height){
  const r=normalizedRegion(region);if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw Error('원본 크기를 확인할 수 없습니다.');
  const x=Math.floor(r.x/100*width),y=Math.floor(r.y/100*height),right=Math.min(width,Math.ceil((r.x+r.width)/100*width)),bottom=Math.min(height,Math.ceil((r.y+r.height)/100*height));
  if(right-x<4||bottom-y<4)throw Error('사진 영역이 너무 작습니다. 얼굴 전체를 포함해 다시 지정하세요.');
  return {x,y,width:right-x,height:bottom-y};
}
export function photoMapping(regions,students){
  const roster=new Map(students.filter(s=>s.active!==false).map(s=>[s.id,s])),seen=new Set(),errors=[],selected=[];
  let skipped=0,unassigned=0;
  if(!roster.size)errors.push('등록된 재적 학생이 없습니다. 명렬 관리에서 학번·이름을 먼저 등록하세요.');
  if(!regions.length)errors.push('사진 영역을 먼저 만드세요.');
  if(regions.length>MAX_REGIONS)errors.push('사진 영역은 100개 이하로 지정하세요.');
  for(const [i,r] of regions.entries()){
    if(r.skip){skipped++;continue;}
    try{normalizedRegion(r);}catch(e){errors.push(`${i+1}번: ${e.message}`);}
    if(!r.id){unassigned++;continue;}
    if(!roster.has(r.id)){errors.push(`${i+1}번: 현재 명렬에 없는 학생입니다.`);continue;}
    if(seen.has(r.id))errors.push(`중복 연결: ${roster.get(r.id).number} ${roster.get(r.id).name}`);
    seen.add(r.id);selected.push({...r,student:roster.get(r.id)});
  }
  if(unassigned)errors.push(`연결하지 않은 사진 ${unassigned}개: 학생을 선택하거나 ‘제외’를 표시하세요.`);
  if(!selected.length)errors.push('최소 한 명의 사진을 연결하세요.');
  if(selected.length>MAX_PHOTO_BATCH)errors.push('한 번에 최대 40명까지 업로드할 수 있습니다. 나머지 영역은 제외하고 다음 작업에서 연결하세요.');
  return {errors:[...new Set(errors)],selected,skipped,unassigned,missing:students.filter(s=>s.active!==false&&!seen.has(s.id))};
}
export function createSheetLoader({decode,isCurrent=()=>true}){
  let epoch=0,current=null,disposed=false;
  const clear=()=>{epoch++;current?.close();current=null;};
  return {async load(file,page=1){const mine=++epoch;current?.close();current=null;let source;try{source=await decode(file,page);}catch(e){if(disposed||mine!==epoch||!isCurrent())return null;throw e;}if(disposed||mine!==epoch||!isCurrent()){source.close();return null;}current=source;return source;},clear,dispose(){disposed=true;clear();}};
}
export function createPhotoUpload({courseId,version,students,getCurrent,preflight,save,isCurrent=()=>true}){
  let started=false;
  const live=()=>{const now=getCurrent();return isCurrent()&&now?.courseId===courseId&&now.version===version;};
  return {async upload(items,confirmed){
    if(!confirmed)throw Error('최종 미리보기에서 학급·학생·사진을 확인하고 확인란을 선택하세요.');
    if(started)throw Error('이미 시작한 작업입니다. 저장 결과를 확인한 뒤 새 작업을 시작하세요.');
    if(!live())throw Error('학급 또는 자료가 변경되었습니다. 새로고침한 후 사진을 다시 검토하세요.');
    const checked=photoMapping(items,students);if(checked.errors.length)throw Error(checked.errors.join(' '));
    if(checked.selected.some(p=>typeof p.data!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.data)||p.data.length>100023))throw Error('축소한 JPEG 미리보기를 다시 만드세요.');
    started=true;let done=0,expected=version,attempted=false;
    try{
      const fresh=await preflight();
      if(!live()||fresh?.version!==version||checked.selected.some(p=>!fresh.students?.some(s=>s.id===p.id&&s.active!==false&&s.number===p.student.number&&s.name===p.student.name)))throw Error('서버 명렬이 변경되었습니다. 새로고침한 후 다시 검토하세요.');
      for(const p of checked.selected){
        if(!live())throw Error('학급 화면을 떠나 남은 업로드를 중지했습니다.');
        attempted=true;expected=await save({p_course:courseId,p_student:p.id,p_expected:expected,p_data:p.data});done++;attempted=false;
        if(!Number.isSafeInteger(expected))throw Error('저장 버전을 확인할 수 없습니다.');
      }
      return {done,complete:true,unknown:false};
    }catch(error){return {done,complete:false,unknown:attempted,error};}
  }};
}
