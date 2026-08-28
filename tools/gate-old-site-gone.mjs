// G1: nothing from the discarded site design may survive.
import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');

// Files that belonged to the old design and must no longer exist.
const goneFiles = [
  'script.js', 'i18n.js',
  'styles/index.css', 'styles/bento.css', 'styles/styles.css',
  'styles/variables.css', 'styles/reset.css', 'styles/fonts.css',
  'assets/gif/bassskel.gif', 'assets/gif/harmonicaskel.gif',
  'assets/gif/saxskel.gif', 'assets/gif/skullspider.gif',
];

// Markup and behaviour that must not appear anywhere in the shipped page or its scripts.
const bannedPatterns = [
  ['bento markup', /class="bento|two-by-two|three-by-two|icon-shelf|bento-title/],
  ['retired skeleton GIFs', /bassskel|harmonicaskel|saxskel|skullspider/],
  ['useless-fact API', /uselessfacts|uselessfact/],
  ['font-awesome kit', /fontawesome|fa-brands|fa-solid/],
  ['old template timeline', /data-order=|createTimelineArray/],
];

const failures = [];

for (const f of goneFiles) {
  try {
    await access(path.join(root, f));
    failures.push(`${f} still exists`);
  } catch { /* absent, which is the point */ }
}

// Scan the shipped surface only: the page, its styles, its scripts.
const surfaces = ['index.html', 'styles', 'js'];
async function* walk(p) {
  const full = path.join(root, p);
  let entries;
  try {
    entries = await readdir(full, { withFileTypes: true });
  } catch {
    yield p;   // it is a file, not a directory
    return;
  }
  for (const e of entries) yield* walk(path.join(p, e.name));
}

for (const surface of surfaces) {
  for await (const rel of walk(surface)) {
    if (!/\.(html|css|js|mjs)$/.test(rel)) continue;
    const text = await readFile(path.join(root, rel), 'utf8');
    for (const [label, re] of bannedPatterns) {
      if (re.test(text)) failures.push(`${rel}: ${label}`);
    }
  }
}

// The jazzskull is the one inherited motif and must still be there.
try {
  await access(path.join(root, 'assets/gif/jazzskull.gif'));
} catch {
  failures.push('jazzskull.gif is missing, but it was meant to survive');
}
const page = await readFile(path.join(root, 'index.html'), 'utf8');
if (!page.includes('jazzskull.gif')) failures.push('the page no longer shows the jazzskull');

if (failures.length) {
  console.error('OLD SITE RESIDUE:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('OLD_SITE_GONE_OK');
