// The one build step in this repo.
//
// ThreeUI's renderer engines are npm modules, and this site loads no bare specifiers, so
// they are bundled here, once, and the OUTPUT is committed. GitHub Pages still serves the
// repo exactly as it sits: nothing is built at deploy time, and nothing is fetched from a
// CDN at render time. Run `make scenes` after changing js/scenes.js.
//
// There is no React in this bundle. The scenes that are whole HTML documents live in
// scenes/ and are loaded as iframes; see build/scenes.mjs.
//
// SPLITTING is on, and it is the reason this emits a directory rather than one file.
// js/scenes.js imports the warp field lazily because that import alone carries Three.js;
// splitting is what turns that `import()` into a chunk the browser can skip. Without it
// esbuild inlines the dynamic import back into the entry and the 400KB returns to the
// critical path. The entry name is pinned so index.html has a stable path to point at; the
// chunk is content-hashed, because nothing links to it by name.

import { build } from 'esbuild';
import { rm, mkdir, readFile } from 'node:fs/promises';

const OUTDIR = 'js/vendor/scenes';

/* ------------------------------------------------- the keycap field's colour

The hero is the warp field on its keycaps variant, and every colour in it is hardcoded in
the renderer. `hue`, `saturation` and `brightness` are declared in the renderer's defaults
and never read anywhere in the file, so a scene's colour cannot be asked for from the
markup however many props index.html sets: it is whatever the variant ships. What the
keycaps variant ships is Tailwind's emerald, top to bottom, cap bodies through key light,
and emerald belongs to no world on this page. It was the only colour above the fold.

So the colour is patched here, on the way into the bundle, the same way every other
upstream edit in this repo works: assert on the exact text expected, then replace it. A
package bump that moves any of it fails the build instead of quietly restoring the emerald.

Patching the source rather than filtering the canvas is the point twice over. A
`filter: hue-rotate()` on a fixed full-viewport canvas above the fold re-filters every
frame for the whole visit, and a rotation can only land NEAR a token: it cannot land the
CODE world's own ladder, which is what goes in below.

What the field is made of afterwards is a keyboard in that world: cap bodies out of the
raised panel, legends in ink with amber for the lit ones, and the amber is the terminal
glow that world already uses as light rather than as an accent. */
const KEYCAP_EDITS = [
  // The streaks flying past the caps. Raised panel, steel, ink, one amber.
  ['keycaps: { count: 220, radiusMin: 20, radiusSpread: 800, lengthMin: 40, '
    + 'lengthSpread: 140, palette: [1096065, 3462041, 11006928, 16777215], opacityScale: 1 }',
   'keycaps: { count: 220, radiusMin: 20, radiusSpread: 800, lengthMin: 40, '
    + 'lengthSpread: 140, palette: [1448488, 9081000, 15264498, 15770412], opacityScale: 1 }'],

  // The cap bodies and the glow inside them: #3D4844 / #505C57 / #2B3431 lit by #03110B.
  // The replacements hold upstream's luminance ladder exactly and move it off green: a
  // lighter and a darker step either side of code-raise, on the ground's own hue.
  //
  // The two legend materials stamped onto the caps go in the same edit, mint and white to
  // ink and amber, because a mint legend on an indigo cap is the emerald surviving intact.
  ['[4016196, 5266519, 2831409].map((f) => new i.MeshLambertMaterial({ color: f, emissive: 200971'
    + ', transparent: !0, opacity: c })), e = [10352079, 16777215].map(',
   '[3949400, 5397365, 2765890].map((f) => new i.MeshLambertMaterial({ color: f, emissive: 329488'
    + ', transparent: !0, opacity: c })), e = [15264498, 15770412].map('],

  // The bokeh drifting through the field, at #6EE7B7. Dust in this world is code-soft, and
  // it stays neutral so the amber is the only warm thing above the fold.
  ['const g = W(s, 750, 7, 7268279, c, 620)', 'const g = W(s, 750, 7, 9081000, c, 620)'],

  // The letter planes: mint, paler mint, white. Amber, soft, ink.
  ['e.color.setHex(Math.random() > 0.6 ? 11006928 : Math.random() > 0.5 ? 13761253 : 16777215)',
   'e.color.setHex(Math.random() > 0.6 ? 15770412 : Math.random() > 0.5 ? 13029597 : 15264498)'],

  // The light in the scene. A green-black fill and a green-white key are what tinted even
  // the white caps; both go neutral so the ladder above is the colour that survives.
  ['new i.AmbientLight(989719, 1), l = new i.DirectionalLight(16056315, 1.9)',
   'new i.AmbientLight(1184287, 1), l = new i.DirectionalLight(16185083, 1.9)'],
];

const WARP = /@designcodeio[/\\]threeui[/\\].*warpFieldRenderer\.js$/;

const keycapsToOurs = {
  name: 'keycap-colour',
  setup(b) {
    b.onLoad({ filter: WARP }, async ({ path }) => {
      let source = await readFile(path, 'utf8');
      for (const [from, to] of KEYCAP_EDITS) {
        if (!source.includes(from)) {
          throw new Error(
            'warpFieldRenderer no longer contains a colour this build patches:\n'
            + `  ${from.slice(0, 78)}\n`
            + 'A package bump moved it. Re-read the keycaps variant and update KEYCAP_EDITS,\n'
            + 'rather than shipping someone else\'s emerald as this site\'s hero.',
          );
        }
        source = source.replace(from, to);
      }
      return { contents: source, loader: 'js' };
    });
  },
};

// Chunk names carry a content hash, so a stale one from a previous build would sit in the
// repo forever and get committed. The directory is emitted whole, every time.
await rm(OUTDIR, { recursive: true, force: true });
await mkdir(OUTDIR, { recursive: true });

await build({
  entryPoints: ['js/scenes.js'],
  bundle: true,
  splitting: true,
  format: 'esm',
  target: ['es2020'],
  minify: true,
  sourcemap: false,
  outdir: OUTDIR,
  entryNames: '[name]',
  chunkNames: 'chunk-[hash]',
  logLevel: 'info',
  plugins: [keycapsToOurs],
});

console.log(`\n  bundled -> ${OUTDIR}/scenes.js`);
