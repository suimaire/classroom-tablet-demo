import { layoutCells, fromCells } from './layout.js';
import { layoutOf } from './core.js';
import { read, write, utils } from './xlsx.mjs';
import { assert, parseRoster, parseSeats, fingerprint } from './core.js';
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export { MIME as XLSX_MIME };
// Inspect ZIP directory before decompression to reject oversized/ambiguous workbooks.
function inspectZip(data) { assert(data.length <= 5 * 1024 * 1024, 'XLSX는 5MB 이하만 지원합니다.'); const v = new DataView(data.buffer, data.byteOffset, data.byteLength); assert(data.length >= 22 && v.getUint32(0, true) === 0x04034b50, '정상적인 XLSX ZIP 파일이 아닙니다.'); let end = -1; for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
        end = i;
        break;
    }
} assert(end >= 0, 'XLSX ZIP 구조 오류'); const count = v.getUint16(end + 10, true); assert(count > 0 && count <= 2000 && v.getUint16(end + 4, true) === 0 && v.getUint16(end + 6, true) === 0, '분할 ZIP 또는 ZIP64는 지원하지 않습니다.'); let at = v.getUint32(end + 16, true), total = 0; const names = new Set(); for (let i = 0; i < count; i++) {
    assert(at + 46 <= end && v.getUint32(at, true) === 0x02014b50, 'XLSX ZIP 디렉터리 오류');
    assert(!(v.getUint16(at + 8, true) & 1), '암호화된 XLSX는 지원하지 않습니다.');
    total += v.getUint32(at + 24, true);
    assert(total <= 10 * 1024 * 1024, '압축 해제 크기가 10MB를 넘습니다.');
    const n = v.getUint16(at + 28, true), extra = v.getUint16(at + 30, true), comment = v.getUint16(at + 32, true);
    assert(at + 46 + n + extra + comment <= end, 'XLSX ZIP 항목 오류');
    const name = new TextDecoder().decode(data.subarray(at + 46, at + 46 + n));
    assert(!names.has(name), '중복 ZIP 항목');
    names.add(name);
    assert(!/vbaProject|externalLinks/i.test(name), '매크로 또는 외부 연결이 포함된 파일은 지원하지 않습니다.');
    at += 46 + n + extra + comment;
} assert(names.has('xl/workbook.xml'), 'XLSX 통합 문서가 아닙니다.'); }
export function makeWorkbook(kind, rows, c) { const wb = utils.book_new(), ws = utils.aoa_to_sheet(rows); ws['!cols'] = kind === 'roster' ? [{ wch: 20 }, { wch: 28 }] : [{ wch: 12 }, { wch: 12 }, { wch: 22 }]; const numberCol = kind === 'roster' ? 0 : 2; for (let r = 1; r < rows.length; r++) {
    const cell = ws[utils.encode_cell({ r, c: numberCol })];
    if (cell) {
        cell.t = 's';
        cell.v = String(cell.v);
        cell.z = '@';
    }
} utils.book_append_sheet(wb, ws, kind === 'roster' ? '명렬' : '자리표'); if (kind === 'seats' && c)
    utils.book_append_sheet(wb, utils.aoa_to_sheet([['key', 'value'], ['schemaVersion', '1'], ['courseId', c.id], ['baseVersion', String(c.version)], ['fingerprint', fingerprint(c)]]), '_meta'); return new Uint8Array(write(wb, { bookType: 'xlsx', type: 'array', compression: true })); }
