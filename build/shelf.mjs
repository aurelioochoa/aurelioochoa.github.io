// The projects shelf.
//
// ThreeUI's Complete Shelf is a complete, self-contained HTML document that its React
// wrapper loads in an iframe. The scene is fully data-driven: every book is generated from
// a record in one BOOKS array — colour, foil, motif and seed, no cover artwork anywhere —
// so the shelf can hold Aurelio's public repositories instead of the seven tools it ships
// with, and each spine still gets its own cloth, foil and stamped motif.
//
// This script rewrites the shipped document rather than committing a hand-edited copy, so
// the diff against upstream stays legible and a package bump is a re-run, not a merge.
// Three changes are made:
//
//   1. BOOKS becomes the repositories below.
//   2. The page's own copy stops being "Working Volumes — Seven Tools for Making".
//   3. The import map stops pointing at jsDelivr and Google Fonts. The upstream document
//      fetches three.js and Inter from a CDN at render time, which this repo does not do;
//      three is vendored under js/vendor/three and the face falls back to the system stack.
//
// Run with `make shelf`. Output: landing-pages/complete-shelf.html

import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';

const SRC = 'node_modules/@designcodeio/threeui/lib-dist/assets/landing-pages/complete-shelf-v2.html';
const OUT = 'landing-pages/complete-shelf.html';

