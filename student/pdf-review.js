import { loadLocalPdf, inferPdf, validatePdfDraft } from './pdf-input.js?v=20261005-student-pdf-2';
const escape = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** PDF bytes and extracted names remain in this dialog's memory; only reviewed cells leave it. */
export async function reviewPdfFile(file, context, options = {}) {
    if (file.size > 15 * 1024 * 1024)
        throw Error('PDF는 15MB 이하만 지원합니다.');
    if (options.signal?.aborted) return null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (options.signal?.aborted) return null;
    let source;
    try { source = await loadLocalPdf(bytes, {signal: options.signal}); }
    catch (error) { if (options.signal?.aborted) return null; throw error; }
    if (options.signal?.aborted) { await source.close(); return null; }
    let renderReady = false;
    let draft;
    try {
        draft = inferPdf(source.items, source.pathBoxes);
    }
    catch {
        draft = inferPdf([]);
        draft.issues.push('격자를 추론하지 못했습니다. 원본 위에 직접 입력하세요.');
    }
    const dialog = document.createElement('dialog');
    dialog.className = 'pdf-review';
    dialog.innerHTML = `<header><div><small>기기 내 PDF 처리 · 외부 전송 없음</small><h2>PDF 자리표 검토</h2></div><button type="button" id="pdf-close" aria-label="PDF 검토 닫기">닫기</button></header><p>대상 <strong>${escape(context.classLabel)}</strong> · ${options.remote ? '배부받은 접두' : '관리자 확인 접두'} <strong>${escape(context.prefix)}</strong><br>개인 번호 34 → ${escape(context.prefix)}34. 이름으로 학생을 추측하지 않습니다.</p>${options.remote ? '<p class="notice">서버에서는 등록 학번과 자리 정보만 확인합니다. 이름은 이 기기의 원본 대조용으로만 표시하고 전송하지 않습니다. 최종 제출 시 학번 전체와 현재 기준 버전을 검증합니다.</p>' : ''}<p id="pdf-detected"></p><div id="pdf-warnings" class="notice warning"></div><div class="pdf-controls"><label>원본 교탁 방향<select id="pdf-board"><option value="">방향 확인 필요</option><option value="top">위쪽</option><option value="bottom">아래쪽 (이중 회전 없음)</option></select></label><button id="pdf-manual" type="button">수동 격자로 다시 입력</button><button id="pdf-overlay-toggle" type="button">입력 격자 숨기기 / 보기</button></div><details id="pdf-manual-options"><summary>격자 크기 · 원본 위 위치 조정</summary><p>행·열은 통로를 포함합니다. 원본에 맞게 입력칸 위치를 조절하고 아래 표에서 통로·빈자리도 확인하세요.</p><div class="pdf-controls"><label>행<input id="pdf-rows" type="number" min="1" max="30" value="${draft.rows}"></label><label>열 (통로 포함)<input id="pdf-cols" type="number" min="1" max="30" value="${draft.cols}"></label><button type="button" id="pdf-resize">격자 크기 적용 (번호 초기화)</button>${[['left', '왼쪽', 8], ['top', '위쪽', 25], ['width', '너비', 84], ['height', '높이', 48]].map(([id, label, value]) => `<label>${label} %<input data-bound="${id}" type="number" min="0" max="100" value="${value}"></label>`).join('')}</div></details><div class="pdf-scroll"><div class="pdf-paper"><canvas id="pdf-canvas" aria-label="선택한 PDF 원본"></canvas><div id="pdf-overlay"></div></div></div><p>책상을 추가하려면 원본 대조를 마친 뒤 ‘이 배치로 미리보기’를 누르고, 미리보기의 ‘책상 하나 추가’를 사용하세요. 원본 PDF 위 입력 격자는 변경하지 않습니다.</p><h3>추출 내용 수정</h3><p>번호를 비우면 빈 책상입니다. 이름이 다른 경우 원본·명렬을 확인한 뒤 수정하세요. 추출 결과는 아직 자리표에 반영되지 않았습니다.</p><div class="pdf-table-wrap"><table><thead><tr><th>원본 좌표</th><th>공간</th><th>개인 번호 / 전체 학번</th><th>이름 대조</th></tr></thead><tbody id="pdf-cells"></tbody></table></div><div id="pdf-errors" class="notice warning" role="status"></div><label class="pdf-confirm"><input type="checkbox" id="pdf-confirm"> 원본의 학급·전체 자리·빈자리·통로·교탁 방향과 추출 경고를 모두 대조했습니다</label><div class="dialog-actions"><button class="primary" id="pdf-next" disabled>${escape(options.continueLabel ?? '교사 검토함으로 보내기')}</button></div>`;
    document.body.append(dialog);
    dialog.showModal();
    const q = (s) => dialog.querySelector(s);
    const board = q('#pdf-board'), confirm = q('#pdf-confirm'), next = q('#pdf-next');
    board.value = draft.boardSide;
    function check(reset = false) { if (reset)
        confirm.checked = false; draft.boardSide = board.value; const result = validatePdfDraft(draft, context); q('#pdf-errors').textContent = result.errors.length ? result.errors.join(' · ') : `검증 통과 · 배치 ${result.layout.cells.filter(c => c.studentNumber).length}명 · 빈 책상 ${result.layout.cells.filter(c => c.kind === 'desk' && !c.studentNumber).length}칸 · 통로 ${result.layout.cells.filter(c => c.kind === 'aisle').length}칸`; next.disabled = !renderReady || !!result.errors.length || !confirm.checked; return result; }
    function bounds() { const o = q('#pdf-overlay'); for (const key of ['left', 'top', 'width', 'height']) {
        const input = q(`[data-bound="${key}"]`);
        const value = Math.max(0, Math.min(100, Number(input.value) || 0));
        o.style[key] = value + '%';
    } confirm.checked = false; check(); }
    function rows() { q('#pdf-detected').textContent = `추출 제목: ${draft.classLabel || '없음 — 대상 학급을 원본에서 직접 확인'} · ${draft.rows}행 × ${draft.cols}열 (통로 포함)${draft.scanned ? ' · 수동 입력' : ''}`; q('#pdf-warnings').textContent = ['간격으로 추정한 통로와 빈자리는 반드시 원본과 대조하세요.', ...draft.issues].join(' '); q('#pdf-cells').innerHTML = draft.cells.map((c, i) => `<tr><td>${c.row}행 ${c.col}열</td><td><select data-index="${i}" data-field="kind" aria-label="${c.row}행 ${c.col}열 공간">${[['desk', '책상'], ['aisle', '통로'], ['void', '제외']].map(([value, label]) => `<option value="${value}" ${c.kind === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td><td><input data-index="${i}" data-field="rawNumber" inputmode="numeric" maxlength="5" value="${escape(c.rawNumber)}" aria-label="${c.row}행 ${c.col}열 번호" ${c.kind !== 'desk' ? 'disabled' : ''}></td><td><input data-index="${i}" data-field="name" maxlength="50" value="${escape(c.name)}" aria-label="${c.row}행 ${c.col}열 이름" ${c.kind !== 'desk' ? 'disabled' : ''}></td></tr>`).join(''); const o = q('#pdf-overlay'); o.classList.toggle('card-aligned',!!draft.sourceGrid?.cardBoxes); o.style.gridTemplateColumns = draft.sourceGrid?.columnWidths ? draft.sourceGrid.columnWidths.map(w => `minmax(0,${w}fr)`).join(' ') : `repeat(${draft.cols},minmax(0,1fr))`; o.style.gridTemplateRows = `repeat(${draft.rows},1fr)`; o.innerHTML = draft.cells.map((c, i) => { const g=draft.sourceGrid,box=g?.cardBoxes?.find(b=>b.row===c.row&&b.col===c.col); const placement=box?`left:${(box.left-g.left+box.width/2)/g.width*100}%;top:${(box.top-g.top+box.height/2)/g.height*100}%;width:${box.width/g.width*100}%;max-height:${box.height/g.height*100}%`:''; return c.kind === 'desk' ? `<input style="${placement}" class="pdf-seat-number" data-index="${i}" data-field="rawNumber" inputmode="numeric" maxlength="5" value="${escape(c.rawNumber)}" aria-label="원본 위 ${c.row}행 ${c.col}열 번호" placeholder="빈자리">` : `<span class="pdf-space">${c.kind === 'aisle' ? '통로' : '제외'}</span>`; }).join(''); check(true); }
    if (draft.sourceGrid) {
        const g = draft.sourceGrid;
        for (const key of ['left', 'top', 'width', 'height'])
            q(`[data-bound="${key}"]`).value = String(g[key] / (['left', 'width'].includes(key) ? source.width : source.height) * 100);
    }
    rows();
    bounds();
    dialog.oninput = e => { const t = e.target; if (t.dataset.bound) {
        bounds();
        return;
    } if (t.dataset.index === undefined)
        return; const c = draft.cells[Number(t.dataset.index)], f = t.dataset.field; if (f === 'kind') {
        c.kind = t.value;
        if(c.kind==='desk' && draft.sourceGrid?.cardBoxes && !draft.sourceGrid.cardBoxes.some(b=>b.row===c.row && b.col===c.col)){
            draft.sourceGrid=inferPdf(source.items).sourceGrid;
            if(draft.sourceGrid)for(const key of ['left','top','width','height'])q(`[data-bound="${key}"]`).value=String(draft.sourceGrid[key]/(['left','width'].includes(key)?source.width:source.height)*100);
            bounds();
        }
        if (c.kind !== 'desk') {
            c.rawNumber = '';
            c.name = '';
        }
        rows();
    }
    else if (f === 'rawNumber' || f === 'name') {
        c[f] = t.value;
        dialog.querySelectorAll(`[data-index="${t.dataset.index}"][data-field="${f}"]`).forEach(x => { if (x !== t)
            x.value = t.value; });
        check(true);
    } };
    board.onchange = () => check(true);
    confirm.onchange = () => check();
    function manual() { const r = Number(q('#pdf-rows').value), c = Number(q('#pdf-cols').value); if (!Number.isInteger(r) || !Number.isInteger(c) || r < 1 || c < 1 || r > 30 || c > 30) {
        q('#pdf-errors').textContent = '행과 열은 1~30 사이 정수로 입력하세요.';
        return;
    } draft = { ...draft, sourceGrid: undefined, rows: r, cols: c, seatColumns: c, scanned: true, issues: ['자동 OCR을 사용하지 않았습니다. 모든 번호를 원본에서 직접 입력하고 확인하세요.'], cells: Array.from({ length: r * c }, (_, i) => ({ row: Math.floor(i / c) + 1, col: i % c + 1, kind: 'desk', rawNumber: '', name: '' })) }; rows(); q('#pdf-manual-options').open = true; }
    q('#pdf-manual').onclick = manual;
    q('#pdf-resize').onclick = manual;
    q('#pdf-overlay-toggle').onclick = () => { q('#pdf-overlay').hidden = !q('#pdf-overlay').hidden; };
    return new Promise((resolve, reject) => {
        let done = false;
        const finish = (result, error) => {
            if (done) return;
            done = true;
            options.signal?.removeEventListener('abort', abort);
            dialog.close(); dialog.remove();
            void source.close().catch(() => {});
            if (error) reject(error); else resolve(result);
        };
        const abort = () => finish(null);
        options.signal?.addEventListener('abort', abort, {once: true});
        q('#pdf-close').onclick = () => finish(null);
        dialog.oncancel = e => { e.preventDefault(); finish(null); };
        next.onclick = () => { const r = check(); if (renderReady && !r.errors.length && confirm.checked) finish(r.layout); };
        if (options.signal?.aborted) { finish(null); return; }
        source.render(q('#pdf-canvas')).then(() => { if (!done) { renderReady = true; check(); options.onReady?.(); } }).catch(() => {
            if (!done) finish(null, Error('이 브라우저에서 PDF 원본을 렌더링하지 못했습니다. 최신 브라우저 또는 XLSX 양식을 사용하세요.'));
        });
    });
}
