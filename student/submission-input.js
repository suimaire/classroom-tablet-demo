import { assert, validateShape } from './core.js';
import { readSubmissionXlsx } from './excel.js';
/** Whitelist serialization: input names, photos, metadata, file names and bytes never leave here. */
export function normalizeSubmission(raw) {
    assert(raw && typeof raw === 'object' && !Array.isArray(raw), '자리표 객체가 필요합니다.');
    const p = raw;
    const shape = { rows: p.rows, cols: p.cols, boardSide: p.boardSide };
    validateShape(shape);
    assert(['top', 'bottom'].includes(shape.boardSide), '원본 교탁 방향을 확인하세요.');
    assert(Array.isArray(p.cells) && p.cells.length <= 900, '자리 목록은 최대 900칸입니다.');
    const positions = new Set(), numbers = new Set();
    const cells = p.cells.map((v) => { assert(v && typeof v === 'object' && !Array.isArray(v), '자리 형식이 잘못되었습니다.'); const x = v; const c = { row: x.row, col: x.col, kind: x.kind, studentNumber: x.studentNumber }; validateShape({ ...shape, spaces: [c] }); assert(typeof c.studentNumber === 'string' && c.studentNumber.length <= 30, '학번은 30자 이하 문자열이어야 합니다.'); assert(c.kind === 'desk' || !c.studentNumber, '통로·제외 공간에 학생을 넣을 수 없습니다.'); const key = c.row + ':' + c.col; assert(!positions.has(key), '중복 좌석이 있습니다.'); positions.add(key); if (c.studentNumber) {
        assert(c.studentNumber === c.studentNumber.trim(), '학번 앞뒤 공백을 제거하세요.');
        assert(!numbers.has(c.studentNumber), '중복 학생 번호가 있습니다.');
        numbers.add(c.studentNumber);
    } return c; });
    assert(numbers.size > 0, '학생이 배치된 자리표를 선택하세요.');
    return { ...shape, cells: cells.sort((a, b) => a.row - b.row || a.col - b.col) };
}
export function parseSubmissionJson(text, target) { assert(new TextEncoder().encode(text).length <= 200000, 'JSON은 200KB 이하만 지원합니다.'); const p = JSON.parse(text); assert(p && typeof p === 'object' && !Array.isArray(p), '동적 자리표 JSON을 사용하세요.'); if (p.courseId !== undefined)
    assert(p.courseId === target.courseId, '다른 수업의 파일입니다.'); if (p.baseVersion !== undefined)
    assert(p.baseVersion === target.baseVersion, '파일의 기준 버전이 배부받은 버전과 다릅니다.'); return normalizeSubmission(p); }
export function parseSubmissionXlsx(bytes, target) { return normalizeSubmission(readSubmissionXlsx(bytes, target)); }
export function submissionRequest(target, layout, requestId) { assert(/^[0-9a-f-]{36}$/i.test(target.courseId) && /^[0-9a-f-]{36}$/i.test(requestId), '수업 또는 요청 ID 오류'); assert(Number.isSafeInteger(target.baseVersion) && target.baseVersion >= 1, '기준 버전을 확인하세요.'); return { p_course: target.courseId, p_request: requestId, p_base: target.baseVersion, p_payload: normalizeSubmission(layout) }; }
export const STUDENT_SERVER_FAILURE = '제출을 확인하지 못했습니다. 로그인·학급 권한·연결 상태를 확인하거나 담당자에게 문의하세요. 서버 명렬 정보는 표시하지 않습니다.';
export function receiptText(value) { const v = value; if (!v || v.received !== true || typeof v.receipt !== 'string' || !/^[0-9a-f-]{36}$/i.test(v.receipt))
    throw Error(STUDENT_SERVER_FAILURE); return `접수 완료 · ${v.receipt}. 적용 여부·수정 요청은 담당자에게 확인하세요.`; }
