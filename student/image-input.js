import {imageMime} from './file-input.js?v=20261007-image-import-1';
const abortError = () => new DOMException('취소되었습니다.', 'AbortError');
function checkDimensions(width, height) {
    if (!width || !height) throw Error('이미지 크기를 읽을 수 없습니다. PNG 또는 JPG로 다시 저장하세요.');
    if (width > 20000 || height > 20000 || width * height > 40000000) throw Error('이미지는 4천만 화소·한 변 20,000px 이하로 줄여 주세요.');
}
// Check encoded dimensions before the browser allocates a decoded image.
function inspectDimensions(bytes, mime) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (mime === 'image/png') {
        if (bytes.length < 24 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') throw Error('손상된 PNG 파일입니다. 다시 저장한 원본을 선택하세요.');
        checkDimensions(v.getUint32(16), v.getUint32(20));
        return;
    }
    for (let at = 2; at < bytes.length;) {
        if (bytes[at++] !== 255) break;
        while (bytes[at] === 255) at++;
        const marker = bytes[at++];
        if (marker === 217 || marker === 218) break;
        if (marker === 1 || marker >= 208 && marker <= 215) continue;
        if (at + 2 > bytes.length) break;
        const length = v.getUint16(at);
        if (length < 2 || at + length > bytes.length) break;
        if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
            if (length < 8) break;
            checkDimensions(v.getUint16(at + 5), v.getUint16(at + 3));
            return;
        }
        at += length;
    }
    throw Error('손상되었거나 지원하지 않는 JPG 파일입니다. PNG 또는 JPG로 다시 저장하세요.');
}
/** Local object URL only. Image bytes, metadata and names never enter a request. */
export async function loadLocalImage(file, {signal} = {}) {
    if (signal?.aborted) throw abortError();
    if (file.size > 15 * 1024 * 1024) throw Error('이미지는 15MB 이하만 지원합니다.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (signal?.aborted) throw abortError();
    const mime = imageMime(bytes);
    if (!mime) throw Error('PNG / JPG / JPEG 이미지 파일을 선택하세요.');
    inspectDimensions(bytes, mime);
    const url = URL.createObjectURL(new Blob([bytes], {type: mime})), img = new Image();
    img.decoding = 'async';
    let closed = false;
    const close = async () => { if (closed) return; closed = true; img.onload = img.onerror = null; img.removeAttribute('src'); URL.revokeObjectURL(url); };
    try {
        await new Promise((resolve, reject) => {
            const finish = error => { signal?.removeEventListener('abort', abort); img.onload = img.onerror = null; if (error) reject(error); else resolve(); };
            const abort = () => finish(abortError());
            img.onload = () => finish();
            img.onerror = () => finish(Error('이미지를 읽을 수 없습니다. 손상되지 않은 PNG 또는 JPG 파일을 선택하세요.'));
            signal?.addEventListener('abort', abort, {once: true});
            if (signal?.aborted) { abort(); return; }
            img.src = url;
        });
        if (signal?.aborted) throw abortError();
        // natural dimensions and drawImage both honor browser EXIF orientation.
        const width = img.naturalWidth, height = img.naturalHeight;
        checkDimensions(width, height);
        return {items: [], pathBoxes: [], width, height, close, render: async canvas => {
            if (closed || signal?.aborted) throw abortError();
            const scale = Math.min(1, 1400 / width, 2000 / height);
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            const ctx = canvas.getContext('2d');
            if (!ctx) throw Error('이미지 미리보기를 만들 수 없습니다.');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }};
    } catch (error) { await close(); throw error; }
}