// The ten public repositories, newest work first. Descriptions are the repositories' own:
// nothing here is invented, and nothing claims more than the README does.
const BOOKS = [
  {
    id: 'netmap',
    title: 'netmap',
    roman: 'I',
    discipline: 'Network cartography',
    note: 'A network, discovered and drawn.',
    deck: 'Discover a network and render its topology: ASCII in the terminal, SVG, or an interactive desktop GUI. ARP scanning, traceroute and topology visualisation, written in Rust.',
    binding: 'Rust · slate cloth · copper foil',
    format: 'CLI · SVG · egui desktop',
    theme: 'netmap · discovery into topology',
    motif: 'Drafting compass',
    motifKey: 'compass',
    paletteLabel: 'Slate · bone · copper',
    color: '#1f3348',
    foil: '#c87046',
    palette: {
      paper: '#151d28', paperDeep: '#0d141d', paperPale: '#eef1f5',
      ink: '#f1f4f8', inkSoft: '#a8b4c2',
      wall: '#151d28', shelf: '#33241a', shelfDark: '#1a110c',
      light: '#f2d9bd', fill: '#9fb6cc',
    },
    width: 1.06, height: 1.62, depth: 0.3,
    chapters: ['Discovery', 'Topology', 'Render'],
    seed: 11,
  },
  {
    id: 'patina',
    title: 'patina',
    roman: 'II',
    discipline: 'Agent memory',
    note: 'What a session learned, kept.',
    deck: 'A background self-improvement loop for Claude Code: it reviews finished sessions and turns what it learned into skills, into a queue you approve, or, if you let it, straight into your library.',
    binding: 'Python · verdigris cloth · copper foil',
    format: 'Claude Code plugin · hooks and skills',
    theme: 'patina · sessions into skills',
    motif: 'Suspended orbits',
    motifKey: 'orbits',
    paletteLabel: 'Verdigris · bone · copper',
    color: '#2c5148',
    foil: '#d08b4f',
    palette: {
      paper: '#14201d', paperDeep: '#0c1512', paperPale: '#edf2ef',
      ink: '#eff5f2', inkSoft: '#a5b8b1',
      wall: '#14201d', shelf: '#33241a', shelfDark: '#1a110c',
      light: '#f4dcc0', fill: '#9dc0b4',
    },
    width: 1.02, height: 1.58, depth: 0.28,
    chapters: ['Review', 'Distillation', 'Library'],
    seed: 23,
  },
  {
    id: 'betterprompt',
    title: 'betterprompt',
    roman: 'III',
    discipline: 'Prompt craft',
    note: 'A rough ask, made precise.',
    deck: 'A Claude Code plugin. /better and /evenbetter turn a rough prompt into a precise, context-grounded one, and wait for your approval before doing the work.',
    binding: 'TypeScript · indigo cloth · prism foil',
    format: 'Claude Code plugin · two commands',
    theme: 'betterprompt · vague into precise',
    motif: 'Nested brackets',
    motifKey: 'brackets',
    paletteLabel: 'Indigo · bone · prism',
    color: '#252a52',
    foil: '#8fb4e8',
    palette: {
      paper: '#151628', paperDeep: '#0d0e1b', paperPale: '#eeeef7',
      ink: '#f1f1fa', inkSoft: '#aaacc4',
      wall: '#151628', shelf: '#33241a', shelfDark: '#1a110c',
      light: '#dfe2f6', fill: '#a3a9d2',
    },
    width: 0.98, height: 1.54, depth: 0.24,
    chapters: ['Fragment', 'Refraction', 'Approval'],
    seed: 37,
  },
  {
    id: 'tunetap',
    title: 'Tune Tap',
    roman: 'IV',
    discipline: 'Rhythm play',
    note: 'The falling pattern is the melody.',
    deck: 'A rhythm game for kids, built for KidtopiaPlay: tap the bubbles as they fall in time with the music. Zero asset files: Canvas art and Web Audio sound.',
    binding: 'TypeScript · magenta cloth · gold foil',
    format: 'Web · playable in the browser',
    theme: 'Tune Tap · pattern into melody',
    motif: 'Interlaced paths',
    motifKey: 'paths',
    paletteLabel: 'Magenta · cream · gold',
    color: '#8d2a55',
    foil: '#efc16d',
    palette: {
      paper: '#26101b', paperDeep: '#180a11', paperPale: '#f7ecf1',
      ink: '#f9eef3', inkSoft: '#c9a8b6',
      wall: '#26101b', shelf: '#33241a', shelfDark: '#1a110c',
      light: '#f6d9a8', fill: '#c98fa8',
    },
    width: 1.0, height: 1.5, depth: 0.26,
    chapters: ['Melody', 'Timing', 'Play'],
    seed: 41,
  },
  {
    id: 'mathreview',
    title: 'Math Quest',
    roman: 'V',
    discipline: 'Gamified study',
    note: 'A remedial exam, turned into a quest.',
    deck: 'A gamified maths review game in Spanish for KidtopiaPlay. Worlds, levels, lives, XP and achievements, with review exercises masked as challenges. It began as a study guide for a tenth-grade remedial exam.',
    binding: 'JavaScript · cobalt cloth · chalk foil',
    format: 'Web · React, KaTeX, three.js',
    theme: 'Math Quest · revision into play',
    motif: 'Connected modules',
    motifKey: 'modules',
    paletteLabel: 'Cobalt · chalk · amber',
    color: '#1d3f6b',
    foil: '#f0a32c',
    palette: {
      paper: '#111d2e', paperDeep: '#0a131f', paperPale: '#eef3fa',
      ink: '#f0f5fb', inkSoft: '#a4b6cb',
      wall: '#111d2e', shelf: '#33241a', shelfDark: '#1a110c',
      light: '#f6dcae', fill: '#96b2d4',
    },
    width: 1.08, height: 1.6, depth: 0.32,
    chapters: ['Mundos', 'Retos', 'Progreso'],
    seed: 53,
  },
  {
    id: 'geometrysurvivors',
    title: 'Geometry Survivor',
    roman: 'VI',
    discipline: 'Procedural arcade',
    note: 'Ten minutes of escalating chaos.',
    deck: 'A lightweight survivors-like inspired by sacred geometry, mathematics and mandalas. Survive ten minutes of escalating Chaos, then defeat the boss. Every visual is procedurally drawn and every sound synthesised, so it ships zero image or audio assets.',
    binding: 'TypeScript · obsidian cloth · silver foil',
    format: 'Web · procedural, no assets',
    theme: 'Geometry Survivor · geometry into chaos',
    motif: 'Folded frames',
    motifKey: 'frames',
    paletteLabel: 'Obsidian · bone · silver',
    color: '#241f38',
    foil: '#c7c9d6',
    palette: {
      paper: '#14121f', paperDeep: '#0c0b14', paperPale: '#efeef5',
      ink: '#f2f1f8', inkSoft: '#aeaabf',
      wall: '#14121f', shelf: '#33241a', shelfDark: '#1a110c',
      light: '#dcd9e8', fill: '#a49fbb',
    },
    width: 0.96, height: 1.56, depth: 0.25,
    chapters: ['Chaos', 'Escalation', 'Boss'],
    seed: 67,
  },
  {
    id: 'coltpython',
    title: 'Python Roulette',
    roman: 'VII',
    discipline: 'Terminal theatre',
    note: 'Two players, one chamber.',
    deck: 'A terminal Russian Roulette for two players, with modelled revolver behaviour, ASCII animations, sound effects and coloured logging.',
    binding: 'Python · oxblood cloth · brass foil',
    format: 'Terminal · interactive or scripted',
    theme: 'Python Roulette · chance into ceremony',
    motif: 'Directional caret',
    motifKey: 'caret',
    paletteLabel: 'Oxblood · bone · brass',
    color: '#5c1f1c',
    foil: '#d0a154',
    palette: {
      paper: '#1e0f0e', paperDeep: '#130908', paperPale: '#f5ece9',
      ink: '#f8efec', inkSoft: '#c3a29d',
      wall: '#1e0f0e', shelf: '#33241a', shelfDark: '#1a110c',
      light: '#f0d3b4', fill: '#c08d84',
    },
    width: 0.94, height: 1.48, depth: 0.22,
    chapters: ['Chamber', 'Turn', 'Report'],
    seed: 71,
  },
  {
    id: 'visicalc',
    title: 'visiCalc',
    roman: 'VIII',
    discipline: 'Terminal tooling',
    note: 'A spreadsheet with no window.',
    deck: 'A spreadsheet application for your terminal, written in Java.',
    binding: 'Java · moss cloth · bone foil',
    format: 'Terminal · grid and formulas',
    theme: 'visiCalc · the grid without the window',
    motif: 'Folded frames',
    motifKey: 'frames',
    paletteLabel: 'Moss · bone · brass',
    color: '#33402a',
    foil: '#cbb98a',
    palette: {
      paper: '#161c12', paperDeep: '#0e120b', paperPale: '#eff2ea',
      ink: '#f2f5ee', inkSoft: '#adb8a2',
      wall: '#161c12', shelf: '#33241a', shelfDark: '#1a110c',
      light: '#e6dfc4', fill: '#a3b394',
    },
    width: 1.04, height: 1.52, depth: 0.29,
    chapters: ['Grid', 'Formula', 'Terminal'],
    seed: 83,
  },
  {
    id: 'laberinto',
    title: 'Laberinto',
    roman: 'IX',
    discipline: 'Coursework',
    note: 'Programming 2, final project.',
    deck: 'A maze, in Java. The final project for Programming 2 at Universidad Europea del Atlántico.',
    binding: 'Java · violet cloth · bone foil',
    format: 'Desktop · university project, 2023',
    theme: 'Laberinto · a maze, and a way out',
    motif: 'Interlaced paths',
    motifKey: 'paths',
    paletteLabel: 'Violet · bone · pewter',
    color: '#3a2a4d',
    foil: '#bfb3c9',
    palette: {
      paper: '#181224', paperDeep: '#100c18', paperPale: '#f0edf5',
      ink: '#f3f0f8', inkSoft: '#b0a6bf',
      wall: '#181224', shelf: '#33241a', shelfDark: '#1a110c',
      light: '#ded6e6', fill: '#a597b5',
    },
    width: 0.92, height: 1.46, depth: 0.21,
    chapters: ['Maze', 'Solve', 'Submit'],
    seed: 97,
  },
  {
    id: 'kingsman',
    title: 'Kingsman Jiu Jitsu',
    roman: 'X',
    discipline: 'Studio site',
    note: 'A mat, and a website.',
    deck: 'A site for Kingsman Jiu Jitsu Studio, in plain HTML.',
    binding: 'HTML · charcoal cloth · signal foil',
    format: 'Web · a studio’s front door',
    theme: 'Kingsman · a studio, online',
    motif: 'Nested brackets',
    motifKey: 'brackets',
    paletteLabel: 'Charcoal · bone · signal',
    color: '#26262a',
    foil: '#d62822',
    palette: {
      paper: '#141416', paperDeep: '#0c0c0e', paperPale: '#f0f0f1',
      ink: '#f3f3f4', inkSoft: '#adadb2',
      wall: '#141416', shelf: '#33241a', shelfDark: '#1a110c',
      light: '#e8d8d6', fill: '#a8a8ad',
    },
    width: 0.9, height: 1.44, depth: 0.2,
    chapters: ['Studio', 'Schedule', 'Contact'],
    seed: 103,
  },
];

