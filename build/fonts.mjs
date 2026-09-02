// The web fonts, subsetted and recompressed.
//
// Like the scene bundle, the OUTPUT is committed and GitHub Pages serves it as it sits.
// This regenerates it from the sources in assets/fonts/, and it exists because three
// unexplained binaries in a repo are worse than one script that says what they are.
//
// What each font is doing, and why it is allowed to be the size it is:
//
//   emotional.woff2   The body and display face. Its variable axis is not a weight (see the
//                     note in styles/site.css) and the page pins it to `wght 0` and never
//                     animates it, so the deltas are instanced away and only the eight
//                     glyphs the face actually carries survive. 20KB of TTF -> 1.7KB.
//
//   mimoid.woff2      The title cards, and nothing else. It STAYS VARIABLE, because the
//                     card entrance animates the axis from the melt to the pixel cut. Only
//                     the lowercase goes, and the one rule that uses it forces uppercase.
//                     75KB of TTF -> 22KB.
//
//   jetbrains-mono    The labels. Every label on this page renders at one weight, so the
//                     400-800 axis is instanced to the 400 that is actually drawn. 31KB ->
//                     21KB, and it stays latin + latin-ext because the German and Spanish
//                     copy needs the accents.
//
// Requires fonttools and woff2 (`pyftsubset`, `woff2_compress`), which are packaging tools,
// not site dependencies: nothing here is installed to render the page.

import { execFileSync } from 'node:child_process';
import { copyFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DIR = 'assets/fonts';
const tmp = mkdtempSync(path.join(tmpdir(), 'fonts-'));

// fontTools stamps `head.modified` with the current time, which would make every rebuild a
// diff even when nothing changed. It honours SOURCE_DATE_EPOCH, so the output is pinned and
// `make fonts` is a no-op in git unless a source or a subset range actually moved.
const env = { ...process.env, SOURCE_DATE_EPOCH: '0' };
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env });

// pyftsubset writes a TTF; woff2_compress turns it into the file the page loads.
function subset(src, out, unicodes, { pinAxis = null } = {}) {
  let input = src;
  if (pinAxis) {
    input = path.join(tmp, `${out}-pinned.ttf`);
    run('python3', ['-c', `
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
f = TTFont(${JSON.stringify(src)})
instancer.instantiateVariableFont(f, ${JSON.stringify(pinAxis)}, inplace=True)
f.save(${JSON.stringify(input)})
`]);
  }
  const ttf = path.join(tmp, `${out}.ttf`);
  run('pyftsubset', [input, `--unicodes=${unicodes}`, `--output-file=${ttf}`,
                     '--drop-tables+=DSIG', '--no-hinting']);
  run('woff2_compress', [ttf]);
  copyFileSync(ttf.replace(/\.ttf$/, '.woff2'), path.join(DIR, `${out}.woff2`));
}

// The eight glyphs the face has: a e i l m n o t.
subset(`${DIR}/emotional-VF.ttf`, 'emotional',
       'U+0061,U+0065,U+0069,U+006C,U+006D,U+006E,U+006F,U+0074',
       { pinAxis: { wght: 0 } });

// Uppercase, digits and the marks it carries. No lowercase: .card__word is uppercased.
subset(`${DIR}/MimoidVF.ttf`, 'mimoid',
       'U+0020,U+0021,U+002C-002E,U+0030-0039,U+003F,U+0041-005A');

// Latin + latin-ext, pinned to the one weight the page draws.
subset(`${DIR}/jetbrains-mono-VF.ttf`, 'jetbrains-mono',
       'U+0000-00FF,U+0100-017F,U+2000-206F,U+2190-2193,U+2212',
       { pinAxis: { wght: 400 } });

rmSync(tmp, { recursive: true, force: true });
console.log('\n  fonts -> assets/fonts/{emotional,mimoid,jetbrains-mono}.woff2');