function open(data, kind, sheetName) {
    inspectZip(data);
    let wb;
    if (kind === 'school' || kind === 'roster') {
        const sheets = listRosterSheets(data), visible = sheets.filter(s => !s.hidden);
        if (!sheetName && sheets.length === 1 && visible.length === 1) sheetName = visible[0].name;
        assert(sheets.some(s => s.name === sheetName && !s.hidden), '가져올 표시 시트를 선택하세요.');
    }
    try {
        wb = read(data, { type: 'array', cellFormula: true, cellDates: false, ...((kind === 'school' || kind === 'roster') ? {sheets:[sheetName]} : {}), sheetRows: kind === 'school' ? 10002 : 902 });
    }
    catch {
        throw Error('XLSX 파일을 읽을 수 없습니다. 암호 없이 저장한 .xlsx 양식을 사용하세요.');
    }
    const name = kind === 'school' || kind === 'roster' ? sheetName : '자리표';
    assert(wb.SheetNames.includes(name), `시트 이름은 ${name}이어야 합니다. 앱의 XLSX 양식을 사용하세요.`);
    if (kind !== 'school' && kind !== 'roster') assert(wb.SheetNames.every(n => n === name || (kind === 'seats' && n === '_meta')), '지원하지 않는 추가 시트가 있습니다.');
    for (const sheet of Object.values(wb.Sheets)) {
        if (kind !== 'school') assert(!sheet['!merges']?.length, '병합 셀은 지원하지 않습니다.');
        else for (const merge of sheet['!merges'] ?? []) {
            const title = sheet[utils.encode_cell(merge.s)]?.v;
            assert(merge.s.r === merge.e.r && typeof title === 'string' && (/^\s*\d+학년\s*\d+[A-Za-z0-9]*반(?:\s|$)/.test(title) || /^(?:남|여|총원|합계)/.test(title) || /트랙|track/i.test(title)), '반 제목·트랙 설명·집계의 가로 병합만 지원합니다.');
        }
        const ref = sheet['!fullref'] || sheet['!ref'];
        if (ref) {
            const range = utils.decode_range(ref);
            const maxRows = kind === 'school' ? 10000 : 900;
            assert(range.e.r <= maxRows && range.e.c <= 10, `XLSX는 헤더 포함 ${maxRows + 1}행·11열 이내로 작성하세요.`);
        }
        for (const [key, cell] of Object.entries(sheet)) {
            if (key.startsWith('!'))
                continue;
            assert(!cell.f && !cell.F, '수식 셀은 지원하지 않습니다. 값으로 붙여넣으세요.');
            assert(!cell.l, '하이퍼링크 셀은 지원하지 않습니다.');
        }
    }
    const rows = utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false });
    if (kind === 'school') return { wb, rows };
    const expected = kind === 'roster' ? ['studentNumber', 'name'] : rows[0]?.includes('kind') ? ['row', 'col', 'kind', 'studentNumber'] : ['row', 'col', 'studentNumber'];
    assert(rows[0]?.join(',') === expected.join(','), 'XLSX 헤더가 양식과 다릅니다.');
    assert(rows.every(r => r.length === expected.length), 'XLSX 열 수가 양식과 다릅니다.');
    const csv = rows.map(r => r.map(x => '"' + String(x).replaceAll('"', '""') + '"').join(',')).join('\n');
    return { wb, csv, rows };
}
export function importRosterXlsx(data, sheetName) { return parseRoster(open(data, 'roster', sheetName).csv); }
export function importSeatsXlsx(data, c) { return importLayoutXlsx(data, c).seats; }
function readLayoutWorkbook(data) {
    const { wb, csv, rows } = open(data, 'seats');
    let meta = {};
    if (wb.Sheets._meta) {
        const m = utils.sheet_to_json(wb.Sheets._meta, { header: 1, raw: false, defval: '' });
        assert(m[0]?.join(',') === 'key,value' && m.slice(1).every(x => x.length === 2) && new Set(m.slice(1).map(x => x[0])).size === m.length - 1, 'XLSX 메타데이터 오류');
        meta = Object.fromEntries(m.slice(1));
        assert(['1', '2'].includes(meta.schemaVersion), '지원하지 않는 XLSX 버전');
    }
    return { csv, rows, meta };
}
function dynamicWorkbook(rows, meta) { assert(rows[0].includes('kind') && meta.schemaVersion === '2' && meta.rows && meta.cols && ['top', 'bottom'].includes(meta.boardSide), '원격 XLSX는 _meta 크기·교탁 방향이 포함된 동적 4열 자리표 양식이 필요합니다.'); return { rows: Number(meta.rows), cols: Number(meta.cols), boardSide: meta.boardSide, cells: rows.slice(1).map(r => ({ row: Number(r[0]), col: Number(r[1]), kind: r[2], studentNumber: r[3] })) }; }
export function readSubmissionXlsx(data, target) {
    const { rows, meta } = readLayoutWorkbook(data);
    if (meta.courseId)
        assert(meta.courseId === target.courseId, '다른 수업의 XLSX입니다.');
    if (meta.baseVersion)
        assert(meta.baseVersion === String(target.baseVersion), 'XLSX의 기준 버전이 배부받은 버전과 다릅니다.');
    return dynamicWorkbook(rows, meta);
}
export function importLayoutXlsx(data, c) {
    const { csv, rows, meta } = readLayoutWorkbook(data);
    if (meta.courseId) {
        assert(meta.courseId === c.id, '다른 학급·학기의 XLSX입니다.');
        assert(meta.baseVersion === String(c.version) && meta.fingerprint === fingerprint(c), '오래된 XLSX입니다. 최신 양식으로 다시 제출하세요.');
    }
    if (rows[0].includes('kind')) {
        const { cells, ...shape } = dynamicWorkbook(rows, meta);
        return fromCells(cells, shape, c);
    }
    return { ...layoutOf(c), seats: parseSeats(csv, c) };
}
export function makeLayoutWorkbook(c, layout = layoutOf(c)) {
    const wb = utils.book_new(), rows = [['row', 'col', 'kind', 'studentNumber'], ...layoutCells(c, layout).map(x => [x.row, x.col, x.kind, x.studentNumber])], ws = utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 22 }];
    for (let r = 1; r < rows.length; r++) {
        const cell = ws[utils.encode_cell({ r, c: 3 })];
        if (cell) {
            cell.t = 's';
            cell.v = String(cell.v);
            cell.z = '@';
        }
    }
    utils.book_append_sheet(wb, ws, '자리표');
    utils.book_append_sheet(wb, utils.aoa_to_sheet([['key', 'value'], ['schemaVersion', '2'], ['courseId', c.id], ['baseVersion', String(c.version)], ['fingerprint', fingerprint(c)], ['rows', String(layout.rows)], ['cols', String(layout.cols)], ['boardSide', layout.boardSide]]), '_meta');
    return new Uint8Array(write(wb, { bookType: 'xlsx', type: 'array', compression: true }));
}

// School-wide input is separately mapped and validated; never use the class parser.
export function readSchoolRosterXlsx(data, sheetName) { return open(data, 'school', sheetName).rows; }
export function listRosterSheets(data) {
    inspectZip(data);
    const wb = read(data, {type:'array', sheets:[]});
    return wb.SheetNames.map((name,i) => ({name, hidden: !!wb.Workbook?.Sheets?.[i]?.Hidden}));
}
