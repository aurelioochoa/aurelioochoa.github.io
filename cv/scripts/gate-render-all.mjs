// G3: every data file renders against the template with no missing key.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { render } from '../render.js';

const cvDir = path.join(import.meta.dirname, '..');
const template = await readFile(path.join(cvDir, 'template.html'), 'utf8');
const files = (await readdir(path.join(cvDir, 'data'))).filter((f) => f.endsWith('.json')).sort();

if (files.length !== 3) {
  console.error(`expected 3 data files, found ${files.length}`);
  process.exit(1);
}

for (const file of files) {
  const data = JSON.parse(await readFile(path.join(cvDir, 'data', file), 'utf8'));
  const html = render(template, data);           // throws on any missing key
  if (/{{/.test(html)) {
    console.error(`${file}: unrendered token left in output`);
    process.exit(1);
  }
  // the profile must actually emit the emphasis the design calls for
  if (!/<strong>/.test(html)) {
    console.error(`${file}: profile rendered without <strong> emphasis`);
    process.exit(1);
  }
  console.log(`  ${file}: rendered ${html.length} chars`);
}
console.log('RENDER_ALL_OK');
