import { assert, cellKind, layoutOf, validateShape, validateSeats, parseSeats, fingerprint } from './core.js';
export function layoutCells(c, layout = layoutOf(c)) { return Array.from({ length: layout.rows * layout.cols }, (_, i) => { const row = Math.floor(i / layout.cols) + 1, col = i % layout.cols + 1, seat = layout.seats.find(x => x.row === row && x.col === col); return { row, col, kind: cellKind(layout, row, col), studentNumber: seat ? c.roster.find(x => x.studentId === seat.studentId).number : '' }; }); }
export function fromCells(raw, shape, c) {
    validateShape(shape);
    assert(Array.isArray(raw) && raw.length <= 900, '공간 목록은 최대 900칸까지 지원합니다.');
    const seen = new Set();
    const byPos = new Map();
    for (const x of raw) {
        assert(x && typeof x === 'object', '공간 형식 오류');
        validateShape({ ...shape, spaces: [x] });
        const key = x.row + ':' + x.col;
        assert(!seen.has(key), `중복 자리: ${x.row}행 ${x.col}열`);
        seen.add(key);
        assert(typeof x.studentNumber === 'string', '학번은 문자열이어야 합니다.');
        assert(x.kind === 'desk' || x.studentNumber === '', '통로·제외 공간에는 학번을 입력할 수 없습니다.');
        byPos.set(key, x);
    }
    const spaces = [], seats = [];
    for (let row = 1; row <= shape.rows; row++)
        for (let col = 1; col <= shape.cols; col++) {
            const x = byPos.get(row + ':' + col), kind = x?.kind ?? 'void';
            if (kind !== 'desk')
                spaces.push({ row, col, kind });
            if (x?.studentNumber) {
                const e = c.roster.find(e => e.active && e.number === x.studentNumber);
                assert(e, `미등록 학번: ${x.studentNumber}`);
                seats.push({ row, col, studentId: e.studentId });
            }
        }
    const layout = { ...shape, spaces, seats };
    validateSeats(seats, { ...c, ...layout });
    return layout;
}
export function layoutFile(c, layout = layoutOf(c)) { validateShape(layout); validateSeats(layout.seats, { ...c, ...layout }); return { kind: 'classroom-layout', schemaVersion: 2, courseId: c.id, baseVersion: c.version, fingerprint: fingerprint(c), rows: layout.rows, cols: layout.cols, boardSide: layout.boardSide, cells: layoutCells(c, layout) }; }
export function parseLayout(text, c) {
    assert(text.length <= 300000, '배치 파일은 300KB 이하만 지원합니다.');
    if (text.trim().startsWith('{')) {
        const d = JSON.parse(text);
        if (d.kind === 'classroom-layout') {
            assert(d.schemaVersion === 2, '지원하지 않는 배치 버전');
            if (d.courseId !== undefined) {
                assert(d.courseId === c.id, '다른 학급·학기 제출 파일');
                assert(d.baseVersion === c.version && d.fingerprint === fingerprint(c), '오래된 배치입니다. 최신 양식으로 다시 제출하세요.');
            }
            return fromCells(d.cells, { rows: d.rows, cols: d.cols, boardSide: d.boardSide }, c);
        }
    }
    // Legacy files retain the current geometry and never infer a rotation or resize.
    return { ...layoutOf(c), seats: parseSeats(text, c) };
}
