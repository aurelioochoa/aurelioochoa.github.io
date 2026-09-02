// The ThreeUI scenes.
//
// There is no React here and there is no ThreeUI component here. What ThreeUI actually ships
// underneath its React components is two useful things, and both are usable directly:
//
//   - renderer factories, `create*(canvas, getOptions) => { resize, render, dispose }`, which
//     is all the hero's keycap field and the condensation are;
//   - complete HTML documents, which is what the elements, the cloth, the button and the
//     shelf are. Those live in scenes/ and landing-pages/ now, vendored into this repo and
//     edited to carry this site's own content. See build/scenes.mjs.
//
// The React wrappers were never able to do what this page needs anyway: AnimatedTopDock and
// ArticleHeadings render fixed content and take no children, so their engines are driven
// here against the real chrome and the real headings instead.
//
// Everything is declared in the markup, so index.html stays the one place the page's
// structure is described:
//
//   <div class="act__scene" data-scene="warp" data-props='{"variant":"keycaps"}'></div>
//   <iframe class="act__scene" data-frame-src="scenes/elemental-marks.html?fx=fire"></iframe>

// These four are not in the package's `exports` map, so they are imported by file path.
// The dependency is pinned and the bundle is built once, here, so the path is resolved at
// build time and never by a visitor's browser.
//
// Three of the four are imported flat, because they are small and two of them are wanted
// immediately: the dock is the chrome's hover behaviour and the decode is a heading's
// entrance, and a visitor can reach both before they have scrolled anywhere.
//
// The warp field is imported LAZILY, and it is the only one that is, because it is the only
// one that pulls in Three.js. That import is 400KB of the 520KB this file used to bundle,
// for one scene, and it was arriving on the critical path ahead of the dock, the decode, the
// condensation and everything js/main.js does. Now esbuild splits it into its own chunk and
// the chunk is fetched when a warp scene first starts. Nothing that is not a warp field
// waits for it, and a visitor who asked for reduced motion never downloads it at all,
// because no canvas scene starts for them. See build/bundle.mjs.
import { createCondensationRenderer } from '../node_modules/@designcodeio/threeui/lib-dist/shaders/condensation/condensationRenderer.js';
import { createTopDockController } from '../node_modules/@designcodeio/threeui/lib-dist/shaders/animated-top-dock/topDockController.js';
import { startArticleHeadingDecode } from '../node_modules/@designcodeio/threeui/lib-dist/shaders/article-headings/articleHeadingDecode.js';

// Each entry resolves to a `create*(canvas, getOptions)` factory. A static one is wrapped in
// a resolved promise so that `start` has one shape to deal with, not two.
const RENDERERS = {
  warp: () => import('../node_modules/@designcodeio/threeui/lib-dist/shaders/warp-field/warpFieldRenderer.js')
    .then((m) => m.createWarpFieldRenderer),
  condensation: () => Promise.resolve(createCondensationRenderer),
};

// The drone is the page's signature and it is always running. The same preference that stops
// it stops these, which are decorative in every case.
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

function propsFor(el) {
  const raw = el.getAttribute('data-props');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`scene ${el.dataset.scene}: bad data-props`, err.message);
    return {};
  }
}

/* -------------------------------------------------------------- canvas scenes */

// A scene holds a live WebGL context and a running animation frame, and browsers cap
// contexts at around sixteen. So a scene offscreen is not paused, it is disposed: the
// renderer is torn down and its canvas removed, and both are built again on the way back.
function canvasScene(host) {
  const make = RENDERERS[host.dataset.scene];
  if (!make) {
    console.warn(`scene: no renderer named ${host.dataset.scene}`);
    return null;
  }
  const options = propsFor(host);
  let canvas = null;
  let renderer = null;
  let frame = 0;

  const size = () => {
    if (!renderer || !canvas) return;
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    renderer.resize(canvas.width, canvas.height);
  };

  // The factory may still be arriving over the network, and a scroll that reverses inside
  // that window calls stop() before there is anything to stop. `wanted` is what the observer
  // last asked for, and it is the only thing the resolved import trusts: an import that lands
  // after a stop must not quietly start a renderer nobody is looking at.
  let wanted = false;
  let factory = null;

  const run = () => {
    if (!wanted || renderer || !factory) return;
    canvas = document.createElement('canvas');
    host.appendChild(canvas);
    try {
      renderer = factory(canvas, () => options);
    } catch (err) {
      console.warn(`scene ${host.dataset.scene}: ${err.message}`);
      canvas.remove();
      canvas = null;
      return;
    }
    size();
    addEventListener('resize', size, { passive: true });
    const tick = (now) => {
      // Both factories are called the same way; only condensation wants the timestamp.
      renderer.render(now);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  };

  return {
    start() {
      if (wanted) return;
      wanted = true;
      if (factory) { run(); return; }
      // Resolved once and kept: a scene that leaves and comes back re-imports nothing.
      make().then((fn) => { factory = fn; run(); })
        .catch((err) => console.warn(`scene ${host.dataset.scene}: ${err.message}`));
    },
    stop() {
      wanted = false;
      if (!renderer) return;
      cancelAnimationFrame(frame);
      removeEventListener('resize', size);
      try { renderer.dispose(); } catch { /* a disposed context is still disposed */ }
      renderer = null;
      canvas?.remove();
      canvas = null;
    },
    get running() { return !!renderer; },
  };
}

const scenes = [...document.querySelectorAll('[data-scene]')].map((host) => {
  const scene = canvasScene(host);
  if (scene) host.__scene = scene;
  return scene && { host, scene };
}).filter(Boolean);

if (!still && scenes.length) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const found = scenes.find((s) => s.host === entry.target);
        if (!found) continue;
        if (entry.isIntersecting) found.scene.start();
        else found.scene.stop();
      }
    },
    // A screen either side, so a scroll that reverses does not thrash the renderer.
    { rootMargin: '100% 0px 100% 0px' },
  );
  scenes.forEach(({ host }) => io.observe(host));
}

