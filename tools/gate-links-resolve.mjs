// G2: every local asset the page references resolves to a file on disk.
import { readFile, access, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const page = await readFile(path.join(root, 'index.html'), 'utf8');

const refs = new Set();
const add = (u) => {
  if (!u) return;
  if (/^(https?:|mailto:|#|data:)/.test(u)) return;
  refs.add(u.split('#')[0].split('?')[0]);
};
for (const m of page.matchAll(/(?:href|src)="([^"]+)"/g)) add(m[1]);

// Follow the stylesheet's own url() references too.
for (const ref of [...refs]) {
  if (!ref.endsWith('.css')) continue;
  const css = await readFile(path.join(root, ref), 'utf8');
  for (const m of css.matchAll(/url\("?([^")]+)"?\)/g)) {
    const resolved = path.normalize(path.join(path.dirname(ref), m[1]));
    add(resolved);
  }
}
// And the module graph.
for (const rel of ['js/main.js', 'js/i18n.js', 'js/drone.js']) {
  const js = await readFile(path.join(root, rel), 'utf8');
  for (const m of js.matchAll(/from '(\.[^']+)'/g)) {
    add(path.normalize(path.join(path.dirname(rel), m[1])));
  }
}
// The CV PDFs are chosen at runtime from the language files, so check those too.
for (const lang of ['en', 'es', 'de']) {
  const data = JSON.parse(await readFile(path.join(root, `assets/languages/${lang}.json`), 'utf8'));
  add(`assets/pdf/${data.meta.cvFile}`);
}

const missing = [];
for (const ref of [...refs].sort()) {
  try {
    await access(path.join(root, decodeURIComponent(ref)));
  } catch {
    missing.push(ref);
  }
}
if (missing.length) {
  console.error('UNRESOLVED REFERENCES:\n  ' + missing.join('\n  '));
  process.exit(1);
}
console.log(`  ${refs.size} local references resolved`);
console.log('LINKS_RESOLVE_OK');
