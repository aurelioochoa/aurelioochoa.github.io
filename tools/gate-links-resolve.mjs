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
for (const m of page.matchAll(/(?:href|src|data-frame-src)="([^"]+)"/g)) add(m[1]);

// Follow the stylesheet's own url() references too.
for (const ref of [...refs]) {
  if (!ref.endsWith('.css')) continue;
  const css = await readFile(path.join(root, ref), 'utf8');
  for (const m of css.matchAll(/url\("?([^")]+)"?\)/g)) {
    // Test the raw value first. Resolving a data: URI against the stylesheet's directory
    // turns it into "styles/data:font/woff2;...", which is no longer recognisable as a
    // data: URI and gets reported as a missing file.
    if (/^(https?:|data:)/.test(m[1])) continue;
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
// The shelf is a whole document in an iframe with its own import map, and it fails soft:
// a missing module leaves the scene silently showing its static catalog instead. So the
// paths it imports are checked here rather than discovered by looking at the page.
for (const m of page.matchAll(/<iframe[^>]*?(?:data-frame-)?src="([^"]+\.html)"/g)) {
  const doc = await readFile(path.join(root, m[1]), 'utf8');
  const map = doc.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (!map) continue;
  for (const target of Object.values(JSON.parse(map[1]).imports)) {
    // A trailing-slash prefix maps a directory, so check the directory itself.
    add(target.replace(/^\//, '').replace(/\/$/, ''));
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
