// CSS 3D clouds.
//
// The technique is Jaume Sanchez Elias's CSS3DClouds (https://github.com/spite/CSS3DClouds):
// no WebGL at all, just a perspective container, a preserve-3d world, and a few hundred
// soft sprites placed with translate3d. Each sprite counter-rotates against the world every
// frame so it stays facing the camera, which is what turns a pile of flat images into
// volume. It is the right tool for the SKY title card: the page already runs one WebGL
// canvas above every act and up to two more inside scenes, and browsers cap contexts at
// around sixteen. This costs none of them.
//
// Two things are ours rather than upstream's:
//
//   - The sprite is DRAWN, not downloaded. spite's demo loads cloud.png; this repo fetches
//     nothing at render time (tools/gate-no-network.mjs enforces it), so the puff is six
//     stacked radial gradients on a 256px canvas, serialised once to a data: URI and reused
//     as the src of every layer.
//   - There is no mouse look. The scene sits behind a title card at pointer-events: none,
//     and stealing the pointer from the page to fly a camera would be the same mistake the
//     drone's drag was. The world turns on a slow idle drift plus the visitor's own scroll,
//     sampled inside this module's animation frame rather than from a scroll listener.

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Tuned by screenshot, not by taste. The first pass ran twenty clusters of up to twelve
// sprites at up to 2.2x scale, which is a hundred and sixty 560px puffs across a 1440px
// panel: the card came out as a flat milky wash with no sky left in it. Clouds only read as
// clouds when there is ground between them.
const BASES = 12;          // cloud clusters in the field
const LAYERS = [5, 11];    // sprites per cluster
const SPREAD = 1400;       // half-width of the field, in px of world space
const RISE = 250;          // half-height: a sky is wide, not tall
const DEPTH = 620;
// How far a sprite may sit from its cluster's centre. This is the number that decides
// whether the card reads as cloud or as bokeh: spread the sprites wider than they are and
// the cluster never closes into one mass, which is exactly what happened at 150px.
const CLUSTER = [72, 40, 60];

// One soft puff, white on transparent. Six overlapping radial gradients of different radius
// and weight: a single gradient reads as a ball, and the offsets are what give the silhouette
// the lumpiness that makes a cluster of these read as cloud.
function drawSprite(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d');
  // Kept inside the middle of the box, so a sprite has a silhouette and an edge instead of
  // fading to nothing at the frame.
  const blobs = [
    [0.50, 0.56, 0.26, 0.80],
    [0.36, 0.59, 0.18, 0.66],
    [0.65, 0.59, 0.19, 0.68],
    [0.45, 0.47, 0.16, 0.58],
    [0.58, 0.48, 0.15, 0.54],
    [0.50, 0.64, 0.22, 0.50],
  ];
  for (const [cx, cy, r, a] of blobs) {
    const g = c.createRadialGradient(cx * size, cy * size, 0, cx * size, cy * size, r * size);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.45, `rgba(255,255,255,${a * 0.55})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
  }
  return canvas.toDataURL('image/png');
}

// Deterministic noise, so a reload does not reshuffle the sky and a screenshot gate compares
// like with like. Mulberry32, seeded once.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function build(host) {
  const sprite = drawSprite();
  const world = document.createElement('div');
  world.className = 'clouds__world';

  const random = rng(0x5eed);
  const layers = [];

  for (let i = 0; i < BASES; i++) {
    const base = document.createElement('div');
    base.className = 'clouds__base';
    const x = SPREAD * (random() * 2 - 1);
    const y = RISE * (random() * 2 - 1);
    const z = DEPTH * (random() * 2 - 1) - 180;
    base.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px)`;

    const count = LAYERS[0] + Math.floor(random() * (LAYERS[1] - LAYERS[0]));
    for (let j = 0; j < count; j++) {
      const layer = document.createElement('img');
      layer.className = 'clouds__layer';
      layer.src = sprite;
      layer.alt = '';
      const data = {
        el: layer,
        x: CLUSTER[0] * (random() * 2 - 1),
        y: CLUSTER[1] * (random() * 2 - 1),
        z: CLUSTER[2] * (random() * 2 - 1),
        angle: random() * 360,
        // Slow, and signed, so neighbouring sprites shear against each other instead of
        // turning as one plate.
        speed: (0.6 + random() * 1.6) * (random() > 0.5 ? 1 : -1),
        scale: 0.95 + random() * 0.95,
      };
      layer.style.opacity = String(0.5 + random() * 0.34);
      base.appendChild(layer);
      layers.push(data);
    }
    world.appendChild(base);
  }

  host.replaceChildren(world);
  return { world, layers };
}

export function wireClouds() {
  const host = document.querySelector('[data-clouds]');
  if (!host) return;

  let field = null;
  let raf = 0;
  let running = false;
  let t = 0;

  // The world's own attitude. `tilt` is the visitor's scroll through this act, `turn` is the
  // idle drift that keeps the sky alive when nobody scrolls.
  const frame = (now) => {
    if (!running) return;
    t = now / 1000;
    render();
    raf = requestAnimationFrame(frame);
  };

  function render() {
    // One rect read per frame, inside the frame, which is the sampling DESIGN.md sanctions.
    // No scroll listener does layout work anywhere on this page.
    const rect = host.getBoundingClientRect();
    const progress = rect.height
      ? (innerHeight - rect.top) / (innerHeight + rect.height) // 0 below the fold, 1 above it
      : 0.5;
    const tilt = (progress - 0.5) * 26;
    const turn = Math.sin(t * 0.08) * 12;

    field.world.style.transform = `translateZ(-420px) rotateX(${tilt.toFixed(2)}deg) rotateY(${turn.toFixed(2)}deg)`;

    for (const layer of field.layers) {
      layer.angle += layer.speed * (REDUCED ? 0 : 0.06);
      layer.el.style.transform =
        `translate3d(${layer.x.toFixed(1)}px, ${layer.y.toFixed(1)}px, ${layer.z.toFixed(1)}px) ` +
        `rotateY(${(-turn).toFixed(2)}deg) rotateX(${(-tilt).toFixed(2)}deg) ` +
        `rotateZ(${layer.angle.toFixed(2)}deg) scale(${layer.scale.toFixed(3)})`;
    }
  }

  const start = () => {
    if (!field) field = build(host);
    if (REDUCED) { render(); return; }   // one frame, held
    if (running) return;
    running = true;
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  if (!('IntersectionObserver' in window)) { start(); return; }

  // A screen either side, so a scroll that reverses does not thrash the field. Same margin
  // js/scenes.js uses for the WebGL scenes, for the same reason.
  let onScreen = false;
  new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        onScreen = e.isIntersecting;
        if (onScreen) start(); else stop();
      }
    },
    { rootMargin: '100% 0px 100% 0px' },
  ).observe(host);

  // A hidden tab is not scrolling, so the observer will not fire when it comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (onScreen) start();
  });
}
