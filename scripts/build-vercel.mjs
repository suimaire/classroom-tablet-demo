// Publish only reviewed runtime assets. Add new runtime files explicitly here.
import {lstat, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const files = [
  "admin/THIRD-PARTY-LICENSES.txt",
  "admin/api.js",
  "admin/app.js",
  "admin/binary-assets.json",
  "admin/class-management.css",
  "admin/class-management.js",
  "admin/config.json",
  "admin/core.js",
  "admin/course-selection.js",
  "admin/excel.js",
  "admin/index.html",
  "admin/jbig2_nowasm_fallback.js",
  "admin/layout.js",
  "admin/model.js",
  "admin/openjpeg_nowasm_fallback.js",
  "admin/pdf-assets.js",
  "admin/pdf-input.js",
  "admin/pdf-review.css",
  "admin/pdf-review.js",
  "admin/pdf.mjs",
  "admin/pdf.worker.mjs",
  "admin/photo-sheet-core.js",
  "admin/photo-sheet-detect.js",
  "admin/photo-sheet-source.js",
  "admin/photo-sheet.css",
  "admin/photo-sheet.js",
  "admin/school-formulas.js",
  "admin/school-import-ui.js",
  "admin/school-import.js",
  "admin/school-roster.js",
  "admin/sheet-selection.js",
  "admin/student-representatives.js",
  "admin/styles.css",
  "admin/submission-safety.js",
  "admin/teacher-accounts.js",
  "admin/teacher-login.js",
  "admin/credential-dialog.js",
  "admin/xlsx.mjs",
  "index.html",
  "student/THIRD-PARTY-LICENSES.txt",
  "student/api.js",
  "student/app.js",
  "student/binary-assets.json",
  "student/config.json",
  "student/core.js",
  "student/excel.js",
  "student/index.html",
  "student/jbig2_nowasm_fallback.js",
  "student/layout.js",
  "student/model.js",
  "student/seat-edits.js",
  "student/openjpeg_nowasm_fallback.js",
  "student/pdf-assets.js",
  "student/pdf-input.js",
  "student/pdf-review.css",
  "student/pdf-review.js",
  "student/pdf.mjs",
  "student/pdf.worker.mjs",
  "student/styles.css",
  "student/submission-input.js",
  "student/xlsx.mjs"
];
// Validate and read every input before replacing generated output.
const sources = [];
for (const name of files) {
  let part = root;
  for (const component of name.split('/')) {
    part = join(part, component);
    if ((await lstat(part)).isSymbolicLink()) throw new Error(`Symlink not allowed: ${name}`);
  }
  if (!(await lstat(part)).isFile()) throw new Error(`Not a file: ${name}`);
  sources.push([name, await readFile(part)]);
}
const output = join(root, 'public');
await rm(output, {recursive: true, force: true});
for (const [name, bytes] of sources) {
  const target = join(output, name);
  await mkdir(dirname(target), {recursive: true});
  await writeFile(target, bytes);
}
console.log(`Published ${sources.length} reviewed static files to public/`);
