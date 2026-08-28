// G2: nothing from the discarded CV design may survive in cv/.
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const cvDir = path.join(import.meta.dirname, '..');
const banned = [
  ['Fraunces', /Fraunces/],
  ['Inter', /\bInter\b/],
  ['@fontsource', /@fontsource/],
  ['photo.jpg', /photo\.jpg/],
  ['old rail/aside layout', /--rail-bg|\brail\b|<aside>/],
  ['old label keys', /labels\.contact\b|"contact":\s*"/],
];
const skipDirs = new Set(['node_modules', 'fonts', '.git']);

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!skipDirs.has(e.name)) yield* walk(path.join(dir, e.name));
    } else if (/\.(html|css|js|mjs|json|md)$/.test(e.name) && e.name !== 'package-lock.json') {
      yield path.join(dir, e.name);
    }
  }
}

const hits = [];
for await (const file of walk(cvDir)) {
  const rel = path.relative(cvDir, file);
  // The ledger and these scripts name the banned tokens in order to ban them.
  if (rel === 'GATES.md' || rel.split(path.sep)[0] === 'scripts') continue;
  const text = await readFile(file, 'utf8');
  for (const [label, re] of banned) {
    if (re.test(text)) hits.push(`${rel}: ${label}`);
  }
}

try {
  await stat(path.join(cvDir, 'photo.jpg'));
  hits.push('photo.jpg still on disk');
} catch {}

if (hits.length) {
  console.error('OLD DESIGN RESIDUE:\n  ' + hits.join('\n  '));
  process.exit(1);
}
console.log('NO_OLD_DESIGN_OK');
