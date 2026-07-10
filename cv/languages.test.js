import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dir = new URL('../assets/languages/', import.meta.url);

function keyShape(value) {
  if (Array.isArray(value)) return value.map(keyShape);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, keyShape(value[k])]));
  }
  return typeof value;
}

const files = await Promise.all(
  ['en.json', 'es.json', 'de.json'].map(async (f) => [f, JSON.parse(await readFile(new URL(f, dir), 'utf8'))])
);

test('all language files share an identical key structure', () => {
  const [, reference] = files[0];
  for (const [name, data] of files.slice(1)) {
    assert.deepEqual(keyShape(data), keyShape(reference), `${name} structure differs from en.json`);
  }
});

test('each language has 6 experiences, a cvFile, and form labels', () => {
  for (const [name, data] of files) {
    assert.equal(data.experienceSection.experiences.length, 6, name);
    assert.match(data.socialMediaSection.cvFile, /\.pdf$/, name);
    for (const key of ['name', 'email', 'message', 'send']) {
      assert.equal(typeof data.contactSection.form[key], 'string', `${name} form.${key}`);
    }
  }
});
