import {collectPhotoGeometry} from './photo-sheet-detect.js?v=20261002-auto-1';
import {sheetFileKind,cropPixels} from './photo-sheet-core.js';
import {LocalPdfBinaryDataFactory} from './pdf-assets.js';
const MAX_EDGE=3600,MAX_PIXELS=32000000;
export function sourceSize(width,height){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width>16000||height>16000||width*height>MAX_PIXELS)throw Error('원본 해상도가 너무 큽니다. 3,200만 화소 이하로 줄여서 선택하세요.');
  const scale=Math.min(1,MAX_EDGE/Math.max(width,height));return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
function canvasFor(width,height){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;}
export async function loadSheetSource(file,pageNumber=1){
  const kind=sheetFileKind(file);
  if(kind==='image'){
    let bitmap;
    try{bitmap=await createImageBitmap(file);const size=sourceSize(bitmap.width,bitmap.height),canvas=canvasFor(size.width,size.height),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);return {canvas,width:canvas.width,height:canvas.height,page:1,pages:1,close(){canvas.width=canvas.height=1;}};}
    catch(e){throw Error(e.message.includes('해상도')?e.message:'이미지를 열지 못했습니다. JPEG·PNG·WebP로 저장한 뒤 다시 선택하세요.');}
    finally{bitmap?.close();}
  }
  const pdf=await import('./pdf.mjs');
  pdf.GlobalWorkerOptions.workerSrc=new URL('./pdf.worker.mjs',import.meta.url).href;
  const task=pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),BinaryDataFactory:LocalPdfBinaryDataFactory,useWorkerFetch:false,isEvalSupported:false,enableXfa:false,disableAutoFetch:true,disableStream:true,cMapUrl:new URL('./',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./',import.meta.url).href,wasmUrl:new URL('./',import.meta.url).href});
  let canvas;
  try{
    const doc=await task.promise;
    if(!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>doc.numPages)throw Error(`1~${doc.numPages}쪽에서 선택하세요.`);
    const page=await doc.getPage(pageNumber),base=page.getViewport({scale:1}),scale=Math.min(3,MAX_EDGE/Math.max(base.width,base.height)),viewport=page.getViewport({scale});
    if(!Number.isFinite(viewport.width)||!Number.isFinite(viewport.height)||viewport.width<1||viewport.height<1||viewport.width*viewport.height>MAX_PIXELS)throw Error('PDF 페이지 크기가 너무 큽니다.');
    canvas=canvasFor(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'#ffffff'}).promise;
    let geometry=null;try{geometry=collectPhotoGeometry(await page.getOperatorList(),pdf.OPS,base,(await page.getTextContent()).items);}catch{/* Unsupported structure retains manual cropping. */}const pages=doc.numPages;await task.destroy();return {canvas,width:canvas.width,height:canvas.height,page:pageNumber,pages,geometry,close(){canvas.width=canvas.height=1;if(geometry){geometry.labels.length=0;geometry.images.length=0;geometry.lines.length=0;}}};
  }catch(e){canvas&&(canvas.width=canvas.height=1);await task.destroy();throw Error(e.name==='PasswordException'?'암호가 걸린 PDF는 지원하지 않습니다. 잠금을 해제한 사본을 직접 준비해 주세요.':`PDF를 열지 못했습니다. ${e.message}`);}
}
export function cropPortrait(source,region){
  const r=cropPixels(region,source.width,source.height),scale=Math.min(1,240/Math.max(r.width,r.height)),canvas=canvasFor(Math.max(1,Math.round(r.width*scale)),Math.max(1,Math.round(r.height*scale))),ctx=canvas.getContext('2d');
  try{ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source.canvas,r.x,r.y,r.width,r.height,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',.8);if(data.length>100023)throw Error('축소 사진이 75KB를 넘습니다. 영역을 조정하세요.');return data;}finally{canvas.width=canvas.height=1;}
}
