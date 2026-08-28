// G3: the markup's translatable nodes and the language files agree exactly, in all three
// languages. A missing key would render an English string under a Spanish flag, silently.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const page = await readFile(path.join(root, 'index.html'), 'utf8');

const markupKeys = new Set([...page.matchAll(/data-i18n="([\w.]+)"/g)].map((m) => m[1]));
if (markupKeys.size === 0) {
  console.error('the page declares no data-i18n keys at all');
  process.exit(1);
}

function leaves(obj, prefix = '', out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) leaves(v, p, out);
    else out.add(p);
  }
  return out;
}

const LANGS = ['en', 'es', 'de'];
// cvFile is consumed by the CV-link code, not by a data-i18n node, so it is expected to be
// present in the data and absent from the markup.
const DATA_ONLY = new Set(['meta.cvFile']);

// Keys whose value is legitimately the same in every language: a person's name, a place, a
// list of technology proper nouns, an issuing authority. Comparing these across languages
// proves nothing, so they are excluded from the untranslated-string check by name rather
// than by loosening its threshold.
const INVARIANT = new Set([
  'meta.title', 'hero.where',
  'stack.front', 'stack.back', 'stack.ops', 'stack.ai',
  'stack.frontLabel', 'stack.backLabel',
  'creds.certLabel',
]);

const failures = [];
const perLang = {};

for (const lang of LANGS) {
  const data = JSON.parse(await readFile(path.join(root, `assets/languages/${lang}.json`), 'utf8'));
  const keys = leaves(data);
  perLang[lang] = keys;

  for (const k of markupKeys) {
    if (!keys.has(k)) failures.push(`${lang}.json is missing "${k}"`);
  }
  for (const k of keys) {
    if (!markupKeys.has(k) && !DATA_ONLY.has(k)) failures.push(`${lang}.json has unused key "${k}"`);
  }
  if (!data.meta?.cvFile?.endsWith('.pdf')) failures.push(`${lang}.json has no cvFile`);

  // An untranslated string is a real defect in es/de: it means the copy was never written.
  if (lang !== 'en') {
    const en = JSON.parse(await readFile(path.join(root, 'assets/languages/en.json'), 'utf8'));
    const enLeaves = leaves(en);
    const get = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
    const repeated = [];
    for (const k of enLeaves) {
      if (DATA_ONLY.has(k) || INVARIANT.has(k)) continue;
      // A single short word can coincide across languages ("Pilot", "Code" in German).
      const v = get(data, k);
      if (get(en, k) === v && String(v).split(/\s+/).length > 1) repeated.push(k);
    }
    if (repeated.length) {
      failures.push(`${lang}.json leaves untranslated: ${repeated.join(', ')}`);
    }
  }
}

// All three must share one shape.
for (const lang of LANGS.slice(1)) {
  const a = [...perLang.en].sort().join('|');
  const b = [...perLang[lang]].sort().join('|');
  if (a !== b) failures.push(`${lang}.json key shape differs from en.json`);
}

if (failures.length) {
  console.error('I18N GAPS:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log(`  ${markupKeys.size} keys x ${LANGS.length} languages, all present and translated`);
console.log('I18N_COMPLETE_OK');
