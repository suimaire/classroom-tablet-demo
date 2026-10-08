import test from 'node:test';
import assert from 'node:assert/strict';

// Removing the phone-specific exact fit (or reintroducing a minimum card size)
// must fail these geometry checks. Fixtures contain no student information.
const module = await import('../admin/seat-fit.js').catch(() => ({}));
const fit = options => {
  assert.equal(typeof module.calculateTeacherSeatFit, 'function', 'a tested teacher seat-fit calculator is exported');
  return module.calculateTeacherSeatFit(options);
};
const sum = values => values.reduce((total, value) => total + value, 0);
const plain = (rows, cols) => ({rows:Array(rows).fill(true), columns:Array(cols).fill(true)});
const fits = (result, width, height) => {
  assert.ok(sum(result.columnWidths) + result.gap * (result.columnWidths.length - 1) <= width + .001, 'all columns fit');
  assert.ok(sum(result.rowHeights) + result.gap * (result.rowHeights.length - 1) <= height + .001, 'all rows fit');
  assert.ok(result.columnWidths.every(v => v > 0));
  assert.ok(result.rowHeights.every(v => v > 0));
};

for (const [rows, cols] of [[8,5], [6,8]]) {
  for (const [viewportWidth, viewportHeight] of [[320,568],[375,667],[390,844],[430,932]]) {
    test(`${rows}×${cols} phone portrait keeps every cell without photos at ${viewportWidth}×${viewportHeight}`, () => {
      const width=viewportWidth-24, height=viewportHeight-170;
      const result=fit({...plain(rows,cols),width,height,viewportWidth,viewportHeight});
      assert.equal(result.mode,'phone-portrait');
      assert.equal(result.showPhotos,false);
      assert.equal(result.columnWidths.length,cols);
      assert.equal(result.rowHeights.length,rows);
      fits(result,width,height);
    });
    test(`${rows}×${cols} phone landscape includes photos and every cell at ${viewportHeight}×${viewportWidth}`, () => {
      const width=viewportHeight-68, height=viewportWidth-108;
      const result=fit({...plain(rows,cols),width,height,viewportWidth:viewportHeight,viewportHeight:viewportWidth});
      assert.equal(result.mode,'phone-landscape');
      assert.equal(result.showPhotos,true);
      assert.ok(result.photoWidth>0);
      assert.ok(result.photoHeight<=result.cardHeight-4);
      fits(result,width,height);
    });
  }
}

test('aisles and empty source rows keep their displayed positions, including reversal', () => {
  const options={rows:[true,false,true,true,true,true], columns:[true,true,false,true,true,false,true,true],width:756,height:266,viewportWidth:812,viewportHeight:375};
  const copy=structuredClone(options), result=fit(options);
  assert.deepEqual(options,copy,'layout metadata is never mutated');
  assert.deepEqual(result.columnWidths.map(v=>v===result.aisle),[false,false,true,false,false,true,false,false]);
  assert.deepEqual(result.rowHeights.map(v=>v===result.aisle),[false,true,false,false,false,false]);
  fits(result,options.width,options.height);
});

test('same source cell arrangement is fitted again after rotation', () => {
  const source=plain(8,5);
  const portrait=fit({...source,width:351,height:480,viewportWidth:375,viewportHeight:667});
  const landscape=fit({...source,width:599,height:260,viewportWidth:667,viewportHeight:375});
  assert.equal(portrait.columnWidths.length,landscape.columnWidths.length);
  assert.equal(portrait.rowHeights.length,landscape.rowHeights.length);
  assert.ok(landscape.cardWidth>portrait.cardWidth);
  assert.ok(landscape.cardHeight<portrait.cardHeight);
});

test('tablet auto-fit retains existing card floors and photographs', () => {
  const result=fit({...plain(8,5),width:716,height:620,viewportWidth:744,viewportHeight:1133});
  assert.equal(result.mode,'standard');
  assert.equal(result.showPhotos,true);
  assert.ok(result.cardHeight>=64);
  assert.ok(result.cardWidth>=86);
});

test('explicit large mode keeps readable scrolling cards even on a phone', () => {
  const result=fit({...plain(8,5),width:350,height:230,viewportWidth:667,viewportHeight:375,scale:'large'});
  assert.equal(result.mode,'large');
  assert.equal(result.showPhotos,true);
  assert.ok(result.cardHeight>=116);
  assert.ok(result.cardWidth>=134);
});

test('height-only and width-only resize recalculate without cached dimensions', () => {
  const base={...plain(8,5),width:780,height:290,viewportWidth:844,viewportHeight:390};
  const normal=fit(base), shorter=fit({...base,height:220}), narrower=fit({...base,width:660});
  assert.ok(shorter.cardHeight<normal.cardHeight);
  assert.ok(narrower.cardWidth<normal.cardWidth);
  fits(shorter,780,220);fits(narrower,660,290);
});

test('narrow landscape photo targets leave room for a full short name and count',()=>{
 const result=fit({...plain(6,8),width:544,height:222,viewportWidth:568,viewportHeight:320});
 assert.equal(result.hideNumber,true);
 assert.ok(result.cardWidth-result.photoWidth-8>=result.nameSize*3,'the text column fits a three-character name');
 assert.ok(result.nameSize>=10);
});
test('dense portrait keeps the name and count by dropping only a too-wide number line',()=>{
 const result=fit({...plain(6,8),width:296,height:420,viewportWidth:320,viewportHeight:568});
 assert.equal(result.hideNumber,true);
 assert.equal(result.showPhotos,false);
});

test('readiness warnings can opt out of strict phone fit so the warning and seats remain scrollable',()=>{
 const result=fit({...plain(8,5),width:350,height:30,viewportWidth:375,viewportHeight:667,allowPhoneFit:false});
 assert.equal(result.mode,'standard');
 assert.ok(result.cardHeight>=64);
});

test('tight portrait uses a short visible history cue without changing accessible labels',async()=>{
 const {readFile}=await import('node:fs/promises');
 const css=await readFile(new URL('../admin/styles.css',import.meta.url),'utf8');
 assert.match(css,/\.seat-phone-portrait\.seat-phone-tight \.seat-history\{[^}]*font-size:0/);
 assert.match(css,/\.seat-phone-portrait\.seat-phone-tight \.seat-history::after\{[^}]*content:'기록'/);
 assert.match(css,/\.seat-phone-portrait\.seat-phone-tight \.seat\{[^}]*padding-left:1px;[^}]*padding-right:1px/);
});
