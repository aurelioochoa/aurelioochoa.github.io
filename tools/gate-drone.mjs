// G6: the drone initialises, renders, hands over control, and degrades cleanly.
import puppeteer from '../cv/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { serve } from './serve.mjs';

const PORT = 8125;
const base = `http://localhost:${PORT}`;
const server = await serve(PORT);
const browser = await puppeteer.launch({ args: ['--use-angle=gl', '--no-sandbox'] });
const failures = [];

// Standard deviation of pixel luminance. A canvas that never drew is flat, and flat is what
// a "successful" but empty capture looks like, so this is the check that catches it.
function sigma(buf) {
  let sum = 0, sumSq = 0, n = 0;
  for (let i = 0; i < buf.length; i += 4) {
    const l = 0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2];
    sum += l; sumSq += l * l; n++;
  }
  const mean = sum / n;
  return Math.sqrt(sumSq / n - mean * mean);
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.waitForSelector('html[data-ready="true"]');

  // 1. The renderer came up on the real GPU, not a stub.
  const info = await page.evaluate(() => {
    const c = document.getElementById('drone');
    if (!c) return { ok: false, why: 'canvas missing' };
    const gl = c.getContext('webgl');
    if (!gl) return { ok: false, why: 'no webgl context' };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      ok: true,
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
      running: !!window.__drone?.running,
      armed: !!window.__drone?.armed,
    };
  });
  if (!info.ok) failures.push(`webgl: ${info.why}`);
  else console.log(`  renderer: ${info.renderer}`);
  if (!info.running) failures.push('the drone never started its loop');
  if (info.armed) failures.push('the drone was armed before the handover');

  // 2. It is actually drawing: the canvas is not a flat empty frame.
  //    Real wall-clock wait first, because rAF drives this and virtual time would not
  //    advance it. The read then happens in the SAME task as a draw: WebGL clears the
  //    drawing buffer once the browser composites, so a readPixels from any later task
  //    comes back empty whether or not the scene rendered.
  await new Promise((r) => setTimeout(r, 2000));
  const shot = await page.evaluate(() => {
    const d = window.__drone;
    const c = document.getElementById('drone');
    const gl = c.getContext('webgl');
    d.pos.x = 0; d.pos.y = 0; d.target.x = 0; d.target.y = 0;   // park it in frame
    d.draw();
    const w = 420, h = 320;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(
      Math.floor((c.width - w) / 2), Math.floor((c.height - h) / 2),
      w, h, gl.RGBA, gl.UNSIGNED_BYTE, px
    );
    return Array.from(px);
  });
  const s = sigma(Uint8Array.from(shot));
  console.log(`  canvas sigma: ${s.toFixed(1)}`);
  if (s < 2) failures.push(`the canvas rendered a flat frame (sigma ${s.toFixed(2)})`);

  // 3. The aircraft actually moves under autopilot.
  const p1 = await page.evaluate(() => ({ ...window.__drone.pos }));
  await new Promise((r) => setTimeout(r, 900));
  const p2 = await page.evaluate(() => ({ ...window.__drone.pos }));
  const moved = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  console.log(`  autopilot travel over 0.9s: ${moved.toFixed(3)} world units`);
  if (moved < 0.05) failures.push('the drone did not move under autopilot');

  // 4. The page's copy occludes it GLYPH BY GLYPH, so it flies both over and under a
  //    headline rather than in front of an invisible rectangle. Parked in the middle of the
  //    close act's headline, the same aircraft at the same place must cover meaningfully
  //    fewer pixels when it is behind the copy's plane than when it is in front of it, and
  //    it must still be visible between the letters: a mask that covered the whole rect
  //    would take it to nothing, and a mask that never baked would leave the two equal.
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    document.querySelector('[data-act="14"]').scrollIntoView();
  });
  await new Promise((r) => setTimeout(r, 600));
  const cross = await page.evaluate(() => {
    const d = window.__drone;
    const c = document.getElementById('drone');
    const gl = c.getContext('webgl');
    const el = document.querySelector('.close__head');
    const r = el.getBoundingClientRect();
    const per = (2 * d.halfHeightAt(0)) / innerHeight;

    // Park it over the headline. Straight onto pos, because step() is what the autopilot
    // would use to fly it away again between the two reads.
    d.pos.x = d.target.x = (r.left + r.width * 0.45 - innerWidth / 2) * per;
    d.pos.y = d.target.y = (innerHeight / 2 - (r.top + r.height * 0.55)) * per;
    // The clock is advanced by hand: masks are baked only once the copy has settled, and
    // rAF is throttled to almost nothing in an automated tab that never takes focus.
    d.t += 1;

    const dpr = Math.min(devicePixelRatio || 1, 2);
    const x = Math.max(0, Math.floor(r.left * dpr));
    const y = Math.max(0, Math.floor((innerHeight - r.bottom) * dpr));
    const w = Math.min(c.width - x, Math.floor(r.width * dpr));
    const h = Math.min(c.height - y, Math.floor(r.height * dpr));
    const painted = (z) => {
      d.pos.z = z;
      d.draw();
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let n = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 40) n++;
      return n;
    };
    const over = painted(0.8);      // in front of the copy's plane
    const under = painted(-0.9);    // behind it
    return { masks: d.masks.size, over, under };
  });
  console.log(`  copy occludes: ${cross.masks} mask(s), aircraft pixels over ${cross.over}, ` +
              `under ${cross.under}`);
  if (!cross.masks) failures.push('no coverage mask was baked for the copy');
  if (cross.over < 500) failures.push(`the aircraft drew ${cross.over}px over the headline`);
  if (cross.under >= cross.over * 0.92) {
    failures.push(`flying behind the copy hid nothing (${cross.under} of ${cross.over}px)`);
  }
  if (cross.under < cross.over * 0.15) {
    failures.push(`flying behind the copy hid all of it (${cross.under} of ${cross.over}px)`);
  }

  // 5. The handover is the controller's real power-on sequence: one press, then a press held
  //    for two seconds. A single click must not arm it, and neither must a short hold.
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    document.querySelector('[data-act="10"]').scrollIntoView();
  });
  await new Promise((r) => setTimeout(r, 400));
  const rcState = () => page.$eval('[data-rc]', (el) => el.dataset.rcState);
  const armed = () => page.evaluate(() => window.__drone.armed);
  const box = await page.$eval('[data-fly]', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });

  await page.click('[data-fly]');
  if (await armed()) failures.push('one press of the power button armed the drone');
  if (await rcState() !== 'primed') failures.push(`one press left the controller "${await rcState()}"`);

  // Held, then released early: the hold must abort, not accumulate.
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 500));
  await page.mouse.up();
  if (await armed()) failures.push('a half-second hold armed the drone');
  const drained = await page.$eval('[data-rc]', (el) => el.style.getPropertyValue('--rc-hold'));
  if (Number(drained) !== 0) failures.push(`an aborted hold left the track at ${drained}`);

  // And the real thing.
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 2300));
  await page.mouse.up();
  const after = await page.evaluate(() => ({
    armed: window.__drone.armed,
    state: document.querySelector('[data-rc]').dataset.rcState,
    pointer: getComputedStyle(document.getElementById('drone')).pointerEvents,
  }));
  if (!after.armed) failures.push('the two-second hold did not arm the drone');
  if (after.state !== 'on') failures.push(`the controller is "${after.state}" after the hold`);
  console.log(`  handover: press, abort at 0.5s, hold 2s -> armed=${after.armed}, rc=${after.state}`);

  // 6. And the whole reason drag was removed: an armed drone must not swallow the page's
  //    clicks. The canvas is fixed and full-viewport, so anything but "none" here means
  //    every control underneath it is dead.
  if (after.pointer !== 'none') {
    failures.push(`canvas pointer-events is "${after.pointer}" after handover, so it eats clicks`);
  }
  const reach = await page.evaluate(() => {
    const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return { tag: el?.tagName, id: el?.id };
  });
  if (reach.id === 'drone') failures.push('the armed canvas is the top element at the viewport centre');
  const clicked = await page.evaluate(async () => {
    // A real control, in the fixed chrome, right where the drone flies.
    const cv = document.querySelector('.chrome__cv');
    const r = cv.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return cv.contains(hit) || hit === cv;
  });
  if (!clicked) failures.push('the CV link in the chrome is covered by the drone canvas');
  console.log(`  clicks pass through: centre hits <${reach.tag}>, chrome CV link reachable`);

  // 7. Keyboard control actually moves it, which is now the only way to fly.
  const before = await page.evaluate(() => ({ ...window.__drone.pos }));
  await page.keyboard.down('d');
  await new Promise((r) => setTimeout(r, 600));
  await page.keyboard.up('d');
  const steered = await page.evaluate(() => ({ ...window.__drone.pos }));
  console.log(`  keyboard: x ${before.x.toFixed(2)} -> ${steered.x.toFixed(2)}`);
  if (steered.x <= before.x) failures.push('pressing D did not move the drone right');

  // 8. Flying vertically takes the page with it. Arming spends the arrows and W/S on the
  //    aircraft, so this is the keyboard scrolling that gives them back, and it only starts
  //    once the aircraft is past the dead band in the middle of the frame.
  await page.evaluate(() =>
    window.scrollTo(0, Math.round(document.documentElement.scrollHeight / 2)));
  await new Promise((r) => setTimeout(r, 250));
  //    The hold is sampled in slices rather than slept through in one go, and that is not
  //    cosmetic: rAF is throttled to almost nothing in an automated tab that never takes
  //    focus, which is the same hazard js/rc.js runs its power-on timer on a timeout to
  //    avoid. Slept through blind, the aircraft never crosses the dead band, never scrolls,
  //    and the gate reports a product failure that only exists in the harness.
  const flownScroll = async (key) => {
    // From the middle of the frame each time, so the second run is not spent flying back
    // across the dead band before it can start.
    await page.evaluate(() => { window.__drone.pos.y = 0; window.__drone.target.y = 0; });
    const from = await page.evaluate(() => window.scrollY);
    await page.keyboard.down(key);
    let now = from;
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 200));
      now = await page.evaluate(() => window.scrollY);
    }
    await page.keyboard.up(key);
    return now - from;
  };
  const flewUp = await flownScroll('w');
  const flewDown = await flownScroll('s');
  console.log(`  flying scrolls the page: w ${flewUp.toFixed(0)}px, s +${flewDown.toFixed(0)}px`);
  if (flewUp >= 0) failures.push(`flying up did not scroll the page up (${flewUp}px)`);
  if (flewDown <= 0) failures.push(`flying down did not scroll the page down (${flewDown}px)`);

  // And the dead band: parked in the middle with nothing held, the page must not move.
  await page.evaluate(() => { window.__drone.pos.y = 0; window.__drone.target.y = 0; });
  const parkedFrom = await page.evaluate(() => window.scrollY);
  let parkedNow = parkedFrom;
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 200));
    parkedNow = await page.evaluate(() => window.scrollY);
  }
  const parkedDrift = parkedNow - parkedFrom;
  if (parkedDrift !== 0) failures.push(`the page scrolled ${parkedDrift}px with nothing held`);

  if (errors.length) failures.push(`console errors: ${errors.join(' | ')}`);
  await page.close();

  // 9. No WebGL: the page must lose the toy, and the controller with it, and keep the rest.
  {
    const p = await browser.newPage();
    await p.evaluateOnNewDocument(() => {
      HTMLCanvasElement.prototype.getContext = function () { return null; };
    });
    await p.goto(base, { waitUntil: 'networkidle0' });
    await p.waitForSelector('html[data-ready="true"]');
    const state = await p.evaluate(() => ({
      canvasGone: !document.getElementById('drone'),
      fallbackShown: !document.querySelector('[data-fallback]').hasAttribute('hidden'),
      buttonHidden: document.querySelector('[data-rc]').hasAttribute('hidden'),
      copyIntact: !!document.querySelector('.close__head')?.textContent.trim(),
      acts: document.querySelectorAll('.act.is-in, .act').length,
    }));
    if (!state.canvasGone) failures.push('no-webgl: the dead canvas was left in the page');
    if (!state.fallbackShown) failures.push('no-webgl: no fallback message shown');
    if (!state.buttonHidden) failures.push('no-webgl: the controller was still offered');
    if (!state.copyIntact) failures.push('no-webgl: the page copy broke');
    console.log(`  no-webgl fallback: canvas removed, message shown, ${state.acts} acts intact`);
    await p.close();
  }

  // 10. Reduced motion: entrances are instant and the aircraft holds station.
  {
    const p = await browser.newPage();
    await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await p.goto(base, { waitUntil: 'networkidle0' });
    await p.waitForSelector('html[data-ready="true"]');
    const allIn = await p.evaluate(() =>
      [...document.querySelectorAll('.act')].every((a) => a.classList.contains('is-in')));
    if (!allIn) failures.push('reduced motion: some acts never became visible');
    const a = await p.evaluate(() => ({ ...window.__drone.pos }));
    await new Promise((r) => setTimeout(r, 800));
    const b = await p.evaluate(() => ({ ...window.__drone.pos }));
    const drift = Math.hypot(b.x - a.x, b.y - a.y);
    if (drift > 0.01) failures.push(`reduced motion: the drone still flew (${drift.toFixed(3)})`);
    console.log(`  reduced motion: all acts visible, drone drift ${drift.toFixed(4)}`);
    await p.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error('DRONE FAILURES:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('DRONE_OK');
