// The ThreeUI scenes, vendored into this repo and made this site's own.
//
// ThreeUI ships most of its scenes as complete HTML documents, inlined into the package as
// JavaScript strings and rendered inside a sandboxed iframe. Two things are wrong with using
// them as shipped:
//
//   1. They load their dependencies from public CDNs at render time: Tailwind, GSAP,
//      three.js, Iconify, Google Fonts, and in one case an image from a Supabase bucket.
//      This repo fetches nothing at render time, and tools/gate-no-network.mjs now enforces
//      that by walking the page with a request interceptor attached.
//   2. They carry their own content. The elements scene renders the OpenAI, Anthropic and
//      Claude logos, which is a showcase of three AI products sitting in the middle of a
//      personal site.
//
// So each scene is read out of the package, edited here, and written to scenes/ as a real
// file this repo owns. Editing happens in this script rather than in a committed copy so the
// diff against upstream stays legible and a package bump is a re-run, not a merge. Every
// edit asserts on the text it expects to find: if a future version moves the ground, this
// fails loudly instead of silently producing a scene with someone else's logo in it.
//
// Run with `make scenes`.

import { writeFile, mkdir } from 'node:fs/promises';

const OUT = 'scenes';

// Replace `find` exactly once and fail if it is not there.
function cut(html, find, replace, why) {
  if (!html.includes(find)) {
    throw new Error(`${why}: upstream no longer contains ${JSON.stringify(find.slice(0, 70))}`);
  }
  return html.replace(find, replace);
}

// Replace the fillText drawn at a given y, whatever it currently says. The banner strings
// upstream contain invisible typography (a U+2009 thin space in the monogram, U+00B7 middle
// dots in the rules), so matching them by literal is a trap; the draw coordinate is stable
// and readable.
function cutText(html, y, replacement, why) {
  const re = new RegExp(`x\\.fillText\\('[^']*', W/2, ${y}\\);`);
  if (!re.test(html)) throw new Error(`${why}: no fillText drawn at y=${y}`);
  return html.replace(re, `x.fillText('${replacement}', W/2, ${y});`);
}

// Replace whatever the document calls itself.
function retitle(html, title, why) {
  if (!/<title>[\s\S]*?<\/title>/.test(html)) throw new Error(`${why}: no title element`);
  return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
}

// Replace a whole region between two anchors, inclusive of both.
function cutRegion(html, from, to, replace, why) {
  const a = html.indexOf(from);
  const b = html.indexOf(to, a);
  if (a === -1 || b === -1) throw new Error(`${why}: could not find region ${JSON.stringify(from.slice(0, 50))}`);
  return html.slice(0, a) + replace + html.slice(b + to.length);
}

// The site's own faces, served from this repo, replacing every Google Fonts hop.
const LOCAL_FONTS = `<style>
@font-face {
  font-family: "Emotional";
  src: url("/assets/fonts/emotional-VF.ttf") format("truetype-variations");
  font-weight: 400; font-display: block;
}
@font-face {
  font-family: "JetBrains Mono";
  src: url("/assets/fonts/jetbrains-mono.woff2") format("woff2");
  font-weight: 100 800; font-display: block;
}
</style>`;

/* ------------------------------------------------------------ elemental marks */