// The page's own chrome, so it stops introducing itself as someone else's book catalogue.
const COPY = [
  ['<title>Working Volumes — Seven Tools for Making</title>',
   '<title>Aurelio Ochoa · Ten things built in the open</title>'],
  // Upstream titles its own scene inside the scene, and act 7 already carries that heading
  // in the page, in the page's own display face, one line above the frame. Keeping both
  // said "In the open / Ten public repositories" twice within 200px of each other, and the
  // second one was the largest serif on a site whose design language has no serif in it.
  // The header keeps the half that is not a repeat: where to go and find them.
  ['      <div class="editorial-identity">\n'
    + '        <strong>Working Volumes</strong>\n'
    + '        <span>Seven field guides for making</span>\n'
    + '      </div>\n', ''],
  ['<span>Edition 02 · 2026</span>', '<span>github.com/aurelioochoa</span>'],
  // Upstream counts the volume you are looking at, and the ten markers on the right of the
  // same bar already say the same thing in a form nobody has to read. A `01 / 10` is an act
  // counter by another name, which is on this project's ban list, so the slot takes the
  // repository's discipline instead: what kind of thing it is, which is the one fact about
  // a selected repo that the title and the one-line note do not already carry.
  ['<span class="counter" id="counter">01 / 07</span>',
   '<span class="counter" id="counter">Network cartography</span>'],
  ['counter.textContent = `${pad(selectedIndex + 1)} / ${pad(BOOKS.length)}`;',
   'counter.textContent = book.discipline;'],
  ['<span>All bindings, motifs, descriptions, geometry, and cover artworks are original to this conceptual study.</span>',
   '<span>Every cover here is generated from its repository: cloth, foil and stamped motif, no artwork files.</span>'],
  ['<span>Product names are used editorially and remain the property of their respective owners.</span>',
   '<span>Ten public repositories at github.com/aurelioochoa. Shelf scene by ThreeUI, MIT.</span>'],
  // The imprint stamped into the covers, spines and sample pages by the canvas drawing code.
  ['WORKING VOLUMES  /  ', 'IN THE OPEN  /  '],
  ['content="Working Volumes is an original interactive Three.js library of seven tactile field guides for contemporary creative tools."',
   'content="Ten public repositories by Aurelio Ochoa, on an interactive shelf."'],
  ['. Conceived as an original editorial study for Working Volumes.', '. Public on GitHub.'],
  ['<p class="fallback__kicker">Working Volumes · Static catalog</p>',
   '<p class="fallback__kicker">In the open · Static catalog</p>'],
  ['<h2 id="fallback-title">Seven tools for making.</h2>',
   '<h2 id="fallback-title">Ten things built in the open.</h2>'],
  ['<span id="pointer-label-index">Volume 01</span>', '<span id="pointer-label-index">Repo 01</span>'],
  ['<strong id="pointer-label-title">Codex</strong>', '<strong id="pointer-label-title">netmap</strong>'],
  ['<h1 class="selection__title" id="selection-title">Codex</h1>',
   '<h1 class="selection__title" id="selection-title">netmap</h1>'],
  ['<p class="selection__note" id="selection-note">Precise intent, translated into tested systems.</p>',
   '<p class="selection__note" id="selection-note">A network, discovered and drawn.</p>'],
  ['<p class="eyebrow" id="detail-eyebrow">Volume I · Agentic craft</p>',
   '<p class="eyebrow" id="detail-eyebrow">Repo I · Network cartography</p>'],
  ['<h2 class="detail-title" id="detail-title">Codex</h2>',
   '<h2 class="detail-title" id="detail-title">netmap</h2>'],
  ['aria-label="Previous volume"', 'aria-label="Previous repository"'],
  ['aria-label="Next volume"', 'aria-label="Next repository"'],
  ['aria-label="Return volume to shelf"', 'aria-label="Return repository to shelf"'],
];

