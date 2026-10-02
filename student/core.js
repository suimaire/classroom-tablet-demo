export const KEY = 'classroom-touch.v1';
export const uid = () => crypto.randomUUID();
export const defaultRules = () => [{ min: 5, score: 20 }, { min: 4, score: 19 }, { min: 3, score: 18 }, { min: 2, score: 17 }, { min: 1, score: 16 }, { min: 0, score: 15 }];
export function seed() { const students = Array.from({ length: 20 }, (_, i) => ({ id: uid(), name: ['가온', '나래', '다온', '라온', '마루', '바다', '새봄', '아람', '여울', '이든', '지음', '찬솔', '하람', '해솔', '고운', '누리', '도담', '보람', '소담', '윤슬'][i] + ' (가상)', photo: '' })); return { schemaVersion: 1, revision: 0, students, classes: [{ id: 'class-1', name: '1학년 1반' }], terms: [{ id: 'term-1', name: '2026학년도 1학기' }], courses: [{ id: 'course-1', classId: 'class-1', termId: 'term-1', rows: 4, cols: 5, version: 1, roster: students.map((s, i) => ({ studentId: s.id, number: String(10101 + i), active: true })), seats: students.map((s, i) => ({ row: Math.floor(i / 5) + 1, col: i % 5 + 1, studentId: s.id })), rules: defaultRules() }], events: [], submissions: [] }; }
export function assert(ok, message) {
    if (!ok)
        throw Error(message);
}
export function validateRules(r) { assert(Array.isArray(r) && r.length > 0 && r.length <= 30, '점수 기준은 1~30개가 필요합니다.'); const seen = new Set(); r.forEach(x => { assert(Number.isInteger(x.min) && x.min >= 0 && x.min <= 10000, '횟수는 0~10000 정수여야 합니다.'); assert(Number.isFinite(x.score) && x.score >= 0 && x.score <= 100, '점수는 0~100이어야 합니다.'); assert(!seen.has(x.min), '기준 횟수 중복'); seen.add(x.min); }); assert(seen.has(0), '0회 기준을 포함해 주세요.'); return [...r].sort((a, b) => b.min - a.min); }
export function points(count, r) { return validateRules(r).find(x => count >= x.min).score; }
export function countFor(s, courseId, studentId) { return s.events.filter(e => e.courseId === courseId && e.studentId === studentId && !e.undoneAt).length; }
export function record(s, c, studentId, at = new Date().toISOString()) { assert(c.roster.some(x => x.studentId === studentId && x.active), '활성 학생이 아닙니다.'); const e = { id: uid(), courseId: c.id, studentId, layoutVersion: c.version, at, undoneAt: null }; s.events.push(e); return e; }
export function undo(s, id) {
    const e = s.events.find(x => x.id === id);
    assert(e, '기록이 없습니다.');
    if (e.undoneAt)
        return false;
    e.undoneAt = new Date().toISOString();
    return true;
}
export function fingerprint(c) { return `${c.rows}x${c.cols}:` + (c.studentNumberPrefix ? `prefix=${c.studentNumberPrefix}:` : '') + c.roster.filter(x => x.active).map(x => `${x.number}=${x.studentId}`).sort().join('|'); }
export function validateSeats(value, c) { assert(Array.isArray(value) && value.length <= c.rows * c.cols, '자리 목록 또는 자리 수 오류'); const ids = new Set(), pos = new Set(); return value.map((raw, i) => { assert(raw && typeof raw === 'object', `${i + 1}번째 자리 형식 오류`); const { row, col, studentId } = raw; assert(Number.isInteger(row) && row >= 1 && row <= c.rows && Number.isInteger(col) && col >= 1 && col <= c.cols, `${i + 1}번째 자리: 행·열 범위 오류`); assert(cellKind(c, row, col) === 'desk', `${row}행 ${col}열: 통로·제외 공간에는 학생을 배치할 수 없습니다.`); assert(typeof studentId === 'string' && c.roster.some(x => x.active && x.studentId === studentId), `${i + 1}번째 자리: 미등록 학생`); assert(!ids.has(studentId), '중복 학생이 있습니다.'); assert(!pos.has(`${row}:${col}`), `중복 자리: ${row}행 ${col}열`); ids.add(studentId); pos.add(`${row}:${col}`); return { row, col, studentId }; }); }
export function csvParse(text) {
    const rows = [];
    let row = [], cell = '', quoted = false, closed = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    cell += '"';
                    i++;
                }
                else {
                    quoted = false;
                    closed = true;
                }
            }
            else
                cell += ch;
        }
        else if (ch === '"') {
            assert(cell === '' && !closed, 'CSV 따옴표 형식 오류');
            quoted = true;
        }
        else if (ch === ',' || ch === '\n' || ch === '\r') {
            row.push(cell);
            cell = '';
            closed = false;
            if (ch !== ',') {
                if (ch === '\r' && text[i + 1] === '\n')
                    i++;
                if (row.some(x => x !== ''))
                    rows.push(row);
                row = [];
            }
        }
        else {
            assert(!closed, 'CSV 닫힌 따옴표 뒤 문자 오류');
            cell += ch;
        }
    }
    assert(!quoted, 'CSV 따옴표가 닫히지 않았습니다.');
    if (cell !== '' || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}