// Three panels, water / lightning / fire. Each rasterises a logo to a 512px canvas, builds a
// signed distance field and an edge-particle set from it, and runs that through its shader.
//
// Only the rasteriser is logo-specific. Swapping ctx.fill(new Path2D(logo)) for
// ctx.fillText(word) leaves buildSDF, edgePoints, makeParticleData and every shader
// untouched, so the water refraction, the crawling lightning contours and the rising fire
// ribbons all keep working exactly as authored. They just wrap a word of this site's instead
// of a company's mark.
async function elementalMarks() {
  const mod = await import('../node_modules/@designcodeio/threeui/lib-dist/shaders/elements/sources/elemental-marks.html.js');
  let html = mod.default;

  // 1. Fonts come from this repo, and the display face becomes the site's own.
  html = cutRegion(
    html,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    'rel="stylesheet">',
    LOCAL_FONTS,
    'elemental-marks fonts',
  );
  html = html.replaceAll('"Inter", "Hiragino Sans", sans-serif', '"Emotional", sans-serif');
  html = html.replaceAll('"Inter", "Hiragino Sans", "Yu Gothic", sans-serif', '"Emotional", sans-serif');

  // 2. One panel per frame, filling it. Each act embeds this document with its own effect
  //    and its own word, so the three panels are never on screen together any more.
  html = cut(html, '  main { display: flex; height: 100dvh; }',
    `  main { display: flex; height: 100dvh; }
  /* Embedded one effect at a time, so the panel fills the frame and the scene's own
     chrome (its brand line, its kanji, its captions, its hover hint) is gone: this is a
     ground for one of this site's acts, not a three-up demo of itself. */
  header, .hint, .info, .kanji { display: none !important; }
  .panel { border-left: 0; animation-delay: 0s !important; }`,
    'elemental-marks single panel');

  // 3. The scene's own chrome and the product names it labelled the panels with.
  html = cutRegion(html, '<header>', '</header>', '', 'elemental-marks header');
  html = cutRegion(html, '<div class="hint">', '</div>', '', 'elemental-marks hint');
  for (const [name, tech] of [
    ['OpenAI', 'ping-pong wave equation · gradient refraction of the mark'],
    ['Anthropic', 'contour distance field · fBm zigzag arcs crawling the outline'],
    ['Claude', 'noise ribbons licking upward from the edge · rising embers'],
  ]) {
    html = cut(html, `      <h2>${name}</h2>\n`, '', `elemental-marks ${name} heading`);
    html = cut(html, `      <p class="tech">${tech}</p>\n`, '', `elemental-marks ${name} caption`);
  }

  // 4. The rasteriser: a word in the site's display face, in place of an SVG logo path.
  html = cutRegion(
    html,
    '/* ---------------- logo paths (simple-icons, viewBox 0 0 24 24) ---------------- */',
    '};\n\n/* ---------------- rasterize -> SDF (chamfer) + edge point extraction ---------------- */',
    '/* ---------------- rasterize -> SDF (chamfer) + edge point extraction ---------------- */',
    'elemental-marks logo paths',
  );
  html = cutRegion(
    html,
    'function rasterizeLogo(pathStr) {',
    'return ctx.getImageData(0, 0, SDF_SIZE, SDF_SIZE);\n}',
    `// A word, set in the site's display face and centred, standing in for what used to be a
// company's logo path. Everything downstream of this function is untouched: it hands back
// the same white-on-black mask that ctx.fill(new Path2D(...)) did.
function rasterizeWord(word) {
  const c = document.createElement('canvas');
  c.width = c.height = SDF_SIZE;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // The logos occupied 60% of the field. A word is wider than it is tall, so it is fitted
  // to a slightly wider box and shrunk until it fits rather than being clipped.
  const box = SDF_SIZE * 0.78;
  let size = 260;
  const setFont = () => { ctx.font = \`\${size}px "Emotional", sans-serif\`; };
  setFont();
  const w = ctx.measureText(word).width;
  if (w > box) { size = Math.max(24, Math.floor(size * box / w)); setFont(); }
  ctx.fillText(word, SDF_SIZE / 2, SDF_SIZE / 2);
  return ctx.getImageData(0, 0, SDF_SIZE, SDF_SIZE);
}

// A burner: one wide bar low in the field, so the flame ribbons rise off a line rather than
// off letterforms. This is what sits over the stove in the kitchen act.
function rasterizeBar() {
  const c = document.createElement('canvas');
  c.width = c.height = SDF_SIZE;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  const w = SDF_SIZE * 0.82;
  const h = SDF_SIZE * 0.055;
  const x = (SDF_SIZE - w) / 2;
  const y = SDF_SIZE * 0.66;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  return ctx.getImageData(0, 0, SDF_SIZE, SDF_SIZE);
}`,
    'elemental-marks rasterizer',
  );

  // 5. Build one panel, from the query string, once the display face is actually loaded.
  //    Rasterising before the font arrives silently produces a fallback-face mark.
  html = cutRegion(
    html,
    'const logos = {',
    'else for (const p of panels) p.draw(0.001);',
    `const FX = { water: FRAG_WATER, lightning: FRAG_LIGHTNING, fire: FRAG_FIRE };
const TUNING = {
  water: { sim: true, zoom: 1.06, shift: [0, 0], particles: {
    count: 160, travel: 0.10, lifeMin: 4.0, lifeMax: 8.0, alongNormal: 0.15,
    wiggle: 0.02, sizeMin: 1.5, sizeMax: 3.5, sparse: 0.5,
    colA: [0.10, 0.24, 0.30], colB: [0.22, 0.40, 0.48] } },
  lightning: { sim: false, zoom: 1.10, shift: [0, 0], particles: {
    count: 240, travel: 0.055, lifeMin: 0.3, lifeMax: 0.9, alongNormal: 1.0,
    wiggle: 0.015, sizeMin: 1.2, sizeMax: 2.6, sparse: 0.8,
    colA: [0.45, 0.50, 1.0], colB: [0.95, 0.95, 1.0] } },
  fire: { sim: false, zoom: 1.16, shift: [0, -0.04], particles: {
    count: 420, travel: 0.30, lifeMin: 1.4, lifeMax: 3.0, alongNormal: 0.35,
    wiggle: 0.035, sizeMin: 1.6, sizeMax: 4.5, sparse: 0.55,
    colA: [1.0, 0.62, 0.28], colB: [1.0, 0.30, 0.10] } },
};

const params = new URLSearchParams(location.search);
const fx = FX[params.get('fx')] ? params.get('fx') : 'fire';
const word = (params.get('word') || 'AURELIO').slice(0, 24).toUpperCase();
const shape = params.get('shape') === 'bar' ? 'bar' : 'word';

// Keep only the requested panel, so one document serves every act.
for (const el of document.querySelectorAll('.panel')) {
  if (el.dataset.fx !== fx) el.remove();
}

let panels = [];
const t0 = performance.now();
function loop() {
  const t = (performance.now() - t0) / 1000;
  for (const p of panels) p.draw(t);
  requestAnimationFrame(loop);
}

async function start() {
  // The mark is the word, so the word has to be measurable before it is rasterised.
  try { await document.fonts.load('400 260px "Emotional"'); await document.fonts.ready; } catch {}
  const mark = shape === 'bar' ? buildMark(null) : buildMark(word);
  const host = document.querySelector('.panel[data-fx="' + fx + '"]');
  panels = [new Panel(host, FX[fx], mark, TUNING[fx])].filter(p => p.ok);
  if (!panels.length) return;
  if (!REDUCED) requestAnimationFrame(loop);
  else for (const p of panels) p.draw(0.001);
}
start();`,
    'elemental-marks panel wiring',
  );

  // buildLogo is the name upstream gives the SDF+edges pair; it takes a mask either way.
  html = cut(html, 'function buildLogo(path) {', 'function buildMark(word) {', 'elemental-marks buildLogo name');
  html = cut(html, '  const img = rasterizeLogo(path);',
    '  const img = word === null ? rasterizeBar() : rasterizeWord(word);',
    'elemental-marks buildLogo body');
  html = cut(html, '<title>Elemental Marks — 水・雷・炎</title>', '<title>Elemental marks</title>', 'elemental-marks title');

  return html;
}

