const natural=new Intl.Collator('ko',{numeric:true,sensitivity:'base'});
const integer=(value,min,max)=>['string','number'].includes(typeof value)&&/^\d+$/.test(String(value))&&Number(value)>=min&&Number(value)<=max?Number(value):null;
export function periodKey(course){const year=integer(course?.schoolYear,2000,2199),term=integer(course?.term,1,2);return year&&term?`${year}:${term}`:'unknown';}
export function periodOptions(courses){return [...new Set(courses.map(periodKey))].sort((a,b)=>{if(a==='unknown')return b==='unknown'?0:1;if(b==='unknown')return -1;const [ay,at]=a.split(':').map(Number),[by,bt]=b.split(':').map(Number);return by-ay||bt-at;}).map(key=>({key,label:key==='unknown'?'학기 정보 없음':`${key.split(':')[0]}학년도 ${key.split(':')[1]}학기`}));}
export function courseLabel(course){const grade=integer(course?.grade,1,12),number=integer(course?.classNumber,1,99);return grade&&number?`${grade}학년 ${number}${String(course.section??'')}반`:String(course?.name??'학급 정보 없음');}
function compare(a,b){const ag=integer(a.grade,1,12)??Infinity,bg=integer(b.grade,1,12)??Infinity,ac=integer(a.classNumber,1,99)??Infinity,bc=integer(b.classNumber,1,99)??Infinity;return (ag===bg?0:ag-bg)||(ac===bc?0:ac-bc)||natural.compare(String(a.section??''),String(b.section??''))||natural.compare(String(a.name??''),String(b.name??''))||natural.compare(String(a.id),String(b.id));}
export function coursesForPeriod(courses,key){return courses.filter(c=>periodKey(c)===key).sort(compare);}
export function initialCourse(courses){return coursesForPeriod(courses,periodOptions(courses)[0]?.key)[0]??null;}
