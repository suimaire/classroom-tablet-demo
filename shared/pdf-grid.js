// Review-only transforms: never rebuild entered seats from a flat array index.
const hasContent = cell => String(cell.rawNumber ?? '').trim() || String(cell.name ?? '').trim() || cell.kind !== 'desk' || cell.conflicts?.length;

function reshape(draft, rows, cols, rowOffset = 0, colOffset = 0) {
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > 30 || cols > 30)
        throw Error('행과 열은 1~30 사이 정수로 입력하세요.');
    if (rows === draft.rows && cols === draft.cols && !rowOffset && !colOffset) return draft;
    const outside = cell => cell.row + rowOffset > rows || cell.col + colOffset > cols;
    if (draft.cells.some(cell => outside(cell) && hasContent(cell)))
        throw Error('번호·이름 또는 통로·제외 설정이 있는 칸은 줄일 수 없습니다. 해당 칸을 먼저 확인하고 직접 비워 주세요.');
    const existing = new Map(draft.cells.filter(cell => !outside(cell)).map(cell => {
        const row = cell.row + rowOffset, col = cell.col + colOffset;
        return [`${row}:${col}`, {...cell, row, col}];
    }));
    const cells = Array.from({length: rows * cols}, (_, index) => {
        const row = Math.floor(index / cols) + 1, col = index % cols + 1;
        return existing.get(`${row}:${col}`) ?? {row, col, kind:'desk', rawNumber:'', name:''};
    });
    // The old card/column geometry no longer describes the resized grid.
    // The dialog retains its adjustable outer bounds; a no-op retains exact alignment.
    return {...draft, rows, cols, cells, sourceGrid:undefined, seatColumns:new Set(cells.filter(c => c.kind === 'desk').map(c => c.col)).size};
}

export function resizePdfGrid(draft, rows, cols) {
    return reshape(draft, rows, cols);
}

export function addPdfGridEdge(draft, edge) {
    if (!['top', 'bottom', 'left', 'right'].includes(edge)) throw Error('추가할 방향을 확인하세요.');
    const vertical = edge === 'top' || edge === 'bottom';
    return reshape(draft, draft.rows + (vertical ? 1 : 0), draft.cols + (vertical ? 0 : 1), edge === 'top' ? 1 : 0, edge === 'left' ? 1 : 0);
}
