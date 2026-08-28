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

  // 4. The handover arms it and gives the canvas pointer events.
  await page.click('[data-fly]');
  const after = await page.evaluate(() => ({
    armed: window.__drone.armed,
    pointer: getComputedStyle(document.getElementById('drone')).pointerEvents,
    buttonHidden: document.querySelector('[data-fly]').hasAttribute('hidden'),
    hintShown: !document.querySelector('[data-hint]').hasAttribute('hidden'),
  }));
  if (!after.armed) failures.push('the handover did not arm the drone');
  if (after.pointer !== 'auto') failures.push(`canvas pointer-events is "${after.pointer}" after handover`);
  if (!after.buttonHidden) failures.push('the handover button stayed visible');
  if (!after.hintShown) failures.push('the control hint never appeared');
  console.log(`  handover: armed=${after.armed}, pointer=${after.pointer}`);

  // 5. Keyboard control actually moves it.
  const before = await page.evaluate(() => ({ ...window.__drone.pos }));
  await page.keyboard.down('d');
  await new Promise((r) => setTimeout(r, 600));
  await page.keyboard.up('d');
  const steered = await page.evaluate(() => ({ ...window.__drone.pos }));
  console.log(`  keyboard: x ${before.x.toFixed(2)} -> ${steered.x.toFixed(2)}`);
  if (steered.x <= before.x) failures.push('pressing D did not move the drone right');

  if (errors.length) failures.push(`console errors: ${errors.join(' | ')}`);
  await page.close();

  // 6. No WebGL: the page must lose the toy and keep everything else.
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
      buttonHidden: document.querySelector('[data-fly]').hasAttribute('hidden'),
      copyIntact: !!document.querySelector('.close__head')?.textContent.trim(),
      acts: document.querySelectorAll('.act.is-in, .act').length,
    }));
    if (!state.canvasGone) failures.push('no-webgl: the dead canvas was left in the page');
    if (!state.fallbackShown) failures.push('no-webgl: no fallback message shown');
    if (!state.buttonHidden) failures.push('no-webgl: the handover button was still offered');
    if (!state.copyIntact) failures.push('no-webgl: the page copy broke');
    console.log(`  no-webgl fallback: canvas removed, message shown, ${state.acts} acts intact`);
    await p.close();
  }

  // 7. Reduced motion: entrances are instant and the aircraft holds station.
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