// This repo fetches nothing at render time. Upstream pulls three.js from jsDelivr and Inter
// from Google Fonts, so both go local: three is vendored beside the site, and the face falls
// back to the stack the rest of the page already uses.
const IMPORTMAP_FROM = /"three": "https:\/\/cdn\.jsdelivr\.net[^"]*",\s*"three\/addons\/": "https:\/\/cdn\.jsdelivr\.net[^"]*"/;
const IMPORTMAP_TO =
  '"three": "/js/vendor/three/three.module.js",\n        "three/addons/": "/js/vendor/three/addons/"';

function replaceBooksArray(html) {
  const start = html.indexOf('const BOOKS = [');
  if (start === -1) throw new Error('upstream document no longer declares `const BOOKS = [`');
  // Walk the brackets so the array's own nested objects cannot end the match early.
  let i = html.indexOf('[', start);
  let depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === '[') depth++;
    else if (html[i] === ']') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error('unbalanced BOOKS array in the upstream document');
  const body = BOOKS.map((b) => '      ' + JSON.stringify(b, null, 2).split('\n').join('\n      ')).join(',\n');
  return html.slice(0, html.indexOf('[', start)) + '[\n' + body + '\n    ]' + html.slice(i + 1);
}

// The shelf draws each cover one of two ways: from a sprite atlas of seven painted covers
// when the atlas decodes, and procedurally otherwise, generating the cloth weave, the foil
// frame and the stamped motif from the book's own colour, foil, motif and seed.
//
// The atlas is dropped here, deliberately. It holds seven paintings of someone else's seven
// tools, it is indexed by position (COVER_CROPS[BOOKS.indexOf(book)], which is undefined
// past the seventh book and crashes the scene), and the generated covers are the ones that
// actually belong to these repositories. Removing it takes most of the document's weight
// with it.
function dropCoverAtlas(html) {
  const marker = 'const COVER_ATLAS_DATA = "data:image/webp;base64,';
  const at = html.indexOf(marker);
  if (at === -1) throw new Error('upstream no longer declares COVER_ATLAS_DATA');
  const open = html.indexOf('"', html.indexOf('=', at));
  const close = html.indexOf('"', open + 1);
  html = html.slice(0, open) + '""' + html.slice(close + 1);

  const ready = '        coverAtlasReady = true;';
  if (!html.includes(ready)) throw new Error('upstream no longer sets coverAtlasReady');
  return html.replace(
    ready,
    '        coverAtlasReady = false;   // atlas removed: every cover is generated from its book',
  );
}

