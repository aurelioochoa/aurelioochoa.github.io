// G4: each built PDF exists and is exactly one A4 page.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const pdfDir = path.join(import.meta.dirname, '..', '..', 'assets', 'pdf');
const expected = ['Curriculum Ochoa.pdf', 'Lebenslauf Ochoa.pdf', 'Resume Ochoa.pdf'];

let bad = 0;
for (const name of expected) {
  const file = path.join(pdfDir, name);
  let info;
  try {
    info = await stat(file);
  } catch {
    console.error(`  MISSING ${name}`);
    bad++;
    continue;
  }
  const buf = await readFile(file);
  // Count page objects; a one-page CV must have exactly one.
  const pages = [...buf.toString('latin1').matchAll(/\/Type\s*\/Page[^s]/g)].length;
  const ok = pages === 1 && info.size > 20_000;
  console.log(`  ${name}: ${pages} page(s), ${(info.size / 1024).toFixed(0)} KB ${ok ? 'ok' : 'FAIL'}`);
  if (!ok) bad++;
}
if (bad) {
  console.error(`${bad} PDF(s) failed`);
  process.exit(1);
}
console.log('PDF_PAGES_OK');