/* ---------------------------------------------------------------- woven cloth */

// The three cloths, and the simulation that carries them.
//
// Emitted verbatim into scenes/woven-cloth.html in place of upstream's single-panel body.
// The physics below is upstream's, lifted out of the module-level state it was written
// against: same Verlet integrator, same three constraint passes, same travelling wind, same
// pinned top row. Everything else is this site's, because everything else was a lone ivory
// banner for a fictional Kyoto textile studio.
//
// Three panels, three traditions standing behind this kitchen: a Japanese noren, Aurelio's
// own banner, an Ecuadorian Otavalo weave. Every texture is drawn here on a canvas; nothing
// is fetched, which is the rule the no-network gate enforces.
const CLOTH_SCENE = `        // --- Three cloths: a noren, a banner, an Otavalo weave ---
        (async () => {
            try { await document.fonts.load('400 118px "Emotional"'); await document.fonts.ready; } catch {}
            const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
            const canvas = document.getElementById('cloth');
            if (!window.THREE) return;

            /* ---------------------------------------------------- shared cloth */

            function plate(W, H) {
                const c = document.createElement('canvas');
                c.width = W; c.height = H;
                return [c, c.getContext('2d')];
            }

            // The thread grid and the fabric slub, applied to all three so they read as one
            // bolt of cloth rather than three unrelated pictures. Upstream drew this once,
            // inline; it is a function here because there are three of them now.
            function weave(x, W, H, warp) {
                for (let yy = 0; yy < H; yy += 3) {
                    x.strokeStyle = 'rgba(60,30,20,0.05)';
                    x.lineWidth = 1;
                    x.beginPath(); x.moveTo(0, yy + 0.5); x.lineTo(W, yy + 0.5); x.stroke();
                }
                for (let xx = 0; xx < W; xx += 3) {
                    x.strokeStyle = warp;
                    x.lineWidth = 1;
                    x.beginPath(); x.moveTo(xx + 0.5, 0); x.lineTo(xx + 0.5, H); x.stroke();
                }
                const id = x.getImageData(0, 0, W, H), d = id.data;
                for (let i = 0; i < d.length; i += 4) {
                    const n = (Math.random() * 2 - 1) * 10;
                    d[i] += n; d[i + 1] += n; d[i + 2] += n;
                }
                x.putImageData(id, 0, 0);
            }

            function texture(c) {
                const t = new THREE.CanvasTexture(c);
                t.anisotropy = 4;
                t.colorSpace = THREE.SRGBColorSpace;
                return t;
            }

            // The side cloths hang at the banner's width, so their plates carry the banner's
            // proportions: 4.40 by 3.05 world units is 1.443, and so is this. Every pattern
            // below loops against W, so widening the plate lays down more of the motif rather
            // than stretching what was there.
            const SIDE = [1160, 804];

            /* -------------------------------------------------- kitchen marks */

            // Four marks from the line: a knife, a flame, a whisk, a pot. Each is drawn in a
            // 100 by 100 box so the banner's hem can place them at any size, and each is one
            // filled silhouette, because at hem scale an outline is mud.
            const MARKS = [
                function knife(x) {
                    x.beginPath();
                    x.moveTo(10, 78); x.lineTo(54, 30); x.lineTo(66, 40); x.lineTo(22, 88);
                    x.closePath(); x.fill();
                    x.beginPath();
                    x.moveTo(56, 26); x.lineTo(82, 6); x.lineTo(92, 18); x.lineTo(66, 38);
                    x.closePath(); x.fill();
                },
                function flame(x) {
                    // Three tongues at the foot. A plain teardrop reads as a raindrop, which
                    // is not the mark this hem is after.
                    x.beginPath();
                    x.moveTo(50, 8);
                    x.bezierCurveTo(74, 34, 82, 56, 68, 74);
                    x.lineTo(60, 62); x.lineTo(50, 82); x.lineTo(40, 62); x.lineTo(32, 74);
                    x.bezierCurveTo(18, 56, 28, 34, 50, 8);
                    x.closePath(); x.fill();
                },
                function whisk(x) {
                    x.fillRect(46, 68, 8, 28);
                    x.fillRect(38, 62, 24, 8);          // the ferrule, so the loops have a foot
                    x.lineWidth = 4;
                    x.lineCap = 'round';
                    // Wide, and only three, because four at this size close into one blob.
                    for (const spread of [40, 0, -40]) {
                        x.beginPath();
                        x.moveTo(50, 62);
                        x.bezierCurveTo(50 + spread, 52, 50 + spread * 0.8, 20, 50, 8);
                        x.stroke();
                    }
                },
                function pot(x) {
                    x.beginPath();
                    x.moveTo(26, 46); x.lineTo(74, 46); x.lineTo(68, 88); x.lineTo(32, 88);
                    x.closePath(); x.fill();
                    x.fillRect(18, 34, 64, 9);
                    x.beginPath(); x.arc(50, 28, 6, 0, Math.PI * 2); x.fill();
                    x.fillRect(6, 52, 16, 9);
                    x.fillRect(78, 52, 16, 9);
                },
            ];

            // One row of marks across a width, alternating through the set.
            function markRow(x, y, W, size, gap, colour) {
                x.fillStyle = colour;
                x.strokeStyle = colour;
                const stride = size + gap;
                const count = Math.floor((W - gap) / stride);
                const start = (W - (count * stride - gap)) / 2;
                for (let i = 0; i < count; i++) {
                    x.save();
                    x.translate(start + i * stride, y);
                    x.scale(size / 100, size / 100);
                    MARKS[i % MARKS.length](x);
                    x.restore();
                }
            }

            /* ------------------------------------------------------ the banner */

            // Upstream's ivory banner, still carrying his name, now with the kitchen marks
            // running along the inside of both hems.
            function bannerTexture() {
                const W = 1280, H = 800;
                const [c, x] = plate(W, H);

                const g = x.createLinearGradient(0, 0, 0, H);
                g.addColorStop(0, '#efe6d4');
                g.addColorStop(0.5, '#e9dfca');
                g.addColorStop(1, '#e3d7bf');
                x.fillStyle = g;
                x.fillRect(0, 0, W, H);

                x.strokeStyle = '#a5202c'; x.lineWidth = 10;
                x.strokeRect(46, 46, W - 92, H - 92);
                x.strokeStyle = '#7c1622'; x.lineWidth = 3;
                x.strokeRect(66, 66, W - 132, H - 132);

                markRow(x, 78, W, 52, 46, 'rgba(124,22,34,0.62)');
                markRow(x, 672, W, 52, 46, 'rgba(124,22,34,0.62)');

                x.textAlign = 'center';
                x.textBaseline = 'middle';
                x.fillStyle = '#a5202c';
                x.font = 'bold 78px "Emotional", sans-serif';
                x.fillText('AO', W / 2, 214);
                x.font = 'normal 20px "Emotional", sans-serif';
                x.fillStyle = '#7c1622';
                x.fillText('· GUAYAQUIL ·', W / 2, 266);
                x.fillStyle = '#9e1e2a';
                x.font = 'bold 112px "Emotional", sans-serif';
                x.fillText('AURELIO', W / 2, 400);
                x.fillText('OCHOA', W / 2, 512);
                x.fillStyle = '#7c1622';
                x.font = '600 30px "Emotional", sans-serif';
                x.fillText('C O C I N A   ·   2 0 2 6', W / 2, 604);

                weave(x, W, H, 'rgba(255,250,235,0.06)');
                return c;
            }

            /* ------------------------------------------------------- the noren */

            // A Japanese noren: the split curtain that hangs in a kitchen doorway. Indigo,
            // seigaiha waves across the body, an enso brushed near the top, and the vertical
            // slits that make it a noren and not a flag.
            function norenTexture() {
                const [W, H] = SIDE;
                const [c, x] = plate(W, H);

                const g = x.createLinearGradient(0, 0, 0, H);
                g.addColorStop(0, '#1d3a58');
                g.addColorStop(0.55, '#193149');
                g.addColorStop(1, '#132537');
                x.fillStyle = g;
                x.fillRect(0, 0, W, H);

                // The sleeve the pole runs through, and the hem at the foot.
                x.fillStyle = '#e8ecef';
                x.fillRect(0, 0, W, 34);
                x.fillStyle = 'rgba(232,236,239,0.5)';
                x.fillRect(0, H - 16, W, 6);

                // Seigaiha: overlapping concentric arcs, offset every other row. The pattern
                // is a wave and it is why this panel reads as water even at 0.42 opacity.
                const R = 62, rows = Math.ceil(H / (R * 0.62)) + 1;
                x.lineWidth = 3;
                for (let row = 0; row < rows; row++) {
                    const cy = 300 + row * R * 0.62;
                    const shift = (row % 2) * R;
                    for (let cx = -R; cx < W + R * 2; cx += R * 2) {
                        for (let k = 0; k < 3; k++) {
                            x.strokeStyle = k === 0
                                ? 'rgba(232,236,239,0.34)'
                                : 'rgba(140,182,204,0.24)';
                            x.beginPath();
                            x.arc(cx + shift, cy, R - k * 18, Math.PI, Math.PI * 2);
                            x.stroke();
                        }
                    }
                }

                // The enso, brushed open the way it is always brushed open.
                x.strokeStyle = 'rgba(240,244,247,0.86)';
                x.lineWidth = 15;
                x.lineCap = 'round';
                x.beginPath();
                x.arc(W / 2, 190, 108, Math.PI * 0.30, Math.PI * 2.12);
                x.stroke();

                // The seal, the one warm mark on a cold panel.
                x.fillStyle = '#9e1e2a';
                x.fillRect(W / 2 - 38, 322, 76, 76);
                x.strokeStyle = 'rgba(240,236,228,0.9)';
                x.lineWidth = 6;
                x.strokeRect(W / 2 - 24, 336, 48, 48);
                x.beginPath();
                x.moveTo(W / 2 - 24, 360); x.lineTo(W / 2 + 24, 360);
                x.moveTo(W / 2, 336); x.lineTo(W / 2, 384);
                x.stroke();

                // The slits. A noren is cut, and the cuts are what you walk through.
                x.fillStyle = 'rgba(10,16,24,0.92)';
                for (const at of [0.34, 0.66]) {
                    x.fillRect(W * at - 4, 430, 8, H - 430);
                }

                weave(x, W, H, 'rgba(180,214,232,0.05)');
                return c;
            }

            /* ------------------------------------------------ the Otavalo weave */

            // An Ecuadorian backstrap weave off the Otavalo looms: horizontal bands, a
            // stepped-fret chain, a row of rombos, and the warp showing through all of it.
            function otavaloTexture() {
                const [W, H] = SIDE;
                const [c, x] = plate(W, H);

                x.fillStyle = '#2a1512';
                x.fillRect(0, 0, W, H);

                const BANDS = [
                    ['#e9dfca', 46], ['#9e1e2a', 96], ['#2a1512', 26], ['#c9852e', 74],
                    ['#e9dfca', 118], ['#2a1512', 26], ['#9e1e2a', 108], ['#c9852e', 40],
                    ['#e9dfca', 92], ['#2a1512', 30], ['#9e1e2a', 70],
                ];
                let y = 0;
                const at = {};
                for (const [colour, height] of BANDS) {
                    x.fillStyle = colour;
                    x.fillRect(0, y, W, height);
                    at[colour + y] = y;
                    y += height;
                }

                // The greca escalonada, stepped up and down across the first crimson band.
                x.fillStyle = '#e9dfca';
                const step = 16, base = 46;
                for (let sx = 0; sx < W; sx += step * 4) {
                    for (let k = 0; k < 4; k++) {
                        x.fillRect(sx + k * step, base + 20 + (k < 2 ? k : 3 - k) * -14, step, 14);
                    }
                }

                // Rombos on the ivory, the motif every Otavalo blanket carries somewhere.
                x.strokeStyle = '#9e1e2a';
                x.lineWidth = 5;
                const rowY = 264 + 59;
                for (let cx = 46; cx < W; cx += 92) {
                    for (const r of [40, 22]) {
                        x.beginPath();
                        x.moveTo(cx, rowY - r); x.lineTo(cx + r, rowY);
                        x.lineTo(cx, rowY + r); x.lineTo(cx - r, rowY);
                        x.closePath(); x.stroke();
                    }
                }

                // A second fret, running the other way, on the lower crimson.
                x.fillStyle = '#c9852e';
                for (let sx = 0; sx < W; sx += step * 4) {
                    for (let k = 0; k < 4; k++) {
                        x.fillRect(sx + k * step, 470 + (k < 2 ? k : 3 - k) * 14, step, 14);
                    }
                }

                // The fringe: this cloth is cut off a loom, not hemmed.
                x.strokeStyle = 'rgba(233,223,202,0.75)';
                x.lineWidth = 3;
                for (let fx = 6; fx < W; fx += 11) {
                    x.beginPath();
                    x.moveTo(fx, H - 34);
                    x.lineTo(fx + (fx % 22 === 6 ? 3 : -3), H);
                    x.stroke();
                }

                weave(x, W, H, 'rgba(255,238,206,0.07)');
                return c;
            }

            /* --------------------------------------------------------- the scene */

            const scene = new THREE.Scene();
            const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            let camera;

            scene.add(new THREE.AmbientLight(0xffe9d0, 0.62));
            const key = new THREE.DirectionalLight(0xfff0dc, 1.15);
            key.position.set(-3, 3.5, 3.2);
            scene.add(key);
            const rim = new THREE.DirectionalLight(0xb02330, 0.42);
            rim.position.set(3, -1.5, 2.0);
            scene.add(rim);

            // Three cloths of one width, hung 0.22 units apart: the banner's right edge is at
            // 2.20 and the right cloth's left edge is at 2.42. The side panels still hang a
            // little further back and a little lower, which is what keeps the banner reading
            // as the front one rather than as the middle of a triptych.
            const SPECS = [
                { draw: norenTexture,   x: -4.62, y: 0.16, z: -0.62, w: 4.40, h: 3.05, gx: 32, gy: 24, phase: 1.7 },
                { draw: bannerTexture,  x:  0.00, y: 0.00, z:  0.00, w: 4.40, h: 2.75, gx: 40, gy: 26, phase: 0.0 },
                { draw: otavaloTexture, x:  4.62, y: 0.16, z: -0.62, w: 4.40, h: 3.05, gx: 32, gy: 24, phase: 3.4 },
            ];

            const GRAV = -3.1, DAMP = 0.985, DT = 0.016;

            function makePanel(spec) {
                const geo = new THREE.PlaneGeometry(spec.w, spec.h, spec.gx, spec.gy);
                const mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
                    map: texture(spec.draw()),
                    side: THREE.DoubleSide,
                    shininess: 6,
                    specular: 0x2a1410,
                    color: 0xffffff,
                }));
                mesh.position.set(spec.x, spec.y, spec.z);
                scene.add(mesh);

                const pos = geo.attributes.position;
                const N = (spec.gx + 1) * (spec.gy + 1);
                const cur = new Float32Array(N * 3);
                const prev = new Float32Array(N * 3);
                const rest = new Float32Array(N * 3);
                const pinned = new Uint8Array(N);
                for (let i = 0; i < N; i++) {
                    const ax = pos.getX(i), ay = pos.getY(i);
                    cur[i * 3] = prev[i * 3] = rest[i * 3] = ax;
                    cur[i * 3 + 1] = prev[i * 3 + 1] = rest[i * 3 + 1] = ay;
                    cur[i * 3 + 2] = prev[i * 3 + 2] = rest[i * 3 + 2] = 0;
                }
                // The top row is the pole. PlaneGeometry emits row 0 at +h/2, so this is it.
                for (let ix = 0; ix <= spec.gx; ix++) pinned[ix] = 1;

                return {
                    spec, geo, pos, N, cur, prev, rest, pinned,
                    restH: spec.w / spec.gx,
                    restV: spec.h / spec.gy,
                    idx: (ix, iy) => ix + iy * (spec.gx + 1),
                };
            }

            function wind(p, ix, iy, t) {
                const cx = ix / p.spec.gx, cy = iy / p.spec.gy;
                const travel = (t + p.spec.phase) * 1.7 - cy * 4.2;
                const gust = 0.6 + 0.42 * Math.sin(t * 0.6 + p.spec.phase)
                                 + 0.18 * Math.sin(t * 1.9 + 1.3);
                const amp = 4.3 * cy;
                const fz = (Math.sin(travel + cx * 3.3) + 0.5 * Math.sin(travel * 1.7 + cx * 6.0)) * amp * gust;
                const fx = Math.sin(t * 0.9 + cy * 2.2 + p.spec.phase) * 0.6 * cy;
                const fy = -0.4 * cy;
                return [fx, fy, fz];
            }

            function solve(p, a, b, rl) {
                const cur = p.cur;
                const ax = cur[a * 3], ay = cur[a * 3 + 1], az = cur[a * 3 + 2];
                const bx = cur[b * 3], by = cur[b * 3 + 1], bz = cur[b * 3 + 2];
                let dx = bx - ax, dy = by - ay, dz = bz - az;
                const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
                const diff = (d - rl) / d * 0.5;
                dx *= diff; dy *= diff; dz *= diff;
                const pa = p.pinned[a], pb = p.pinned[b];
                if (!pa && !pb) {
                    cur[a * 3] += dx; cur[a * 3 + 1] += dy; cur[a * 3 + 2] += dz;
                    cur[b * 3] -= dx; cur[b * 3 + 1] -= dy; cur[b * 3 + 2] -= dz;
                } else if (pa && !pb) {
                    cur[b * 3] -= dx * 2; cur[b * 3 + 1] -= dy * 2; cur[b * 3 + 2] -= dz * 2;
                } else if (!pa && pb) {
                    cur[a * 3] += dx * 2; cur[a * 3 + 1] += dy * 2; cur[a * 3 + 2] += dz * 2;
                }
            }

            function step(p, t) {
                const { spec, cur, prev, rest, pinned, idx } = p;
                for (let iy = 0; iy <= spec.gy; iy++) {
                    for (let ix = 0; ix <= spec.gx; ix++) {
                        const i = idx(ix, iy);
                        if (pinned[i]) continue;
                        const [fx, fy, fz] = wind(p, ix, iy, t);
                        for (let k = 0; k < 3; k++) {
                            const j = i * 3 + k;
                            const a = (k === 0 ? fx : k === 1 ? (fy + GRAV) : fz);
                            const v = (cur[j] - prev[j]) * DAMP;
                            prev[j] = cur[j];
                            cur[j] = cur[j] + v + a * DT * DT;
                        }
                    }
                }
                for (let it = 0; it < 3; it++) {
                    for (let iy = 0; iy <= spec.gy; iy++) {
                        for (let ix = 0; ix < spec.gx; ix++) solve(p, idx(ix, iy), idx(ix + 1, iy), p.restH);
                    }
                    for (let iy = 0; iy < spec.gy; iy++) {
                        for (let ix = 0; ix <= spec.gx; ix++) solve(p, idx(ix, iy), idx(ix, iy + 1), p.restV);
                    }
                }
                for (let ix = 0; ix <= spec.gx; ix++) {
                    for (let k = 0; k < 3; k++) {
                        cur[ix * 3 + k] = rest[ix * 3 + k];
                        prev[ix * 3 + k] = rest[ix * 3 + k];
                    }
                }
            }

            function commit(p) {
                for (let i = 0; i < p.N; i++) {
                    p.pos.setXYZ(i, p.cur[i * 3], p.cur[i * 3 + 1], p.cur[i * 3 + 2]);
                }
                p.pos.needsUpdate = true;
                p.geo.computeVertexNormals();
            }

            const panels = SPECS.map(makePanel);

            // Wide enough to hold all three, and the side cloths are allowed to bleed off the
            // frame edges the way hanging cloth does. On a portrait viewport the frame drops
            // back to the banner alone rather than shrinking every panel to fit three across.
            function fit() {
                const w = innerWidth, h = innerHeight;
                renderer.setSize(w, h, false);
                const aspect = w / h;
                camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 100);
                const FRAME_W = aspect > 1 ? 13.8 : 4.6;
                const FRAME_H = 3.4;
                const k = Math.tan(42 * Math.PI / 360);
                const vFit = (FRAME_H / 2) / k;
                const hFit = (FRAME_W / 2) / k / aspect;
                camera.position.set(0, 0.05, Math.max(vFit, hFit) + 0.35);
                camera.lookAt(0, 0, 0);
            }
            addEventListener('resize', fit);
            fit();

            let running = false, raf = 0, t = 0;
            function frame() {
                if (!running) return;
                t += DT;
                for (const p of panels) { step(p, t); commit(p); }
                renderer.render(scene, camera);
                raf = requestAnimationFrame(frame);
            }
            function start() { if (running) return; running = true; raf = requestAnimationFrame(frame); }
            function stop() { running = false; cancelAnimationFrame(raf); }

            if (reduce) {
                for (let s = 0; s < 220; s++) for (const p of panels) step(p, s * DT);
                for (const p of panels) commit(p);
                renderer.render(scene, camera);
            } else {
                for (let s = 0; s < 40; s++) for (const p of panels) step(p, s * DT);
                t = 40 * DT;
                start();
                document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
            }
        })();
`;



