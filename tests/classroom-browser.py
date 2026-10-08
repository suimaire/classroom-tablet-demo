"""Optional synthetic-only browser regression. Requires Python Playwright and Chromium.

Run: python tests/classroom-browser.py
Set CHROMIUM_PATH if Chromium is not on PATH. The application is served locally;
its CloudAPI module is replaced in memory and every non-loopback URL is blocked.
No real login, student data, backend reads, or writes are used.
This harness was prepared but browser execution was blocked by the review sandbox.
"""
import asyncio, json, threading, os, shutil
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
httpd=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=httpd.serve_forever,daemon=True).start()
BASE=f'http://127.0.0.1:{httpd.server_port}'
hook='''\nwindow.__review={set(value){({courses,course,snapshot,dayData,countMode,selectedDay,followToday}=value);api.access='synthetic';render();},openStudentHistory,returnToClassroom,refresh,loadHistory,get(){return {generation,studentHistoryEpoch,tab,busy,historyData,dayData,snapshot};}};'''
fake='''export class CloudAPI{access='synthetic';init=async()=>{};restoreSession=()=>false;rememberCourse=()=>{};rpc=async(name,args)=>window.rpcHandler(name,args);logout=async()=>{this.access='';};} export const friendly=e=>e.message;'''
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser'),headless=True,args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':375,'height':667})
  errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
  await page.route('**/admin/api.js*',lambda route:route.fulfill(status=200,content_type='text/javascript',body=fake))
  await page.route('**/admin/app.js*',lambda route:route.fulfill(status=200,content_type='text/javascript',body=(ROOT/'admin/app.js').read_text()+hook))
  await page.route('**/*',lambda route:route.fallback() if route.request.url.startswith(BASE+'/') else route.abort())
  await page.goto(BASE+'/admin/')
  await page.wait_for_function('!!window.__review')
  await page.evaluate('''()=>{const students=Array.from({length:40},(_,i)=>({id:'synthetic-'+i,number:'201'+String(i+1).padStart(2,'0'),name:'합성가',count:i===0?2:0}));const cells=students.map((s,i)=>({row:Math.floor(i/5)+1,col:i%5+1,kind:'desk',studentId:s.id}));window.state={courses:[{id:'synthetic',name:'합성 반',role:'teacher'}],course:{id:'synthetic',name:'합성 반',role:'teacher'},snapshot:{students,events:[],version:1,layout:{rows:8,cols:5,boardSide:'bottom',cells}},dayData:{day:'2026-10-08',today:'2026-10-08',counts:[{student_id:'synthetic-0',count:2}]},countMode:'daily',selectedDay:'2026-10-08',followToday:true};window.calls=[];window.rpcHandler=async(name,args)=>{calls.push({name,args});if(name==='hafs_teacher_snapshot')return state.snapshot;if(name==='hafs_teacher_photos')return [];if(name==='hafs_teacher_day_counts')return {...state.dayData,snapshot:state.snapshot};if(name==='hafs_teacher_history')return {events:[],next:null};if(name==='hafs_my_courses')return state.courses;throw Error('Unexpected RPC '+name);};__review.set(state);}''')
  await page.wait_for_timeout(100)
  # Real rendered DOM geometry, controls included.
  for w,h in [(320,568),(375,667),(568,320),(667,375),(844,390),(744,1133),(1133,744)]:
   await page.set_viewport_size({'width':w,'height':h});await page.wait_for_timeout(80)
   result=await page.evaluate('''()=>{let grid=document.querySelector('.grid-scroll'),seats=[...document.querySelectorAll('.seat')],r=grid.getBoundingClientRect();let bad=seats.filter(s=>{let a=s.getBoundingClientRect(),b=s.querySelector('.identity').getBoundingClientRect();return b.top<a.top-.5||b.bottom>a.bottom+.5||b.left<a.left-.5||b.right>a.right+.5;});return {width:innerWidth,height:innerHeight,gridTop:r.top,gridBottom:r.bottom,docWidth:document.documentElement.scrollWidth,gridWidth:grid.clientWidth,gridScrollWidth:grid.scrollWidth,gridHeight:grid.clientHeight,gridScrollHeight:grid.scrollHeight,identityOverflow:bad.length,seats:seats.length};}''')
   assert result['seats']==40, result
   if min(w,h)<=600:
    assert result['gridScrollWidth']<=result['gridWidth']+1, result
    assert result['gridScrollHeight']<=result['gridHeight']+1, result
    assert result['gridBottom']<=h+1, result
    assert result['identityOverflow']==0, result
    assert result['docWidth']<=w+1, result
   print('GEOMETRY',json.dumps(result))
  await page.set_viewport_size({'width':1024,'height':768})
  # Late history response must not resurrect the dialog or alter history.
  await page.evaluate('''()=>{window.originalHandler=rpcHandler;rpcHandler=(name,args)=>name==='hafs_teacher_history'?new Promise(resolve=>window.historyResolve=resolve):originalHandler(name,args);window.oldLength=history.length;}''')
  await page.locator('[data-student-history="synthetic-0"]').click()
  await page.wait_for_function('!!window.historyResolve')
  await page.keyboard.press('Escape');await page.wait_for_timeout(50)
  escape=await page.evaluate('''()=>({open:document.querySelector('dialog').open,focused:document.activeElement.dataset.studentHistory,lengthStable:history.length===oldLength})''')
  assert escape=={'open':False,'focused':'synthetic-0','lengthStable':True},escape
  print('ESCAPE PASS',escape)
  await page.evaluate('''()=>historyResolve({events:[{id:'late',student_id:'synthetic-0',at:'2026-10-08T00:00:00Z'}],next:null})''');await page.wait_for_timeout(50)
  late=await page.evaluate('''()=>({open:document.querySelector('dialog').open,focused:document.activeElement.dataset.studentHistory,tab:__review.get().tab})''')
  assert late=={'open':False,'focused':'synthetic-0','tab':'class'},late
  print('LATE RESPONSE PASS',late)
  await page.evaluate('''()=>{rpcHandler=originalHandler;}''')
  await page.locator('[data-student-history="synthetic-1"]').click();await page.wait_for_timeout(30)
  box=await page.locator('dialog').bounding_box();await page.mouse.click(2,2);await page.wait_for_timeout(30)
  backdrop=await page.evaluate('''()=>({open:document.querySelector('dialog').open,focused:document.activeElement.dataset.studentHistory,lengthStable:history.length===oldLength,undoCalls:calls.filter(x=>x.name==='hafs_undo').length})''')
  assert backdrop=={'open':False,'focused':'synthetic-1','lengthStable':True,'undoCalls':0},backdrop
  print('BACKDROP PASS',backdrop)
  assert not errors,errors
  print('Synthetic browser checks passed; no external requests were allowed.')
  await browser.close()
try:
 asyncio.run(main())
finally:
 httpd.shutdown()
