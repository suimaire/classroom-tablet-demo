import {csvParse, validateStudent} from './core.js';
import {readSchoolRosterXlsx} from './excel.js?v=20261003-school-1';
import {normalizeClass} from './class-management.js';

export const MAX_SCHOOL_STUDENTS = 1200;
// Repeated class blocks: titles, not student ID prefixes, define A/B sections.
export function parseSchoolBlocks(rows, context) {
  const groups = [], seen = new Set();
  let current = null, header = false, total = 0, trackSeen = false, summary = false, summaryCounts = false;
  for (const [i, raw] of rows.entries()) {
    const row = raw.map(v => String(v ?? '').trim());
    if (row.every(v => !v)) continue;
    const title = row[0]?.match(/^(\d+)학년\s*(\d+)([A-Za-z0-9]*)반(?:\s+Adviser\s*:.*)?$/i);
    if (title) {
      if (current && (!header || !current.students.length)) throw Error(`${i+1}행: 이전 반 학생 명단이 없습니다.`);
      if (row.slice(1).some(Boolean)) throw Error(`${i+1}행: 반 제목에 다른 값이 있습니다.`);
      const identity = normalizeClass({...context, grade:title[1], classNumber:title[2], section:title[3]});
      if (groups.some(g => g.grade === identity.grade && g.classNumber === identity.classNumber && g.section === identity.section)) throw Error(`${i+1}행: 반 제목이 중복되었습니다.`);
      current = {...identity, students:[]}; groups.push(current); header = false; trackSeen = false; summary = false; summaryCounts = false; continue;
    }
    if (!current) throw Error(`${i+1}행: 반 제목보다 앞에 미분류 행이 있습니다.`);
    if (row.slice(0,5).join('|') === '순번|학번|성명|성별|비고' && row.slice(5).every(v=>!v)) {
      if (header) throw Error(`${i+1}행: 헤더가 중복되었습니다.`);
      header = true; continue;
    }
    // Only one descriptive line before the known header; reject student-shaped rows.
    if (!header && !trackSeen && row.filter(Boolean).length === 1 && !/^\d/.test(row[0])) { trackSeen = true; continue; }
    const filled = row.filter(Boolean);
    if (header && current.students.length && /^(남|여|총원|합계)/.test(filled[0]) && filled.every(v=>/^(?:(?:남|여|총원|합계)\s*[:：]?\s*)?(?:\d+\s*명?)?$/.test(v))) { summary = true; summaryCounts = filled.every(v=>/^(남|여|총원|합계)$/.test(v)); continue; }
    if (summaryCounts && filled.length <= 3 && filled.every(v=>/^\d+\s*명?$/.test(v))) { summaryCounts = false; continue; }
    if (!header || summary || !/^\d+$/.test(row[0]) || !row[1] || !row[2] || row.slice(5).some(Boolean)) throw Error(`${i+1}행: 인식할 수 없는 행입니다. 명단을 확인하세요.`);
    validateStudent(row[1], row[2]);
    if (seen.has(row[1])) throw Error(`${i+1}행: 중복 학번이 있습니다.`);
    seen.add(row[1]); current.students.push({number:row[1], name:row[2]});
    if (++total > MAX_SCHOOL_STUDENTS) throw Error('전교 명렬은 1200명까지 등록할 수 있습니다.');
  }
  if (!total || !header || !current.students.length) throw Error('유효한 학생 명단이 없습니다.');
  return {total, groups};
}
// Mapping contains exact header labels chosen by the user, never inferred from IDs.
export function groupSchoolRoster(rows, mapping, context) {
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > MAX_SCHOOL_STUDENTS + 1)
    throw Error('전교 명렬은 헤더를 제외하고 1~1200명이어야 합니다.');
  const [headers, ...students] = rows;
  if (!Array.isArray(headers) || new Set(headers).size !== headers.length)
    throw Error('열 제목이 없거나 중복되었습니다.');
  const fields = ['number', 'name', 'grade', 'classNumber'];
  if (mapping?.section) fields.push('section');
  const indices = Object.fromEntries(fields.map(key => {
    const index = headers.indexOf(mapping?.[key]);
    if (index < 0) throw Error(`${key} 열을 지정하세요.`);
    return [key, index];
  }));
  if (new Set(Object.values(indices)).size !== fields.length)
    throw Error('서로 다른 항목에 같은 열을 사용할 수 없습니다.');
  const seen = new Set(), groups = new Map();
  students.forEach((row, i) => {
    if (!Array.isArray(row) || row.length !== headers.length || row.some(v => typeof v !== 'string'))
      throw Error(`${i + 2}행: 열 수 또는 값 형식이 잘못되었습니다.`);
    const values = Object.fromEntries(fields.map(key => [key, row[indices[key]].trim()]));
    validateStudent(values.number, values.name);
    // Duplicate student IDs across courses require explicit review, not automatic copies.
    if (seen.has(values.number)) throw Error(`${i + 2}행: 중복 학번 ${values.number}`);
    seen.add(values.number);
    const identity = normalizeClass({...context, grade:values.grade, classNumber:values.classNumber, section:values.section ?? ''});
    const key = JSON.stringify(identity);
    if (!groups.has(key)) groups.set(key, {...identity, students:[]});
    groups.get(key).students.push({number:values.number, name:values.name});
  });
  return {total:students.length, groups:[...groups.values()]};
}

export async function schoolRosterFile(file, mapping, context) {
  if (!file || file.size <= 0 || file.size > 5 * 1024 * 1024)
    throw Error('전교 명렬 파일은 5MB 이하만 열 수 있습니다.');
  const rows = /\.xlsx$/i.test(file.name)
    ? readSchoolRosterXlsx(new Uint8Array(await file.arrayBuffer()))
    : /\.csv$/i.test(file.name) ? csvParse(await file.text()) : null;
  if (!rows) throw Error('CSV 또는 XLSX 파일을 선택하세요.');
  return groupSchoolRoster(rows, mapping, context);
}
