// G5: the page carries none of the banned tells from DESIGN.md.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const page = await readFile(path.join(root, 'index.html'), 'utf8');

// Visible copy = the page's text nodes plus every translated string, since the shipped copy
// is whatever the language file supplies at runtime.
const visible = [];
const stripped = page
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, '\n');
visible.push(['index.html', stripped]);

for (const lang of ['en', 'es', 'de']) {
  const raw = await readFile(path.join(root, `assets/languages/${lang}.json`), 'utf8');
  const data = JSON.parse(raw);
  const flat = [];
  (function walk(o) {
    for (const v of Object.values(o)) {
      if (v && typeof v === 'object') walk(v);
      else flat.push(String(v));
    }
  })(data);
  visible.push([`${lang}.json`, flat.join('\n')]);
}

const failures = [];

// 1. Zero em-dashes and en-dashes in visible copy.
for (const [src, text] of visible) {
  for (const m of text.matchAll(/[—–]/g)) {
    const at = text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ').trim();
    failures.push(`${src}: dash "${m[0]}" in visible copy near "${at}"`);
  }
}

// 2. No scroll cue.
for (const [src, text] of visible) {
  if (/\b(scroll to explore|scroll down|desplázate|scrolle nach)\b/i.test(text)) {
    failures.push(`${src}: scroll cue in copy`);
  }
}

// 3. No act counters like "01 / 14".
for (const [src, text] of visible) {
  if (/\b\d{2}\s*\/\s*\d{2}\b/.test(text)) failures.push(`${src}: act counter in copy`);
}

// 4. Eyebrow restraint: at most ceil(acts / 3) eyebrows.
// An eyebrow is a short label element sitting IMMEDIATELY ABOVE a heading. A button, a nav
// item, a data-list term or a caption underneath something is not an eyebrow however it is
// styled, so this counts structure in the markup rather than uppercase rules in the CSS.
const acts = [...page.matchAll(/data-act="\d+"/g)].length;
const eyebrows = [...page.matchAll(
  /<(p|span|div)\b[^>]*>\s*[^<]{1,40}\s*<\/\1>\s*<h[1-6]\b/g
)].length;
const allowed = Math.ceil(acts / 3);
if (eyebrows > allowed) {
  failures.push(`${eyebrows} eyebrows across ${acts} acts, at most ${allowed} allowed`);
}

// 5. No div-built fake terminal or fake dashboard.
if (/class="[^"]*\b(fake|mock)-(terminal|dashboard|window)/.test(page)) {
  failures.push('div-built fake product UI in the markup');
}

// 6. Every image slot names its real-photo replacement, since all imagery is placeholder.
for (const m of page.matchAll(/<img\b[^>]*>/g)) {
  const tag = m[0];
  if (!tag.includes('assets/img/')) continue;
  if (!tag.includes('data-replace=')) {
    failures.push(`generated image without a data-replace slot: ${tag.slice(0, 70)}`);
  }
}

if (failures.length) {
  console.error('TELLS FOUND:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log(`  ${acts} acts, ${eyebrows}/${allowed} eyebrows, no banned dash, no cue`);
console.log('NO_TELLS_OK');
