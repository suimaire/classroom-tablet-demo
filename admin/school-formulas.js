// Read formula location metadata only. Native XML parsing does not evaluate Excel formulas.
const fail=()=>{throw Error('XLSX 수식 위치 정보를 안전하게 확인할 수 없습니다. 파일을 XLSX로 다시 저장하세요.');};
const XMLNS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RELNS='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const strictMain='http://purl.oclc.org/ooxml/spreadsheetml/main';
const strictRel='http://purl.oclc.org/ooxml/officeDocument/relationships';
function xmlFile(wb,path){
 const bytes=wb.files?.[path]?.content;if(!bytes)fail();
 const text=typeof bytes==='string'?bytes:new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 if(/<!DOCTYPE|<!ENTITY/i.test(text))fail();
 if(typeof DOMParser==='undefined')throw Error('이 브라우저는 XLSX XML 검증을 지원하지 않습니다. 최신 브라우저를 사용하세요.');
 const doc=new DOMParser().parseFromString(text,'application/xml');
 if(doc.getElementsByTagName('parsererror').length)fail();return doc;
}
const nodes=(doc,name)=>[...doc.getElementsByTagName('*')].filter(n=>n.localName===name);
const attr=(node,name)=>node.getAttribute(name)||'';
export function schoolFormulaCells(wb,sheetName,utils){
 const book=xmlFile(wb,'xl/workbook.xml'),sheets=nodes(book,'sheet').filter(s=>attr(s,'name')===sheetName);
 if(sheets.length!==1)fail();
 const id=sheets[0].getAttributeNS(RELNS,'id')||sheets[0].getAttributeNS(strictRel,'id');if(!id)fail();
 const rels=nodes(xmlFile(wb,'xl/_rels/workbook.xml.rels'),'Relationship').filter(r=>attr(r,'Id')===id);
 if(rels.length!==1||attr(rels[0],'TargetMode')==='External'||!attr(rels[0],'Type').endsWith('/worksheet'))fail();
 const target=attr(rels[0],'Target');if(!target||/[\\?#]/.test(target)||/^[a-z]+:/i.test(target))fail();
 const parts=(target.startsWith('/')?target.slice(1):'xl/'+target).split('/'),resolved=[];
 for(const part of parts){if(part==='..'){if(!resolved.length)fail();resolved.pop();}else if(part&&part!=='.')resolved.push(part);}
 const path=resolved.join('/');if(!path.startsWith('xl/'))fail();
 const doc=xmlFile(wb,path),marked=new Map();let markedWork=0;
 const bounded=ref=>{
  if(!/^\$?[A-Z]{1,3}\$?[1-9]\d*(?::\$?[A-Z]{1,3}\$?[1-9]\d*)?$/.test(ref))fail();
  const range=utils.decode_range(ref.replaceAll('$',''));
  if(range.s.r>range.e.r||range.s.c>range.e.c||range.e.r>10000||range.e.c>10)throw Error('XLSX 수식 범위가 10001행·11열을 넘습니다.');
  return range;
 };
 const mark=ref=>{const range=bounded(ref);markedWork+=(range.e.r-range.s.r+1)*(range.e.c-range.s.c+1);if(markedWork>220022)throw Error('수식 범위가 너무 복잡합니다. 집계 범위를 줄이거나 해당 셀을 값으로 저장하세요.');for(let r=range.s.r;r<=range.e.r;r++)for(let c=range.s.c;c<=range.e.c;c++){const address=utils.encode_cell({r,c});marked.set(address,{r,c,address});}};
 for(const f of nodes(doc,'f')){
  if(![XMLNS,strictMain].includes(f.namespaceURI))fail();
  const cell=f.parentElement;if(!cell||cell.localName!=='c')fail();
  const address=attr(cell,'r');if(!address||address.includes(':'))fail();mark(address);
  // Includes orphan/forward shared formulas and array results without physical <c> cells.
  const ref=attr(f,'ref');if(ref)mark(ref);
 }
 return marked;
}
