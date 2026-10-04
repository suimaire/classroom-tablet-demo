import {LocalPdfBinaryDataFactory} from './pdf-assets.js';
const clean = (s) => s.replace(/\s+/g, '').normalize('NFKC');
export function classCode(s) { const m = clean(s).match(/(\d+)학년(\d+)([A-Za-z]?)반/) ?? s.match(/Class\s*(\d+)\s*[-/]\s*(\d+)([A-Za-z]?)/i); return m ? `${m[1]}-${m[2]}${m[3].toUpperCase()}` : ''; }
export function expandStudentNumber(raw, prefix) { const n = raw.trim(); if (!/^\d{3}$/.test(prefix))
    throw Error('관리자 학번 접두 3자리를 먼저 확인하세요.'); if (/^\d{5}$/.test(n)) {
    if (!n.startsWith(prefix))
        throw Error('전체 학번의 접두가 관리자 설정과 다릅니다.');
    return n;
} if (/^\d{1,2}$/.test(n))
    return prefix + n.padStart(2, '0'); throw Error('개인 번호 1~2자리 또는 전체 학번 5자리를 입력하세요.'); }
export function resolvePdfStudent(raw, roster) {
    const number = String(raw).trim();
    if (!/^(\d{1,2}|\d{5})$/.test(number)) throw Error('개인 번호 1~2자리 또는 전체 학번 5자리를 입력하세요.');
    const matches = roster.filter(s => /^\d{5}$/.test(s.number) && (number.length === 5 ? s.number === number : s.number.endsWith(number.padStart(2, '0'))));
    if (!matches.length) throw Error('미등록 번호: ' + number);
    if (matches.length !== 1) throw Error('여러 학생과 연결되는 모호한 번호입니다. 전체 학번 5자리를 입력하세요: ' + number);
    return matches[0];
}
function groups(values, tolerance) { const bins = []; for (const v of values.slice().sort((a, b) => a - b)) {
    const b = bins.find(b => Math.abs(b.reduce((a, x) => a + x, 0) / b.length - v) <= tolerance);
    if (b)
        b.push(v);
    else
        bins.push([v]);
} return bins.map(b => b.reduce((a, x) => a + x, 0) / b.length); }
export function inferPdf(items) {
    if (items.length > 10000)
        throw Error('텍스트 항목이 너무 많아 수동 입력이 필요합니다.');
    const text = items.filter(t => t.text.trim()).map(t => ({ ...t, text: t.text.trim() }));
    const blanks = text.filter(t => /^(빈\s*자리|빈\s*좌석|empty)$/i.test(t.text));
    const board = text.filter(t => /^(교탁|칠판|teacher|board)$/i.test(t.text));
    const header = text.find(t => classCode(t.text)) ?? groups(text.map(t => t.y), 2).map(y => { const line = text.filter(t => Math.abs(t.y - y) <= 2).sort((a, b) => a.x - b.x); return { ...line[0], text: line.map(t => t.text).join(' ') }; }).find(t => classCode(t.text));
    const numbers = text.filter(t => /^(\d{1,2}|\d{5})$/.test(t.text));
    const labels = text.filter(t => !/^(\d|빈\s*자리|빈\s*좌석|empty|교탁|칠판|teacher|board|Seatrus)/i.test(t.text) && !classCode(t.text));
    const used = new Set();
    const anchors = blanks.map(t => ({ x: t.x + t.width / 2, y: t.y, rawNumber: '', name: '' }));
    const issues = [];
    for (const num of numbers) {
        const candidates = labels.filter(t => !used.has(t) && t.y > num.y + 2 && t.y < num.y + 40 && Math.abs(t.x - num.x) < 65);
        candidates.sort((a, b) => Math.abs(a.y - num.y - 18) + Math.abs(a.x - num.x) * .15 - (Math.abs(b.y - num.y - 18) + Math.abs(b.x - num.x) * .15));
        const name = candidates[0];
        if (!name) {
            issues.push('이름과 연결되지 않은 번호가 있습니다. 좌석을 직접 확인하세요.');
            continue;
        }
        used.add(name);
        anchors.push({ x: name.x + name.width / 2, y: name.y, rawNumber: num.text, name: name.text });
    }
    if (!anchors.length)
        return { rows: 4, cols: 8, seatColumns: 8, boardSide: '', classLabel: header?.text ?? '', cells: Array.from({ length: 32 }, (_, i) => ({ row: Math.floor(i / 8) + 1, col: i % 8 + 1, kind: 'desk', rawNumber: '', name: '' })), issues: ['추출 가능한 좌석 텍스트가 없습니다. 스캔 PDF 자동 OCR은 지원하지 않습니다. 원본 위 번호를 직접 입력하세요.'], scanned: true };
    const ys = groups(anchors.map(x => x.y), 10), xs = groups(anchors.map(x => x.x), 13);
    if (ys.length > 20 || xs.length > 20)
        throw Error('좌석 격자를 안전하게 추론할 수 없습니다. 수동 입력을 사용하세요.');
    const gaps = xs.slice(1).map((x, i) => x - xs[i]), minGap = Math.min(...gaps);
    const aisleAfter = new Set(gaps.map((g, i) => g > minGap * 1.10 && g > minGap + 7 ? i : -1).filter(i => i >= 0));
    const colMap = xs.map((_, i) => i + 1 + [...aisleAfter].filter(a => a < i).length), cols = xs.length + aisleAfter.size, cells = [];
    for (let r = 0; r < ys.length; r++)
        for (let x = 0; x < xs.length; x++) {
            const found = anchors.filter(t => Math.abs(t.x - xs[x]) <= 13 && Math.abs(t.y - ys[r]) <= 10);
            if (found.length > 1)
                issues.push('한 좌석에서 여러 번호가 추출되었습니다.');
            if (!found.length)
                issues.push('원본 표기가 없는 빈자리를 추정했습니다. 원본과 대조하세요.');
            cells.push({ row: r + 1, col: colMap[x], kind: 'desk', rawNumber: found[0]?.rawNumber ?? '', name: found[0]?.name ?? '' });
            if (aisleAfter.has(x))
                cells.push({ row: r + 1, col: colMap[x] + 1, kind: 'aisle', rawNumber: '', name: '' });
        }
    const b = board[0];
    let boardSide = '';
    if (b && b.y > Math.max(...ys))
        boardSide = 'bottom';
    else if (b && b.y < Math.min(...ys))
        boardSide = 'top';
    else
        issues.push('교탁 방향을 확인해 선택하세요.');
    if (!header)
        issues.push('반 제목을 읽지 못했습니다. 대상 학급을 직접 확인하세요.');
    if (anchors.filter(x => x.rawNumber).length !== numbers.length)
        issues.push('번호 추출 수와 좌석 수가 다릅니다.');
    const deskWidth = Number.isFinite(minGap) ? minGap : 80, rowHeight = ys.length > 1 ? Math.min(...ys.slice(1).map((y, i) => y - ys[i])) : 70, columnWidths = xs.flatMap((_, i) => aisleAfter.has(i) ? [deskWidth, Math.max(8, gaps[i] - deskWidth)] : [deskWidth]);
    return { rows: ys.length, cols, seatColumns: xs.length, boardSide, classLabel: header?.text ?? '', cells, issues: [...new Set(issues)], scanned: false, sourceGrid: { left: xs[0] - deskWidth / 2, top: ys[0] - rowHeight / 2, width: xs.at(-1) - xs[0] + deskWidth, height: ys.at(-1) - ys[0] + rowHeight, columnWidths } };
}
export function validatePdfDraft(d, context) { const errors = [], seen = new Set(); if (!context.roster && !/^\d{3}$/.test(context.prefix))
    errors.push('관리자 학번 접두 3자리를 먼저 확인하세요.'); if (!Number.isInteger(d.rows) || !Number.isInteger(d.cols) || d.rows < 1 || d.cols < 1 || d.rows > 30 || d.cols > 30)
    errors.push('교실 크기는 1~30행·열이어야 합니다.'); const positions = new Set(); for (const c of d.cells) {
    const k = c.row + ":" + c.col;
    if (!Number.isInteger(c.row) || !Number.isInteger(c.col) || c.row < 1 || c.col < 1 || c.row > d.rows || c.col > d.cols || positions.has(k))
        errors.push('좌석 좌표가 중복되거나 범위를 벗어났습니다.');
    positions.add(k);
    if (!['desk', 'aisle', 'void'].includes(c.kind) || (c.kind !== 'desk' && c.rawNumber.trim()))
        errors.push('통로·제외 공간에는 학생을 지정할 수 없습니다.');
} if (d.cells.length !== d.rows * d.cols)
    errors.push('모든 공간을 확인하세요.'); const expected = classCode(context.classLabel), detected = classCode(d.classLabel); if (expected && detected && expected !== detected)
    errors.push('PDF 반 제목이 선택한 학급과 다릅니다. 관리자가 대상을 확인해야 합니다.'); if (!['top', 'bottom'].includes(d.boardSide))
    errors.push('원본 교탁 방향을 선택하세요.'); const cells = d.cells.map(c => { let studentNumber = ''; if (c.kind === 'desk' && c.rawNumber.trim())
    try {
        studentNumber = context.roster ? resolvePdfStudent(c.rawNumber, context.roster).number : expandStudentNumber(c.rawNumber, context.prefix);
        if (seen.has(studentNumber))
            errors.push(`중복 학번: ${studentNumber}`);
        seen.add(studentNumber);
        if (context.roster) {
            const student = context.roster.find(x => x.number === studentNumber);
            if (!student)
                errors.push(`미등록 학번: ${studentNumber}`);
            else if (!c.name.trim() || clean(c.name) !== clean(student.name))
                errors.push(`학번과 이름 불일치: ${studentNumber}`);
        }
    }
    catch (e) {
        errors.push(`${c.row}행 ${c.col}열: ${e instanceof Error ? e.message : String(e)}`);
    } return { row: c.row, col: c.col, kind: c.kind, studentNumber }; }); if (context.roster && (seen.size !== context.roster.length || context.roster.some(s => !seen.has(s.number)))) errors.push(`모든 재적 학생을 한 번씩 배치하세요. 현재 ${seen.size}/${context.roster.length}명 — 결석해도 명단에서 제외하지 않습니다.`); return { errors: [...new Set(errors)], layout: { rows: d.rows, cols: d.cols, boardSide: d.boardSide, cells } }; }