export function parseSeats(text, c) {
    assert(text.length <= 200000, '자리표는 200KB 이하만 지원합니다.');
    const trim = text.trim();
    let rows;
    if (trim.startsWith('{')) {
        const data = JSON.parse(trim);
        assert(data.kind === 'seat-submission' && data.schemaVersion === 1, '지원하지 않는 제출 JSON');
        assert(data.courseId === c.id, '다른 학급·학기 제출 파일');
        assert(data.baseVersion === c.version, '오래된 제출물입니다. 최신 자리표 템플릿으로 다시 제출하세요.');
        assert(data.fingerprint === fingerprint(c), '명렬 또는 교실 크기가 변경되었습니다. 새 템플릿이 필요합니다.');
        return validateSeats(data.seats, c);
    }
    if (trim.startsWith('['))
        rows = JSON.parse(trim);
    else {
        const [h, ...r] = csvParse(trim);
        assert(h?.join(',') === 'row,col,studentNumber', 'CSV 첫 줄은 row,col,studentNumber여야 합니다.');
        rows = r.map((a, i) => { assert(a.length === 3, `${i + 2}번째 줄: 열은 3개여야 합니다.`); return { row: Number(a[0]), col: Number(a[1]), studentNumber: a[2].trim() }; });
    }
    assert(Array.isArray(rows), '자리 배열이 필요합니다.');
    return validateSeats(rows.map((r, i) => { assert(r && typeof r.studentNumber === 'string', `${i + 1}번째 자리: 학번은 문자열이어야 합니다.`); const e = c.roster.find(x => x.active && x.number === r.studentNumber); assert(e, `미등록 학번: ${r.studentNumber}`); return { row: r.row, col: r.col, studentId: e.studentId }; }), c);
}
export function validateStudent(number, name) { assert(/^[A-Za-z0-9_-]{1,30}$/.test(number), '학번은 영문·숫자·_·- 1~30자여야 합니다.'); assert(typeof name === 'string' && name.trim().length > 0 && name.length <= 50, '이름은 1~50자여야 합니다.'); }
export function parseRoster(text) { const [h, ...rows] = csvParse(text); assert(h?.join(',') === 'studentNumber,name', '명렬 CSV 첫 줄은 studentNumber,name이어야 합니다.'); assert(rows.length > 0 && rows.length <= 200, '1~200명까지 등록할 수 있습니다.'); const seen = new Set(); return rows.map((r, i) => { assert(r.length === 2, `${i + 2}번째 줄: 학번과 이름이 필요합니다.`); const [number, name] = r.map(x => x.trim()); validateStudent(number, name); assert(!seen.has(number), `중복 학번: ${number}`); seen.add(number); return { number, name }; }); }
export function submissionFile(c, seats) { return { kind: 'seat-submission', schemaVersion: 1, courseId: c.id, baseVersion: c.version, fingerprint: fingerprint(c), seats: validateSeats(seats, c) }; }
export function applySubmission(s, id) { const p = s.submissions.find(x => x.id === id); assert(p?.status === 'pending', '대기 중인 제출물이 아닙니다.'); const c = s.courses.find(x => x.id === p.courseId); assert(p.baseVersion === c.version && p.fingerprint === fingerprint(c), '명렬 또는 자리표가 변경되었습니다. 오래된 제출물은 적용할 수 없습니다.'); const target = { ...c, ...(p.layout ?? {}) }; validateShape(target); const seats = validateSeats(p.seats, target); if (p.layout)
    Object.assign(c, structuredClone(p.layout)); c.seats = seats; c.version++; p.status = 'applied'; }