// Upstream this is not a scene, it is a whole marketing site for a fictional Kyoto textile
// studio: a nav, a hero, buttons, Iconify icons, a Supabase-hosted backdrop, and a three.js
// cloth simulation running behind all of it.
//
// It rendered as a black rectangle here, and the reason is worth recording. Its content is
// revealed by GSAP ScrollTrigger, and the triggers only fire when the document scrolls.
// Inside a 558px iframe that never scrolls, they never fire, so every element stayed at the
// opacity: 0 it starts at, over a near-black body. Nothing was broken; the page was simply
// waiting for a scroll that could not happen.
//
// What is wanted here is the cloth, so everything else goes: the overlay, the reveal
// machinery, and with it GSAP, Tailwind, Iconify and the remote image. The banner woven into
// the fabric becomes Aurelio's rather than the studio's.
async function wovenCloth() {
  const mod = await import('../node_modules/@designcodeio/threeui/lib-dist/shaders/neuform-isolated/sources/lumina-weavers-cloth.html.js');
  let html = mod.default;

  // 1. Every remote script, and the Tailwind the overlay needed.
  html = cutRegion(
    html,
    '    <script src="https://cdn.tailwindcss.com"></script>',
    '<script src="https://code.iconify.design/iconify-icon/1.0.7/iconify-icon.min.js"></script>',
    LOCAL_FONTS,
    'woven-cloth remote scripts',
  );

  // 2. The body: the stage and nothing else. The remote backdrop image and the entire UI
  //    overlay go with it, which is also what removes the last of the Tailwind classes.
  html = cutRegion(
    html,
    '<body class=',
    '    <script>',
    `<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; overflow: hidden; }
  body { background: radial-gradient(120% 100% at 50% 30%, #2a1113 0%, #1a0a0c 55%, #0f0607 100%); }
  .stage { position: fixed; inset: 0; overflow: hidden; }
  #cloth { position: absolute; inset: 0; width: 100%; height: 100%; display: block; pointer-events: none; }
  .vignette {
    position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(90% 80% at 50% 46%, transparent 55%, rgba(10,5,6,.72) 100%);
  }
</style>
</head>
<body>
    <div class="stage">
        <canvas id="cloth"></canvas>
        <div class="vignette"></div>
    </div>

    <script type="module">`,
    'woven-cloth body',
  );

  // 3. The GSAP reveal block, which is the thing that never fired.
  html = cutRegion(
    html,
    '        // --- GSAP Animation ---',
    '        // --- Three.js Cloth Simulation ---',
    `        import * as THREE from '/js/vendor/three/three.module.js';
        window.THREE = THREE;

        // --- Three.js Cloth Simulation ---`,
    'woven-cloth gsap block',
  );

  // 4. Three cloths instead of one, and the simulation generalised to carry them.
  //
  //    What is kept from upstream is the physics: a Verlet integrator, a distance-constraint
  //    solver run three passes a frame, a travelling wind field, and a pinned top edge. That
  //    is the good part and it is unchanged in substance; it is only lifted out of the
  //    module-level state it was written against so more than one panel can run through it.
  //    Everything else in this block is ours, because everything else was a single ivory
  //    banner for a fictional Kyoto studio.
  //
  //    The three cloths are the three traditions standing behind this kitchen: a Japanese
  //    noren on the left, Aurelio's own banner in the middle, an Ecuadorian Otavalo weave on
  //    the right. The banner keeps his name and the kitchen motifs run along its hems.
  //
  //    The assertions below are what make a package bump fail here rather than ship a scene
  //    with someone else's cloth in it.
  for (const landmark of [
    'function makeClothTexture()', 'const id = x.getImageData(0, 0, W, H)',
    'prev[j] = cur[j];', 'function solve(a, b, rl)', 'geo.computeVertexNormals();',
  ]) {
    if (!html.includes(landmark)) {
      throw new Error(`woven-cloth simulation: upstream no longer contains ${JSON.stringify(landmark)}`);
    }
  }
  html = cutRegion(
    html,
    '        // --- Three.js Cloth Simulation ---',
    '        })();',
    CLOTH_SCENE,
    'woven-cloth simulation',
  );

  html = retitle(html, 'Woven cloth', 'woven-cloth');
  return html;
}

