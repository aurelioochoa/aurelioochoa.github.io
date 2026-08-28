import { detectLanguage, applyLanguage, buildToggle } from './i18n.js';
import { Drone } from './drone.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------------- reveal */

// Acts enter on a hard cut. IntersectionObserver only: no scroll listener does layout work
// per frame anywhere on this page.
function wireReveal() {
  const acts = document.querySelectorAll('.act');

  for (const act of acts) {
    // Stagger the act's own direct children rather than requiring a wrapper element.
    const kids = [...act.children];
    act.classList.add('reveal');
    kids.forEach((kid, i) => kid.style.setProperty('--i', String(i)));
  }

  const revealAll = () => { for (const act of acts) act.classList.add('is-in'); };

  if (reduced || !('IntersectionObserver' in window)) {
    revealAll();
    return;
  }

  // Only now does the CSS start hiding anything. Until this line the page is fully readable,
  // so a throttled or never-delivered observer callback can no longer leave copy invisible.
  document.documentElement.dataset.reveal = 'on';

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }
  );
  for (const act of acts) io.observe(act);

  // Backstop: a background or throttled tab can stall the rendering steps that deliver
  // observer callbacks. If the first act has not been revealed shortly after load, show
  // everything rather than leave the page blank.
  setTimeout(() => {
    if (!acts[0]?.classList.contains('is-in')) revealAll();
  }, 1200);
}

/* ----------------------------------------------------------------- drone */

function wireDrone() {
  const canvas = document.getElementById('drone');
  const button = document.querySelector('[data-fly]');
  const hint = document.querySelector('[data-hint]');
  const fallback = document.querySelector('[data-fallback]');
  if (!canvas) return;

  let drone;
  try {
    drone = new Drone(canvas);
  } catch (err) {
    // No WebGL: the page loses its toy and keeps everything else.
    console.warn('drone unavailable:', err.message);
    canvas.remove();
    button?.setAttribute('hidden', '');
    fallback?.removeAttribute('hidden');
    return;
  }

  drone.onFirstInput = () => {
    button?.setAttribute('hidden', '');
    hint?.setAttribute('hidden', '');
  };

  const arm = () => {
    drone.arm();
    button?.setAttribute('hidden', '');
    hint?.removeAttribute('hidden');
    canvas.focus?.();
  };
  button?.addEventListener('click', arm);

  // Pause when the tab is hidden, and when the whole canvas is offscreen it never is,
  // so visibility is the honest signal here.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) drone.stop();
    else drone.start();
  });

  drone.start();
  window.__drone = drone;   // read by tools/gate-drone.mjs
}

/* ------------------------------------------------------------------ boot */

async function main() {
  const lang = detectLanguage();
  try {
    await applyLanguage(lang);
  } catch (err) {
    console.error(err);   // fall back to the static English markup
  }
  buildToggle(lang);
  wireReveal();
  wireDrone();
  document.documentElement.dataset.ready = 'true';
}

main();