function unique(items, label) { assert(new Set(items.map(x => x.id)).size === items.length, `${label} ID 중복`); items.forEach(x => assert(typeof x.id === 'string' && x.id.length > 0 && x.id.length < 100, `${label} ID 오류`)); }
export function validateState(raw) {
    const s = raw;
    assert(s && s.schemaVersion === 1, '지원하지 않는 백업 버전');
    assert(Number.isSafeInteger(s.revision) && s.revision >= 0, '백업 revision 오류');
    for (const key of ['students', 'classes', 'terms', 'courses', 'events', 'submissions']) {
        assert(Array.isArray(s[key]) && s[key].length <= (key === 'events' ? 100000 : 10000), `백업 ${key} 오류`);
        unique(s[key], key);
    }
    assert(s.classes.length && s.terms.length && s.courses.length, '학급·학기 정보 누락');
    s.students.forEach(p => { assert(typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 50, '이름 오류'); assert(typeof p.photo === 'string' && (p.photo === '' || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.photo)) && p.photo.length < 200000, '사진 오류'); });
    [...s.classes, ...s.terms].forEach(x => assert(typeof x.name === 'string' && x.name.length > 0 && x.name.length <= 60, '학급·학기 이름 오류'));
    const pairs = new Set();
    s.courses.forEach(c => {
        assert(s.classes.some(x => x.id === c.classId) && s.terms.some(x => x.id === c.termId), '수업 참조 오류');
        const pair = c.classId + ':' + c.termId;
        assert(!pairs.has(pair), '학급·학기 중복');
        pairs.add(pair);
        assert(Number.isInteger(c.rows) && c.rows > 0 && c.rows <= 30 && Number.isInteger(c.cols) && c.cols > 0 && c.cols <= 30 && Number.isInteger(c.version) && c.version >= 1, '교실 크기·버전 오류');
        assert(Array.isArray(c.roster) && c.roster.length <= 500, '명렬 오류');
        const ids = new Set(), numbers = new Set();
        c.roster.forEach(e => {
            assert(s.students.some(x => x.id === e.studentId) && typeof e.active === 'boolean', '학생 참조 오류');
            validateStudent(e.number, '검증');
            assert(!ids.has(e.studentId), '학생 소속 중복');
            ids.add(e.studentId);
            if (e.active) {
                assert(!numbers.has(e.number), '활성 학번 중복');
                numbers.add(e.number);
            }
        });
        assert(c.studentNumberPrefix === undefined || /^\d{3}$/.test(c.studentNumberPrefix), '학번 접두는 3자리 문자열이어야 합니다.');
        validateShape(c);
        validateSeats(c.seats, c);
        validateRules(c.rules);
    });
    const date = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));
    s.events.forEach(e => { const c = s.courses.find(c => c.id === e.courseId); assert(c && c.roster.some(p => p.studentId === e.studentId), '기록 참조 오류'); assert(Number.isInteger(e.layoutVersion) && e.layoutVersion >= 1 && e.layoutVersion <= c.version && date(e.at) && (e.undoneAt === null || date(e.undoneAt)), '기록 일시·버전 오류'); });
    s.submissions.forEach(p => { const c = s.courses.find(c => c.id === p.courseId); assert(c && date(p.at) && typeof p.label === 'string' && p.label.length <= 100 && typeof p.fingerprint === 'string' && Number.isInteger(p.baseVersion) && p.baseVersion >= 1 && ['pending', 'applied', 'rejected'].includes(p.status), '제출 정보 오류'); assert(Array.isArray(p.seats) && p.seats.length <= 900, '제출 자리 오류'); if (p.layout)
        validateShape(p.layout); const ids = new Set(), pos = new Set(); p.seats.forEach(x => { assert(Number.isInteger(x.row) && x.row >= 1 && x.row <= 30 && Number.isInteger(x.col) && x.col >= 1 && x.col <= 30 && c.roster.some(e => e.studentId === x.studentId), '제출 자리 참조 오류'); assert(!ids.has(x.studentId) && !pos.has(`${x.row}:${x.col}`), '제출 중복 오류'); ids.add(x.studentId); pos.add(`${x.row}:${x.col}`); }); });
    return s;
}
export function csvEncode(rows) {
    const safe = (v) => {
        let t = String(v);
        if (typeof v === 'string' && /^[=+\-@\t\r]/.test(t))
            t = "'" + t;
        return '"' + t.replaceAll('"', '""') + '"';
    };
    return '\uFEFF' + rows.map(r => r.map(safe).join(',')).join('\r\n');
}
/** Persist first; the caller adopts the returned snapshot only after success. */
export function commit(current, expected, storage, mutate) { assert(storage.getItem(KEY) === expected, '다른 탭에서 데이터가 바뀌었습니다. 새로고침 후 다시 시도하세요.'); const next = structuredClone(current); mutate(next); next.revision++; validateState(next); const serialized = JSON.stringify(next); storage.setItem(KEY, serialized); return { next, serialized }; }
export function cellKind(c, row, col) { return c.spaces?.find(x => x.row === row && x.col === col)?.kind ?? 'desk'; }
export function validateShape(c) {
    assert(Number.isInteger(c.rows) && c.rows >= 1 && c.rows <= 30 && Number.isInteger(c.cols) && c.cols >= 1 && c.cols <= 30, '배치 크기는 1~30행·1~30열까지 지원합니다.');
    assert(c.boardSide === undefined || c.boardSide === 'top' || c.boardSide === 'bottom', '원본 칠판 방향은 top 또는 bottom이어야 합니다.');
    assert(c.spaces === undefined || Array.isArray(c.spaces) && c.spaces.length <= 900, '공간 목록 오류');
    const positions = new Set();
    for (const x of c.spaces ?? []) {
        assert(Number.isInteger(x.row) && x.row >= 1 && x.row <= c.rows && Number.isInteger(x.col) && x.col >= 1 && x.col <= c.cols, '공간 좌표 범위 오류');
        assert(['desk', 'aisle', 'void'].includes(x.kind), '공간 유형 오류');
        const key = x.row + ':' + x.col;
        assert(!positions.has(key), '중복 공간 좌표');
        positions.add(key);
    }
}
export function layoutOf(c) { return { rows: c.rows, cols: c.cols, boardSide: c.boardSide ?? 'top', spaces: structuredClone(c.spaces ?? []), seats: structuredClone(c.seats) }; }
export function displayPositions(c, perspective) {
    const rotated = perspective === 'teacher' && (c.boardSide ?? 'top') === 'top';
    return Array.from({ length: c.rows * c.cols }, (_, i) => { const r = Math.floor(i / c.cols) + 1, cl = i % c.cols + 1; return { row: rotated ? c.rows + 1 - r : r, col: rotated ? c.cols + 1 - cl : cl }; });
}