/* --------------------------------------------------------- liquid metal button */

// This one was never broken either, and the black rectangle had two causes.
//
// The metal is a hover effect: `hover` starts at 0 and the shader returns transparent black
// whenever uHover is, so at rest the control is deliberately a plain dark pill that lights
// up when a pointer arrives. And the stage reserves roughly 90px of padding on every side
// for the bloom to spill into, so a host box cut to the pill's own size shows a corner of
// the empty pool instead of the button.
//
// So: the ground goes transparent, so the pill sits on the act's own colour instead of
// carrying a black pool with it; the label comes from the query string; and a small bridge
// tells the page when the button was pressed, which is the part the React wrapper used to
// inject and this document has never had.
async function liquidMetalButton() {
  const mod = await import('../node_modules/@designcodeio/threeui/lib-dist/shaders/liquid-metal-button/liquid-metal-button.html.js');
  let html = mod.default;

  html = cutRegion(
    html,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    'rel="stylesheet">',
    LOCAL_FONTS,
    'liquid-metal fonts',
  );
  html = html.replaceAll('"Inter",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif',
    '"Emotional",-apple-system,BlinkMacSystemFont,sans-serif');

  // The button brings its own lighting pool. On the closing act's signal red that reads as a
  // black rectangle dropped on the page, so the ground is handed back to the act.
  html = cutRegion(
    html,
    '    /* A shadow needs something to fall on: a soft ambient pool lifts the',
    '#000;',
    '    /* The pool this shipped with is a near-black radial gradient, which is the right\n'
      + '       ground for a standalone demo and the wrong one for a button sitting on an act\n'
      + '       that has a colour of its own. */\n    background: transparent;',
    'liquid-metal ground',
  );

  html = cut(html, '<span class="lbl">Sign up</span>', '<span class="lbl">Email me</span>',
    'liquid-metal label');

  // The stock icon is a plus, which meant something beside "Sign up" and means nothing
  // beside an address. An envelope, drawn in the same square-capped stroke the chrome's own
  // switches use, so the one icon on the page's CTA belongs to the page's icon language.
  html = cutRegion(
    html,
    '    <svg class="ico"',
    '</svg>',
    `    <svg class="ico" viewBox="0 0 115 115" aria-hidden="true" fill="none">
      <g stroke="currentColor" stroke-width="12" stroke-linecap="square" stroke-linejoin="miter">
        <path d="M12 26 H103 V89 H12 Z"/>
        <path d="M12 26 L57.5 61 L103 26"/>
      </g>
    </svg>`,
    'liquid-metal icon',
  );

  // The label here is live DOM text, not something rasterised to a canvas, so the three
  // seconds `block` spends waiting for the face are three seconds of an unlabelled black
  // pill where the page's one CTA should be. The rasterising scenes keep `block`, because
  // rasterising through a fallback face is the thing that setting is there to prevent.
  html = html.replaceAll('font-display: block;', 'font-display: swap;');

  // The bridge: label in, press out.
  html = cut(html, '</body>', `<script>
  // The label is the host's to choose, and the press has to reach it: this document is
  // sandboxed, so a click inside it cannot navigate the page on its own.
  (() => {
    const params = new URLSearchParams(location.search);
    const text = (params.get('text') || '').slice(0, 24);
    const btn = document.getElementById('btn');
    if (text) {
      const label = btn.querySelector('.lbl');
      if (label) label.textContent = text;
      btn.setAttribute('aria-label', text);
    }
    btn.addEventListener('click', () => {
      parent.postMessage({ liquidMetalButton: { type: 'activate' } }, '*');
    });
  })();
<\/script>
</body>`, 'liquid-metal bridge');

  html = retitle(html, 'Liquid metal button', 'liquid-metal');
  return html;
}

/* ---------------------------------------------------------------------- run */

const scenes = {
  'elemental-marks': await elementalMarks(),
  'woven-cloth': await wovenCloth(),
  'liquid-metal-button': await liquidMetalButton(),
};

await mkdir(OUT, { recursive: true });
for (const [name, html] of Object.entries(scenes)) {
  const remote = [...html.matchAll(/https?:\/\/[^"'\s)]+/g)].map((m) => m[0]);
  if (remote.length) {
    throw new Error(`${name} still reaches the network:\n  ${[...new Set(remote)].join('\n  ')}`);
  }
  await writeFile(`${OUT}/${name}.html`, html);
  console.log(`  scene: ${name}  ${html.length} bytes, no remote references`);
}