/* --------------------------------------------------------------- frame scenes */

// An iframe is not a separate main thread. Building a scene inside one blocks this one, and
// the act above it is entering while that happens: setting src on the intersection callback
// stalls the neighbouring act's entrance mid-fade. So a third of the frame has to be on
// screen before it loads, and even then it waits for an idle period, with a timeout so a
// page that never goes idle still gets its scene.
const frames = [...document.querySelectorAll('[data-frame-src]')];
if (frames.length) {
  const load = (el) => { if (!el.src) el.src = el.dataset.frameSrc; };
  const idle = window.requestIdleCallback
    ? (fn) => window.requestIdleCallback(fn, { timeout: 1200 })
    : (fn) => setTimeout(fn, 200);

  if (still) {
    // Reduced motion leaves the decorative scenes out entirely rather than mounting seven
    // WebGL documents to sit still. The shelf is the exception because it is not decoration:
    // it is the projects, and it is the only place they are listed.
    frames.filter((el) => el.dataset.frameContent !== undefined).forEach(load);
  } else {
    const fio = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          fio.unobserve(entry.target);
          idle(() => load(entry.target));
        }
      },
      { threshold: 0.34 },
    );
    frames.forEach((el) => fio.observe(el));
  }
}

// A sandboxed frame cannot navigate the page, so the liquid metal button reports its press
// and the destination named in the markup is what actually opens.
addEventListener('message', (event) => {
  if (event.data?.liquidMetalButton?.type !== 'activate') return;
  const frame = frames.find((el) => el.contentWindow === event.source);
  const href = frame?.dataset.frameHref;
  if (href) location.href = href;
});

/* ------------------------------------------------------- chrome and headings */

const DOCK = { proximity: 122, spring: 0.19, damping: 0.7, widthGrowth: 17, heightGrowth: 16, drop: 3.5 };

function wireDock() {
  const chrome = document.querySelector('.chrome');
  if (!chrome || still) return;
  // The language buttons are built at runtime by the i18n module, so the dock's items are
  // marked here, once the chrome is populated, rather than in the markup.
  for (const item of chrome.querySelectorAll('.chrome__mark, .chrome__cv, .langs button')) {
    item.dataset.dockItem = '';
  }
  createTopDockController(chrome, () => DOCK);
}

// The decode is an entrance, so it runs when its act arrives. Run on load, a heading three
// screens down has already finished by the time anyone reads it.
function wireHeadingDecode() {
  const heads = [...document.querySelectorAll('[data-article-heading]')];
  if (!heads.length || still) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.unobserve(entry.target);
        startArticleHeadingDecode(entry.target.parentElement, {
          duration: 560, stagger: 140, scrambleLength: 10, preserveChance: 0.3, tailChance: 0.18,
        });
      }
    },
    { threshold: 0.6 },
  );
  heads.forEach((el) => io.observe(el));
}

// The chrome is populated by the i18n module on the same tick sequence as this one, so the
// dock waits for the page to declare itself ready rather than racing it.
if (document.documentElement.dataset.ready === 'true') {
  wireDock();
} else {
  new MutationObserver((_, obs) => {
    if (document.documentElement.dataset.ready !== 'true') return;
    obs.disconnect();
    wireDock();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-ready'] });
}
wireHeadingDecode();

// Read by the gates.
window.__scenes = {
  canvas: scenes.length,
  frames: frames.length,
  running: () => scenes.filter(({ scene }) => scene.running).length,
  names: scenes.map(({ host }) => host.dataset.scene),
};