export async function loadLocalPdf(bytes, {signal} = {}) {
    if (signal?.aborted) throw new DOMException('취소되었습니다.', 'AbortError');
    if (bytes.byteLength > 15 * 1024 * 1024)
        throw Error('PDF는 15MB 이하만 지원합니다.');
    const pdf = await import('./pdf.mjs');
    pdf.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.mjs', import.meta.url).href;
    const task = pdf.getDocument({ data: bytes, BinaryDataFactory: LocalPdfBinaryDataFactory, useWorkerFetch: false, isEvalSupported: false, enableXfa: false, disableAutoFetch: true, disableStream: true, cMapUrl: new URL('./', import.meta.url).href, cMapPacked: true, standardFontDataUrl: new URL('./', import.meta.url).href, wasmUrl: new URL('./', import.meta.url).href });
    const abort = () => { void task.destroy().catch(() => {}); };
    signal?.addEventListener('abort', abort, {once: true});
    const close = () => { signal?.removeEventListener('abort', abort); return task.destroy(); };
    try {
        if (signal?.aborted) { await close(); throw new DOMException('취소되었습니다.', 'AbortError'); }
        const doc = await task.promise;
        if (doc.numPages !== 1)
            throw Error('자동 가져오기는 1쪽 PDF만 지원합니다. 페이지별로 나누어 주세요.');
        const page = await doc.getPage(1), v = page.getViewport({ scale: 1 }), content = await page.getTextContent();
        const items = content.items.filter((x) => typeof x.str === 'string').map((t) => ({ text: t.str, x: v.transform[0] * t.transform[4] + v.transform[2] * t.transform[5] + v.transform[4], y: v.transform[1] * t.transform[4] + v.transform[3] * t.transform[5] + v.transform[5], width: t.width, height: t.height }));
        return { items, width: v.width, height: v.height, render: async (canvas) => { const view = page.getViewport({ scale: Math.min(1.5, 1400 / v.width) }); canvas.width = view.width; canvas.height = view.height; await page.render({ canvasContext: canvas.getContext('2d'), canvas, viewport: view }).promise; }, close };
    }
    catch (e) {
        await close();
        throw e;
    }
}
