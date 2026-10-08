import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const app=read('../admin/app.js'),css=read('../admin/styles.css');
const rule=selector=>css.split(selector+'{')[1]?.split('}')[0]??'';

// iOS WebKit's native date theme forces percent-width controls to content-box
// after author CSS. appearance:none skips that theme pass (WebKit bug 301648).
test('history dates disable the iOS native sizing override at every viewport width',()=>{
 for(const selector of ['.history-filters input[type=date]']){
  const control=rule(selector);
  assert.match(control,/(?:^|;)-webkit-appearance:none(?:;|$)/,selector);
  assert.match(control,/(?:^|;)appearance:none(?:;|$)/,selector);
  assert.match(control,/(?:^|;)box-sizing:border-box(?:;|$)/,selector);
  assert.match(control,/(?:^|;)min-width:0(?:;|$)/,selector);
 }
});
test('empty native date values retain height after the appearance reset',()=>{
 for(const selector of ['.history-filters input[type=date]']){
  assert.match(rule(selector),/min-height:44px/);
  assert.match(rule(selector+'::-webkit-date-and-time-value'),/min-height:1.5em/);
 }
});
test('landscape history preserves separate columns, labels and the search button gap',()=>{
 assert.match(rule('.history-filters'),/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\) max-content/);
 assert.match(rule('.history-filters'),/gap:12px/);
 assert.match(rule('.history-filters>label'),/min-width:0/);
 assert.match(css,/@media\(max-width:800px\)\{\.history-filters\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
 assert.match(css,/@media\(max-width:480px\)\{\.history-filters\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(app,/<label>시작일 \(한국 시간\)<input id="history-from" type="date"/);
 assert.match(app,/<label>종료일 \(해당일 포함\)<input id="history-to" type="date"/);
 assert.match(app,/<input id="participation-day" type="date"[^>]*aria-label="발표 횟수 날짜 \(한국 시간\)"/);
 assert.match(app,/<button id="history-search">기간 조회<\/button>/);
});
