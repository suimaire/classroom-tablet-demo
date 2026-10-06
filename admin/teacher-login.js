const PREFIX='mchisnymlincoejkxmxm.',DOMAIN='@teachers.invalid';
export function teacherLoginLabel(email){const value=String(email??'').trim().toLowerCase();const match=value.match(/^mchisnymlincoejkxmxm\.([a-z]{1,32})@teachers\.invalid$/);return match?match[1]:value;}
export function teacherAuthEmail(input){
 const raw=String(input??'').trim();
 const value=/^[\x00-\x7f]*$/.test(raw)?raw.toLowerCase():'';
 if(/^[a-z]{1,32}$/.test(value))return PREFIX+value+DOMAIN;
 if(value.length<=254&&/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(value)&&!value.endsWith('.invalid'))return value;
 throw Error('ID는 이메일 또는 영문자만 1~32자로 입력하세요. 영문 ID는 대소문자를 구분하지 않습니다.');
}