// The no-WebGL catalog carries its own copy of the seven books, in markup, independent of
// BOOKS. Left alone it is the version a visitor without WebGL reads.
function replaceFallbackGrid(html) {
  const open = html.indexOf('<div class="fallback__grid"');
  if (open === -1) throw new Error('upstream no longer has a fallback grid');
  const close = html.indexOf('</div>', html.lastIndexOf('</article>', html.indexOf('<div class="fallback__footer">')));
  const cards = BOOKS.map((b) => {
    // The 3D scene measures books in metres; the static grid measures them in pixels.
    const px = Math.round(b.height * 247);
    return `        <article class="fallback-book" style="--book-color:${b.color};--book-foil:${b.foil};--book-height:${px}px"><span>Repo ${b.roman}</span><strong>${b.title}</strong></article>`;
  }).join('\n');
  return (
    html.slice(0, open) +
    `<div class="fallback__grid" aria-label="Ten public repositories">\n${cards}\n      ` +
    html.slice(close)
  );
}

// The document imports three.js and four of its addons. Upstream that import map points at
// jsDelivr; here it points beside the site, so the library is copied out of node_modules on
// every build rather than being a file someone once dragged into the repo by hand.
const THREE = 'node_modules/three165';
const ADDONS = [
  'controls/OrbitControls.js',
  'environments/RoomEnvironment.js',
  'geometries/RoundedBoxGeometry.js',
  'lights/RectAreaLightUniformsLib.js',
];
await mkdir('js/vendor/three/addons', { recursive: true });
// The minified build: this is committed output, and the unminified copy is 1.2MB of
// source nobody reads from the repo.
await cp(`${THREE}/build/three.module.min.js`, 'js/vendor/three/three.module.js');
for (const addon of ADDONS) {
  await mkdir(`js/vendor/three/addons/${addon.split('/')[0]}`, { recursive: true });
  await cp(`${THREE}/examples/jsm/${addon}`, `js/vendor/three/addons/${addon}`);
}
console.log(`  vendored three.js and ${ADDONS.length} addons into js/vendor/three/`);

let html = await readFile(SRC, 'utf8');
const before = html.length;

html = replaceBooksArray(html);
html = dropCoverAtlas(html);
html = replaceFallbackGrid(html);

// Upstream swallows an initialisation failure whole and shows the static catalog with no
// way to find out why. The scene is worth debugging when it breaks.
html = html.replace(
  'initialize().catch(() => {',
  'initialize().catch((error) => {\n      console.error("shelf: the interactive scene failed to initialise", error);',
);

for (const [from, to] of COPY) {
  if (!html.includes(from)) throw new Error(`upstream copy changed, no longer contains: ${from.slice(0, 60)}`);
  html = html.replaceAll(from, to);
}

if (!IMPORTMAP_FROM.test(html)) throw new Error('upstream import map is no longer the jsDelivr pair');
html = html.replace(IMPORTMAP_FROM, IMPORTMAP_TO);

// The two Google Fonts hops and the stylesheet they preconnect for.
html = html
  .replace(/\s*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">/, '')
  .replace(/\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>/, '')
  .replace(/\s*<link[^>]*fonts\.googleapis\.com\/css2[^>]*>/, '');

const remaining = [...html.matchAll(/https?:\/\/[^"' )]+/g)].map((m) => m[0]);
if (remaining.length) {
  throw new Error(`document still reaches the network at render time:\n  ${remaining.join('\n  ')}`);
}

await mkdir('landing-pages', { recursive: true });
await writeFile(OUT, html);
console.log(`  shelf: ${BOOKS.length} repositories, ${before} -> ${html.length} bytes -> ${OUT}`);
