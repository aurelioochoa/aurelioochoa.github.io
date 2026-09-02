import { detectLanguage, applyLanguage, buildToggle } from './i18n.js';
import { Drone } from './drone.js';
import { wireController } from './rc.js';
import { wireClouds } from './clouds.js';
import { Sound, soundAvailable, storedPreference } from './audio.js';

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

/* --------------------------------------------------------------- switches */

// The sound. It starts off and it is remembered, and the two are handled here rather than
// in js/audio.js because only the page knows what a gesture is.
//
// A browser will not let an AudioContext make a sound outside a user gesture, and it is
// right not to: a page that starts talking on load is a page people close. So a visitor who
// turned the sound on last time does not get it back on load either. They get it back on
// the first thing they do, whatever that is, which is the earliest moment the browser and
// good manners both allow.
function wireSound(drone) {
  const button = document.querySelector('[data-sound-toggle]');
  if (!button) return null;
  if (!soundAvailable()) {
    button.remove();
    return null;
  }

  const sound = new Sound();
  sound.onChange = (on) => button.setAttribute('aria-pressed', String(on));
  button.setAttribute('aria-pressed', 'false');

  // The tab going away silences it without touching the preference, so coming back restores
  // what the visitor asked for rather than what the browser did to them.
  document.addEventListener('visibilitychange', () => sound.mute(document.hidden));

  // Waiting for the first gesture, when the visitor already asked for sound on a previous
  // visit. The listeners are removed by hand rather than declared `once`, because the first
  // gesture may well be a press on this very button: `once` would spend the wake-up on that
  // press, the button's own click would then arrive and toggle the sound straight back off,
  // and the switch would look dead the first time anyone touched it.
  let waiting = false;
  const wake = (e) => {
    if (e.target?.closest?.('[data-sound-toggle]')) return;
    stopWaiting();
    sound.setEnabled(true);
  };
  function stopWaiting() {
    if (!waiting) return;
    waiting = false;
    window.removeEventListener('pointerdown', wake);
    window.removeEventListener('keydown', wake);
  }

  button.addEventListener('click', () => {
    stopWaiting();
    sound.toggle();
  });

  if (storedPreference()) {
    waiting = true;
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
  }

  drone.sound = sound;
  return sound;
}

// The spray, from anywhere on the page. The controller's dial is the ritual and it stays
// dead until the handover; this is the page's own switch and it is live the whole way down,
// because the aircraft has been flying itself since the visitor got here and there is no
// reason it cannot be painting while it does. The aircraft owns the state, so this button
// only ever asks and then draws whatever answer comes back.
function wireSprayToggle(drone) {
  const button = document.querySelector('[data-spray-toggle]');
  if (!button) return;
  // Reduced motion has no spray to switch, so it gets no switch. See Drone.setSpraying.
  if (drone.reduced) {
    button.remove();
    return;
  }
  drone.watchSpray((on) => button.setAttribute('aria-pressed', String(on)));
  button.addEventListener('click', () => drone.setSpraying(!drone.spraying));
}

/* ------------------------------------------------------------- the close */

// The liquid metal button's label is not in the page, it is a query parameter on the
// document the frame loads, so the i18n pass walking [data-i18n] nodes could never reach it
// and the one CTA on the page stayed English in Spanish and German. It is retargeted here
// instead, from the same string the plain link behind it uses.
//
// This runs before the frame has a src: js/scenes.js collects the elements at module load
// but only reads data-frame-src when the act comes into view, and the closing act is the
// last one on the page.
function translateMetalButton(t) {
  const frame = document.querySelector('.close__metal');
  const label = t?.close?.cta;
  if (!frame || !label || frame.src) return;
  const url = new URL(frame.dataset.frameSrc, location.href);
  url.searchParams.set('text', label);
  frame.dataset.frameSrc = url.pathname.replace(/^\//, '') + url.search;
  frame.title = label;
}

// The address is written out in the closing act, and a written address that has to be
// selected by hand on a phone is written for nobody. The control is in the markup so it can
// be translated by the same pass as everything else, and hidden there so it is never on
// screen before this line has confirmed there is a clipboard to put anything on.
//
// The confirmation replaces the label rather than sitting beside it: the button is 32px
// tall in a row that has a rule under it, and anything added next to it moves that rule.
function wireCopy() {
  const button = document.querySelector('[data-copy]');
  if (!button) return;
  if (!navigator.clipboard?.writeText) return;

  const label = button.firstElementChild;
  const idle = label.textContent;
  let restore;

  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
    } catch {
      // Denied permission or a non-secure origin: the address is still on the page and the
      // mailto beside it still works, so this fails quietly rather than shouting about it.
      return;
    }
    label.textContent = button.dataset.copied || idle;
    button.dataset.done = '';
    clearTimeout(restore);
    restore = setTimeout(() => {
      label.textContent = idle;
      delete button.dataset.done;
    }, 1800);
  });
}

// He says something, and pressing him says something else. The old site's footer fetched a
// random line from a third-party trivia API on every load, which is why the redesign cut
// it: one offsite request, in English only, for a footer that is read in three languages.
// The line was worth keeping and the request was not, so the facts ship in the language
// files and the pick happens here. That keeps the no-network gate true and gets the footer
// something the old one never had, which is a fact in the visitor's own language.
//
// The bubble is empty and hidden in the markup and only appears once there is a fact in it,
// for the same reason the copy control does: no control on screen before the thing it does
// exists.
function wireSkullFacts(t) {
  const bubble = document.querySelector('[data-facts]');
  const slot = bubble?.querySelector('[data-fact]');
  const facts = t?.skull?.facts;
  if (!bubble || !slot || !Array.isArray(facts) || facts.length === 0) return;

  let shown = -1;
  const another = () => {
    // Never the same one twice running: a button that visibly does nothing reads as broken,
    // and at seven facts a plain random pick lands on a repeat one press in seven.
    let i = Math.floor(Math.random() * facts.length);
    if (i === shown) i = (i + 1) % facts.length;
    shown = i;
    slot.textContent = facts[i];
  };

  another();
  bubble.hidden = false;
  bubble.addEventListener('click', another);
}

/* ----------------------------------------------------------------- drone */

function wireDrone() {
  const canvas = document.getElementById('drone');
  const rc = document.querySelector('[data-rc]');
  const fallback = document.querySelector('[data-fallback]');
  if (!canvas) return;

  let drone;
  try {
    drone = new Drone(canvas);
  } catch (err) {
    // No WebGL: the page loses its toy and keeps everything else. The controller goes with
    // it, because a power button that powers on nothing is worse than no power button, and
    // the two switches go with it for the same reason: there is nothing left to switch.
    console.warn('drone unavailable:', err.message);
    canvas.remove();
    rc?.setAttribute('hidden', '');
    fallback?.removeAttribute('hidden');
    document.querySelector('.switches')?.remove();
    return;
  }

  const sound = wireSound(drone);
  wireSprayToggle(drone);

  // The handover is the controller's own power-on sequence: press, then press and hold.
  wireController(drone, sound);

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
    const t = await applyLanguage(lang);
    translateMetalButton(t);
    wireSkullFacts(t);
  } catch (err) {
    console.error(err);   // fall back to the static English markup
  }
  buildToggle(lang);
  wireReveal();
  wireCopy();
  wireDrone();
  wireClouds();
  document.documentElement.dataset.ready = 'true';
}

main();
