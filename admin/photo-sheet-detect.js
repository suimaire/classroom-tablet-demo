// Local PDF structure only: no OCR, face identification, remote requests or learned templates.
const identity=[1,0,0,1,0,0];
export function multiply(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function axisAligned(m){return m.every(Number.isFinite)&&((Math.abs(m[1])<1e-7&&Math.abs(m[2])<1e-7)||(Math.abs(m[0])<1e-7&&Math.abs(m[3])<1e-7));}
function transformBounds(b,m){const points=[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]].map(([x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);return {x:Math.min(...points.map(p=>p[0])),y:Math.min(...points.map(p=>p[1])),width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),height:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))};}
function intersection(a,b){const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),right=Math.min(a.x+a.width,b.x+b.width),bottom=Math.min(a.y+a.height,b.y+b.height);return right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null;}
export function rectangularClip(paths){
  if(!Array.isArray(paths)||paths.length!==1)return false;
  const path=paths[0];if(!Array.isArray(path)&&!ArrayBuffer.isView(path))return false;
  const points=[];for(let i=0;i<path.length;){const code=path[i++];if(code===4){if(i!==path.length)return false;break;}if(code!==(points.length?1:0)||i+1>=path.length)return false;points.push([path[i++],path[i++]]);}
  if(points.length===5&&points[0].every((n,i)=>Math.abs(n-points[4][i])<.01))points.pop();
  if(points.length!==4||points.flat().some(n=>!Number.isFinite(n)))return false;
  return points.every((p,i)=>{const n=points[(i+1)%4];return (Math.abs(p[0]-n[0])<.01)!==(Math.abs(p[1]-n[1])<.01);});
}
export const normalizedName=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ');
export function photoCaption(text){const m=normalizedName(text).match(/^(\d{1,10})[.)]\s*([\p{L}][\p{L}\p{M} .'-]{0,49})$/u);return m?{number:m[1],name:normalizedName(m[2])}:null;}
/** Extract only number/name captions and geometry; phone/footer strings are discarded here. */
export function collectPhotoGeometry(operatorList,OPS,viewport,textItems){
  const page={x:0,y:0,width:viewport.width,height:viewport.height},stack=[],lines=[],images=[];let state={matrix:identity.slice(),clip:page,clipSupported:true,pendingClip:false},unsupportedImages=false;
  const matrix=()=>multiply(viewport.transform,state.matrix);
  function imageAt(local=identity){const transform=multiply(matrix(),local);if(!state.clipSupported||!axisAligned(transform))return;const raw=transformBounds([0,0,1,1],transform),visible=state.clip&&intersection(raw,state.clip);if(visible)images.push({...visible,raw});}
  for(let i=0;i<operatorList.fnArray.length;i++){
    const op=operatorList.fnArray[i],args=operatorList.argsArray[i];
    if(op===OPS.save){stack.push({...state,matrix:state.matrix.slice(),clip:state.clip&&{...state.clip}});continue;}
    if(op===OPS.restore){state=stack.pop()??{matrix:identity.slice(),clip:page,clipSupported:true,pendingClip:false};continue;}
    if(op===OPS.transform){state.matrix=multiply(state.matrix,args);continue;}
    if(op===OPS.clip||op===OPS.eoClip){state.pendingClip=true;continue;}
    if(op===OPS.constructPath){
      // Pinned PDF.js 6 packs paint operation, path and bounds in constructPath.
      const bounds=args?.[2];if(!bounds||bounds.length!==4){if(state.pendingClip)state.clipSupported=false;state.pendingClip=false;continue;}
      const r=transformBounds(bounds,matrix());
      if(state.pendingClip){state.clipSupported=state.clipSupported&&axisAligned(matrix())&&rectangularClip(args[1]);state.clip=state.clip&&intersection(state.clip,r);state.pendingClip=false;}
      if([OPS.stroke,OPS.closeStroke,OPS.fillStroke,OPS.eoFillStroke].includes(args[0])&&[r.x,r.y,r.width,r.height].every(Number.isFinite)){
        if(r.width<=.8&&r.height>8)lines.push({axis:'v',value:r.x+r.width/2,start:r.y,end:r.y+r.height});
        if(r.height<=.8&&r.width>8)lines.push({axis:'h',value:r.y+r.height/2,start:r.x,end:r.x+r.width});
      }
      continue;
    }
    if(op===OPS.paintImageXObject||op===OPS.paintInlineImageXObject)imageAt();
    else if(op===OPS.paintImageXObjectRepeat){const [_id,sx,sy,positions]=args;if(!positions||positions.length%2){unsupportedImages=true;continue;}for(let j=0;j<positions.length;j+=2)imageAt([sx,0,0,sy,positions[j],positions[j+1]]);}
    else if(op===OPS.paintInlineImageXObjectGroup)unsupportedImages=true;
  }
  const labels=[];
  for(const item of textItems){const caption=photoCaption(item.str);if(!caption||!item.transform)continue;const m=multiply(viewport.transform,item.transform),height=Math.hypot(m[2],m[3]);if(Math.abs(m[1])>.1||height<=0||!Number.isFinite(item.width))continue;labels.push({...caption,x:m[4],y:m[5]-height,width:item.width,height});}
  return {width:viewport.width,height:viewport.height,labels,lines,images,unsupportedImages};
}
function covers(line,value){return line.start<=value+.8&&line.end>=value-.8;}
function uniqueNear(values){const out=[];for(const n of values.sort((a,b)=>a-b))if(!out.some(v=>Math.abs(v-n)<.8))out.push(n);return out;}
function captionCell(label,geometry){
  const center=label.x+label.width/2,baseline=label.y+label.height;
  const xs=uniqueNear(geometry.lines.filter(l=>l.axis==='v'&&covers(l,baseline)).map(l=>l.value));
  const left=xs.filter(x=>x<center).at(-1),right=xs.find(x=>x>center);
  const ys=uniqueNear(geometry.lines.filter(l=>l.axis==='h'&&covers(l,center)).map(l=>l.value));
  const bottom=ys.filter(y=>y<=label.y+1.5).at(-1),top=ys.filter(y=>y<(bottom??0)-2).at(-1);
  if([left,right,top,bottom].some(x=>!Number.isFinite(x)))return null;
  const cell={x:left+.65,y:top+.65,width:right-left-1.3,height:bottom-top-1.3};
  if(Math.abs(bottom-label.y)>Math.max(3,label.height*.4)||cell.width<geometry.width*.035||cell.width>geometry.width*.4||cell.height/cell.width<.65||cell.height/cell.width>2.3)return null;
  return cell;
}
export function matchPhotoCaptions(regions,students){
  const roster=students.filter(s=>s.active!==false),sourceNumbers=new Map(),sourceNames=new Map();
  for(const r of regions){sourceNumbers.set(r.detectedNumber,(sourceNumbers.get(r.detectedNumber)??0)+1);sourceNames.set(normalizedName(r.detectedName),(sourceNames.get(normalizedName(r.detectedName))??0)+1);}
  return regions.map(r=>{
    let id='',matchMethod='unmatched',matchNote='현재 명렬에서 직접 학생을 선택하세요.';
    const byNumber=roster.filter(s=>String(s.number)===r.detectedNumber),byName=roster.filter(s=>normalizedName(s.name)===normalizedName(r.detectedName));
    if(sourceNumbers.get(r.detectedNumber)>1){matchMethod='conflict';matchNote='원본 번호가 중복됩니다. 직접 대조하세요.';}
    else if(byNumber.length){
      if(byNumber.length===1&&normalizedName(byNumber[0].name)===normalizedName(r.detectedName)){id=byNumber[0].id;matchMethod='number-name';matchNote='번호와 이름 일치 · 얼굴은 직접 확인하세요.';}
      else{matchMethod='conflict';matchNote='같은 번호의 이름이 다릅니다. 자동 연결하지 않았습니다.';}
    }else if(byName.length===1&&sourceNames.get(normalizedName(r.detectedName))===1){id=byName[0].id;matchMethod='name-only';matchNote='이름만 일치한 제안입니다. 원본 번호와 현재 학번이 다르므로 반드시 대조하세요.';}
    else if(byName.length>1||sourceNames.get(normalizedName(r.detectedName))>1){matchMethod='ambiguous';matchNote='동명이인 또는 중복 이름입니다. 직접 학번을 확인하세요.';}
    return {...r,id,skip:false,matchMethod,matchNote};
  });
}
export function proposePhotoSheet(geometry,students=[]){
  const {width,height,labels=[],images=[],unsupportedImages}=geometry,regions=[];
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||labels.length>100||images.length>500||geometry.lines?.length>5000||unsupportedImages)return {regions:[],detected:labels.length,unresolved:labels.length,reason:'이 PDF 구조는 자동 분할을 지원하지 않습니다. 격자 또는 직접 지정으로 진행하세요.'};
  const seenImages=new Set();
  for(const label of [...labels].sort((a,b)=>Math.abs(a.y-b.y)>2?a.y-b.y:a.x-b.x)){
    const cell=captionCell(label,geometry);if(!cell)continue;
    const candidates=images.map((img,index)=>({img,index,crop:intersection(img,cell)})).filter(({img,crop})=>crop&&crop.width>cell.width*.5&&crop.height>cell.height*.5&&img.raw.width<cell.width*1.9&&img.raw.height<cell.height*1.9);
    // Multiple faces/images in a cell are ambiguous. Never choose by size or recognition.
    if(candidates.length!==1||seenImages.has(candidates[0].index))continue;
    const {crop,index}=candidates[0];seenImages.add(index);
    regions.push({key:`auto-${regions.length+1}`,label:`자동 제안 ${regions.length+1}`,x:crop.x/width*100,y:crop.y/height*100,width:crop.width/width*100,height:crop.height/height*100,detectedNumber:label.number,detectedName:label.name,id:'',skip:false});
  }
  const matched=matchPhotoCaptions(regions,students);
  return {regions:matched,detected:labels.length,unresolved:labels.length-regions.length,reason:regions.length?'':'번호·이름 바로 위의 사진 표를 찾지 못했습니다. 스캔 PDF 또는 다른 양식은 격자·직접 지정으로 진행하세요.'};
}
