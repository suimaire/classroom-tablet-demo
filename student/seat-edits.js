// Screen coordinates only. Board orientation and every existing cell move together.
export function addDesk(layout,selection,direction){
 const offsets={up:[-1,0],down:[1,0],left:[0,-1],right:[0,1]},offset=offsets[direction];
 const anchor=layout?.cells.find(c=>c.row===selection?.row&&c.col===selection?.col);
 if(!offset||!anchor||anchor.kind!=='desk')throw Error('기준 책상을 먼저 선택하세요.');
 let row=selection.row+offset[0],col=selection.col+offset[1];
 const dr=row<1?1:0,dc=col<1?1:0,rows=layout.rows+(row<1||row>layout.rows?1:0),cols=layout.cols+(col<1||col>layout.cols?1:0);
 if(rows>30||cols>30)throw Error('격자는 최대 30행·30열까지 추가할 수 있습니다.');
 const target=layout.cells.find(c=>c.row===row&&c.col===col);
 if(target&&(target.kind!=='void'||target.studentNumber))throw Error(target.kind==='aisle'?'통로를 덮어쓸 수 없습니다. 다른 방향을 선택하세요.':'이미 책상이 있는 칸입니다. 다른 방향을 선택하세요.');
 const cells=layout.cells.filter(c=>c!==target).map(c=>({...c,row:c.row+dr,col:c.col+dc}));
 row+=dr;col+=dc;cells.push({row,col,kind:'desk',studentNumber:''});
 return {layout:{...layout,rows,cols,cells},selection:{row:selection.row+dr,col:selection.col+dc},added:{row,col}};
}
