// Fit display tracks only. The caller supplies cells in their existing displayed
// order, so fitting never changes seating coordinates, aisles, or orientation.
const count = values => values.filter(Boolean).length;
const floorPixel = value => Math.floor(value * 1000) / 1000;

export function calculateTeacherSeatFit({columns, rows, width, height, viewportWidth, viewportHeight, scale='fit', textMin=0, minHeight=0, allowPhoneFit=true}) {
  const deskCols=count(columns), deskRows=count(rows);
  if (!deskCols || !deskRows) return null;
  const large=scale==='large';
  const phone=!large && allowPhoneFit && Math.min(viewportWidth,viewportHeight)<=600;
  const landscape=viewportWidth>viewportHeight;
  const mode=large?'large':phone?(landscape?'phone-landscape':'phone-portrait'):'standard';
  const gap=phone?2:4, aisle=phone?4:8;
  const dense=!large && (phone || height/deskRows<128 || width/deskCols<144);
  const textWidth=phone?0:Math.max(dense?42:58,textMin);
  const widthFloor=phone?0:large?Math.max(134,textWidth+84):textWidth+(dense?44:58);
  const heightFloor=phone?0:Math.max(large?116:64,minHeight);
  const cardWidth=floorPixel(Math.max(widthFloor,(width-(columns.length-deskCols)*aisle-(columns.length-1)*gap)/deskCols));
  const cardHeight=floorPixel(Math.max(heightFloor,(height-(rows.length-deskRows)*aisle-(rows.length-1)*gap)/deskRows));
  const standardScale=dense?1:Math.min(1.4,Math.max(1,Math.min(cardWidth/134,cardHeight/116)));
  let nameSize=(dense?12:14)*standardScale, numberSize=(dense?10:12)*standardScale, countSize=(dense?11:13)*standardScale;
  let photoHeight=cardHeight-10;
  let photoWidth=Math.max(dense?32:44,Math.min(cardWidth-textWidth*standardScale-12,photoHeight*.75));
  if(phone) {
    // One name line and one compact metadata line leave the whole card visible.
    nameSize=landscape?Math.min(12,Math.max(10,(cardHeight-6)/2)):Math.min(14,Math.max(10,(cardWidth-6)/4));
    numberSize=landscape?9:10;
    countSize=landscape?10:11;
    photoHeight=Math.max(0,cardHeight-4);
    photoWidth=landscape?Math.max(0,Math.min(48,photoHeight*.75,cardWidth*.28)):0;
    if(landscape)nameSize=Math.max(10,Math.min(nameSize,(cardWidth-photoWidth-8)/4));
  }
  return {mode,phone,dense,gap,aisle,cardWidth,cardHeight,hideNumber:phone&&cardWidth<(landscape?90:55),showPhotos:mode!=='phone-portrait',
    columnWidths:columns.map(full=>full?cardWidth:aisle),rowHeights:rows.map(full=>full?cardHeight:aisle),
    textWidth:phone?0:textWidth*standardScale,photoWidth,photoHeight,nameSize,numberSize,countSize};
}

export function applyTeacherSeatFit({panel,layout,scale='fit'}) {
  const scroller=panel?.querySelector('.grid-scroll'), grid=scroller?.querySelector('.seat-grid');
  if(!grid || !layout) return null;
  const children=[...grid.children];
  if(children.length!==layout.rows*layout.cols) return null;
  const desk=node=>node.classList.contains('seat')||node.classList.contains('desk');
  const columns=Array.from({length:layout.cols},(_,col)=>children.some((node,i)=>i%layout.cols===col&&desk(node)));
  const rows=Array.from({length:layout.rows},(_,row)=>children.slice(row*layout.cols,(row+1)*layout.cols).some(desk));
  if(!count(columns)||!count(rows)) return null;
  const main=panel.closest('main'), board=panel.querySelector('.board'), hint=panel.querySelector('#seat-pan-hint');
  const allowPhoneFit=!panel.querySelector('.warning');
  const phone=allowPhoneFit&&scale!=='large'&&Math.min(window.innerWidth,window.innerHeight)<=600;
  panel.classList.add('teacher-seating-fit');
  main?.classList.toggle('teacher-phone-layout',phone);
  panel.classList.toggle('seat-phone-portrait',phone&&window.innerWidth<=window.innerHeight);
  panel.classList.toggle('seat-phone-landscape',phone&&window.innerWidth>window.innerHeight);
  if(hint) hint.hidden=true;
  const px=(node,key)=>node?(parseFloat(getComputedStyle(node)[key])||0):0;
  const availableHeight=()=>Math.max(phone?1:120,Math.floor(
    (window.visualViewport?.height??window.innerHeight)+(window.visualViewport?.offsetTop??0)
    -scroller.getBoundingClientRect().top-(board?.offsetHeight??0)-px(board,'marginTop')
    -px(panel,'paddingBottom')-px(panel,'borderBottomWidth')-px(panel,'marginBottom')-px(main,'paddingBottom')-1));
  const apply=(minimum=0)=> {
    const result=calculateTeacherSeatFit({columns,rows,width:scroller.clientWidth,height:availableHeight(),
      viewportWidth:window.innerWidth,viewportHeight:window.innerHeight,scale,minHeight:minimum,allowPhoneFit,
      textMin:phone?0:Math.max(0,...[...grid.querySelectorAll('.count-token')].map(node=>node.getBoundingClientRect().width))});
    panel.classList.toggle('seat-fit-dense',result.dense);
    panel.classList.toggle('seat-compact',result.cardHeight<92);
    panel.classList.toggle('seat-phone-tight',result.hideNumber);
    grid.style.gridTemplateColumns=result.columnWidths.map(value=>value+'px').join(' ');
    grid.style.gridTemplateRows=result.rowHeights.map(value=>value+'px').join(' ');
    grid.style.gap=result.gap+'px';
    scroller.style.height=availableHeight()+'px';
    for(const [key,value]of Object.entries({'text-min':result.textWidth,'photo-width':result.photoWidth,'photo-height':result.photoHeight,
      'name-size':result.nameSize,'number-size':result.numberSize,'count-size':result.countSize}))panel.style.setProperty('--seat-'+key,value+'px');
    return result;
  };
  let result=apply();
  // On larger screens retain the existing readable-text floor and scroll escape.
  if(!phone) {
    const textHeight=Math.max(0,...[...grid.querySelectorAll('.identity')].map(node=>node.scrollHeight))+(result.dense?30:38);
    if(textHeight>result.cardHeight) result=apply(Math.ceil(textHeight));
    let x=scroller.scrollWidth>scroller.clientWidth+1,y=scroller.scrollHeight>scroller.clientHeight+1;
    if(hint&&(x||y)) {
      hint.hidden=false;
      result=apply(textHeight);
      x=scroller.scrollWidth>scroller.clientWidth+1;y=scroller.scrollHeight>scroller.clientHeight+1;
      hint.textContent=(x&&y?'↔ ↕ 좌우·위아래':x?'↔ 좌우':'↕ 위아래')+'로 밀어 전체 자리표 보기 · '+(scale==='large'?'더보기에서 자동 맞춤으로 돌아갈 수 있습니다.':'글자 크기를 유지하려고 일부 자리는 스크롤로 표시합니다.');
    }
  }
  scroller.dataset.seatSizing=scale;
  return result;
}
