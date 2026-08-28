// G5: every font the stylesheet declares resolves to a real file.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const cvDir = path.join(import.meta.dirname, '..');
const css = await readFile(path.join(cvDir, 'cv.css'), 'utf8');
const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);

if (urls.length === 0) {
  console.error('stylesheet declares no font files at all');
  process.exit(1);
}
if (css.includes('base64')) {
  console.error('stylesheet still inlines base64 font data');
  process.exit(1);
}

const missing = [];
for (const url of urls) {
  try {
    await stat(path.join(cvDir, url));
  } catch {
    missing.push(url);
  }
}
if (missing.length) {
  console.error('MISSING FONT FILES:\n  ' + missing.join('\n  '));
  process.exit(1);
}
console.log(`  ${urls.length} font files resolved`);
console.log('FONTS_OK');
