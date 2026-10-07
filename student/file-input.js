// Picker hints are not validation: Android providers may omit or mislabel MIME/name.
export function imageMime(bytes) {
    if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return 'image/png';
    if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
    return '';
}
export async function detectSeatFile(file) {
    const bytes = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    const kind = imageMime(bytes) ? 'image' :
        bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4 ? 'xlsx' :
        (/^\s*[\[{]/.test(text) || /^\s+$/.test(text)) ? 'json' : /%PDF-/.test(text) ? 'pdf' : '';
    if (!kind) throw Error('지원하는 PDF / PNG / JPG / JPEG / XLSX / JSON 파일인지 확인하세요. 확장자만 바꾼 파일은 지원하지 않습니다.');
    const [limit, message] = {pdf: [15 * 1024 * 1024, 'PDF는 15MB 이하만 지원합니다.'], image: [15 * 1024 * 1024, '이미지는 15MB 이하만 지원합니다.'], xlsx: [5 * 1024 * 1024, 'XLSX는 5MB 이하만 지원합니다.'], json: [200000, 'JSON은 200KB 이하만 지원합니다.']}[kind];
    if (file.size > limit) throw Error(message);
    // PDF/image decoding and the existing JSON/XLSX parsers validate the full body.
    return kind;
}
