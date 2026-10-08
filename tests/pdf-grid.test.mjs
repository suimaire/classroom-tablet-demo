import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resizePdfGrid, addPdfGridEdge} from '../shared/pdf-grid.js';
import {validatePdfDraft} from '../student/pdf-input.js';

const fixture = () => ({rows:2,cols:3,boardSide:'bottom',classLabel:'2학년 1반',issues:['기존 경고'],scanned:false,sourceGrid:{left:10,top:20,width:80,height:60,columnWidths:[4,1,4]},cells:[
  {row:1,col:1,kind:'desk',rawNumber:'01',name:'합성 하나',originalCoordinate:{row:1,col:1},conflicts:['원본 확인']},
  {row:1,col:2,kind:'aisle',rawNumber:'',name:''},
  {row:1,col:3,kind:'desk',rawNumber:'02',name:'합성 둘'},
  {row:2,col:1,kind:'void',rawNumber:'',name:''},
  {row:2,col:2,kind:'desk',rawNumber:'',name:''},
  {row:2,col:3,kind:'desk',rawNumber:'03',name:'합성 셋'}
]});
const at=(d,r,c)=>d.cells.find(x=>x.row===r&&x.col===c);

test('same-size apply leaves values, warnings and source alignment untouched',()=>{
  const d=fixture();assert.equal(resizePdfGrid(d,2,3),d);
});
test('resize maps cells by coordinates and retains all metadata without mutation',()=>{
  const d=fixture(),snapshot=structuredClone(d),result=resizePdfGrid(d,3,4);
  assert.deepEqual(d,snapshot);assert.equal(result.cells.length,12);
  for(const cell of d.cells)assert.deepEqual(at(result,cell.row,cell.col),cell);
  assert.deepEqual(at(result,3,4),{row:3,col:4,kind:'desk',rawNumber:'',name:''});
  assert.equal(result.boardSide,'bottom');assert.deepEqual(result.issues,['기존 경고']);
  assert.equal(result.sourceGrid,undefined);
});
for(const [edge,dr,dc] of [['top',1,0],['bottom',0,0],['left',0,1],['right',0,0]])test(`add ${edge} shifts only the intended axis and preserves metadata`,()=>{
  const d=fixture(),snapshot=structuredClone(d),result=addPdfGridEdge(d,edge);
  assert.deepEqual(d,snapshot);
  assert.equal(result.rows,2+(edge==='top'||edge==='bottom'?1:0));
  assert.equal(result.cols,3+(edge==='left'||edge==='right'?1:0));
  for(const cell of d.cells)assert.deepEqual(at(result,cell.row+dr,cell.col+dc),{...cell,row:cell.row+dr,col:cell.col+dc});
  const validated=validatePdfDraft(result,{prefix:'201',classLabel:'2학년 1반',numbers:['20101','20102','20103']});
  assert.deepEqual(validated.errors,[]);
  assert.equal(validated.layout.boardSide,'bottom');
  assert.deepEqual(validated.layout.cells.filter(c=>c.studentNumber).map(c=>c.studentNumber),['20101','20102','20103']);
});
test('occupied, named, conflict, aisle and void cells cannot silently be cropped',()=>{
  for(const cell of [{rawNumber:'03'},{name:'합성'},{kind:'aisle'},{kind:'void'},{conflicts:['검토 필요']}]){
    const d={rows:1,cols:2,cells:[{row:1,col:1,kind:'desk',rawNumber:'01',name:''},{row:1,col:2,kind:'desk',rawNumber:'',name:'',...cell}]};
    const snapshot=structuredClone(d);assert.throws(()=>resizePdfGrid(d,1,1),/줄일 수 없습니다/);assert.deepEqual(d,snapshot);
  }
});
test('empty outer cells may be cropped and the retained number stays at its coordinate',()=>{
  const d=resizePdfGrid(fixture(),4,5),result=resizePdfGrid(d,2,3);
  assert.deepEqual(result.cells,fixture().cells);
});
test('invalid dimensions and growth beyond 30 are rejected without mutation',()=>{
  for(const [r,c] of [[0,2],[2,31],[1.5,3],[NaN,3]])assert.throws(()=>resizePdfGrid(fixture(),r,c),/1~30/);
  const d=resizePdfGrid(fixture(),30,30);assert.throws(()=>addPdfGridEdge(d,'top'),/1~30/);assert.throws(()=>addPdfGridEdge(d,'left'),/1~30/);
  assert.throws(()=>addPdfGridEdge(d,'wrong'),/방향/);
});
test('repeated additions and serialization preserve student preview output',()=>{
  let d=fixture();for(const edge of ['top','left','bottom','right','left','top'])d=addPdfGridEdge(d,edge);
  const result=validatePdfDraft(d,{prefix:'201',classLabel:'2학년 1반'});
  assert.deepEqual(result.errors,[]);const saved=JSON.parse(JSON.stringify(result.layout));
  assert.equal(saved.cells.find(c=>c.studentNumber==='20101').row,3);
  assert.equal(saved.cells.find(c=>c.studentNumber==='20101').col,3);
  assert.equal(saved.cells.filter(c=>c.kind==='aisle').length,1);
});

// Exercise the actual handlers in both dialogs without a network or student data.
for (const area of ['student', 'admin']) test(`${area} dialog wires safe resize and all four direction buttons`,()=>{
  const source=readFileSync(new URL(`../${area}/pdf-review.js`,import.meta.url),'utf8');
  const handlers=source.slice(source.indexOf('    function editGrid(change)'),source.indexOf("    q('#pdf-overlay-toggle')"));
  const nodes=Object.fromEntries(['pdf-grid-status','pdf-rows','pdf-cols','pdf-manual-options','pdf-manual','pdf-resize'].map(id=>[`#${id}`,{dataset:{},value:''}]));
  nodes['#pdf-rows'].value='2';nodes['#pdf-cols'].value='3';
  const buttons=['top','bottom','left','right'].map(addEdge=>({dataset:{addEdge}}));
  let renders=0;
  const current=Function('draft','q','dialog','rows','resizePdfGrid','addPdfGridEdge',handlers+';return ()=>draft;')(fixture(),s=>nodes[s],{querySelectorAll:()=>buttons},()=>renders++,resizePdfGrid,addPdfGridEdge);
  const before=current();nodes['#pdf-resize'].onclick();assert.equal(current(),before);assert.equal(renders,0);
  nodes['#pdf-manual'].onclick();assert.equal(current(),before);assert.equal(nodes['#pdf-manual-options'].open,true);
  for(const button of buttons)button.onclick();
  assert.equal(renders,4);assert.equal(current().rows,4);assert.equal(current().cols,5);
  assert.equal(at(current(),2,2).rawNumber,'01');assert.equal(at(current(),2,3).kind,'aisle');
  assert.equal(nodes['#pdf-rows'].value,'4');assert.equal(nodes['#pdf-cols'].value,'5');
  const retained=current();nodes['#pdf-rows'].value='1';nodes['#pdf-cols'].value='1';nodes['#pdf-resize'].onclick();
  assert.equal(current(),retained);assert.equal(renders,4);assert.equal(nodes['#pdf-grid-status'].dataset.state,'error');
  assert.match(nodes['#pdf-grid-status'].textContent,/줄일 수 없습니다/);
  nodes['#pdf-rows'].value='3';nodes['#pdf-cols'].value='4';nodes['#pdf-resize'].onclick();
  assert.equal(current().rows,3);assert.equal(current().cols,4);assert.equal(at(current(),3,4).rawNumber,'03');
  assert.equal(nodes['#pdf-grid-status'].dataset.state,'ok');assert.equal(renders,5);
});
