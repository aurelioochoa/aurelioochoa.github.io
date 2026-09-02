// A hand check for the spray and the sound, not a gate: it drives the page, turns things
// on, and reports what it sees.
import puppeteer from '../cv/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { serve } from './serve.mjs';

const PORT = 8177;
const base = `http://localhost:${PORT}`;
const server = await serve(PORT);
const browser = await puppeteer.launch({ args: ['--use-angle=gl', '--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.waitForSelector('html[data-ready="true"]');

  // The sound switch: a real click is a gesture, so the context must come up running.
  await page.click('[data-sound-toggle]');
  await new Promise((r) => setTimeout(r, 300));
  const audio = await page.evaluate(() => {
    const s = window.__drone?.sound;
    return { enabled: s?.enabled, state: s?.ctx?.state, voices: s?.voices?.length,
             pressed: document.querySelector('[data-sound-toggle]').getAttribute('aria-pressed') };
  });
  console.log('sound:', JSON.stringify(audio));

  // And it is actually making a signal, not just a graph that exists: an analyser on the
  // master bus, read after the rotors have had a moment to come up.
  const level = await page.evaluate(async () => {
    const s = window.__drone.sound;
    window.__drone.stop();   // so the aircraft is not writing the throttle under this probe
    const an = s.ctx.createAnalyser();
    an.fftSize = 2048;
    s.master.connect(an);
    s.rotors(0.8);
    await new Promise((r) => setTimeout(r, 600));
    const buf = new Float32Array(an.fftSize);
    const peak = { rotors: 0, spray: 0, cue: 0 };
    const rms = () => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      return Math.sqrt(sum / buf.length);
    };
    peak.rotors = rms();
    s.rotors(0);
    s.rotorBus.gain.setValueAtTime(0, s.ctx.currentTime);
    await new Promise((r) => setTimeout(r, 300));
    peak.silence = rms();
    s.spray(true);
    await new Promise((r) => setTimeout(r, 700));
    peak.spray = rms();
    s.spray(false);
    await new Promise((r) => setTimeout(r, 400));
    s.cue('linked');
    await new Promise((r) => setTimeout(r, 120));
    peak.cue = rms();
    window.__drone.start();
    return peak;
  });
  console.log('audio rms:', JSON.stringify(level, (k, v) => typeof v === 'number' ? +v.toFixed(4) : v));

  // Arm it by hand and spray, then count what landed on the glass.
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    document.querySelector('[data-act="10"]').scrollIntoView();
    window.__drone.arm();
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => window.__drone.setSpraying(true));
  // Fly it across the frame while the booms are open, which is the shape a real pass makes.
  for (const [x, y] of [[-1.4, 0.9], [1.4, 0.4], [-1.0, -0.2], [1.2, -0.6]]) {
    await page.evaluate((tx, ty) => {
      window.__drone.target.x = tx;
      window.__drone.target.y = ty;
    }, x, y);
    await new Promise((r) => setTimeout(r, 1100));
  }
  const wet = await page.evaluate(() => {
    const d = window.__drone;
    let splats = 0, hues = new Set();
    for (let i = 0; i < d.splats.life.length; i++) {
      if (d.splats.life[i] <= 0) continue;
      splats++;
      hues.add([d.splats.col[i*3], d.splats.col[i*3+1], d.splats.col[i*3+2]].map(v => v.toFixed(2)).join(','));
    }
    let live = 0;
    for (const l of d.spray.life) if (l > 0) live++;
    d.draw();
    const c = document.getElementById('drone');
    const gl = c.getContext('webgl');
    const px = new Uint8Array(c.width * c.height * 4);
    gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let painted = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 12) painted++;
    return { splats, colours: hues.size, live, painted, spraying: d.spraying };
  });
  console.log('spraying:', JSON.stringify(wet));
  await page.screenshot({ path: 'lab/spray-on.png' });

  // Marks must dry: nothing stays on the glass forever.
  await page.evaluate(() => window.__drone.setSpraying(false));
  await new Promise((r) => setTimeout(r, 9000));
  const dry = await page.evaluate(() => {
    const d = window.__drone;
    let splats = 0;
    for (const l of d.splats.life) if (l > 0) splats++;
    return { splats };
  });
  console.log('after 9s:', JSON.stringify(dry));

  // The switch in the chrome is the spray itself, and it is live before the handover: the
  // controller here is still off, so this is the only thing on the page that can open the
  // booms, and the dial has to follow it while staying unavailable.
  await page.evaluate(() => window.__drone.setSpraying(false));
  await page.click('[data-spray-toggle]');
  const switched = await page.evaluate(() => ({
    spraying: window.__drone.spraying,
    pressed: document.querySelector('[data-spray-toggle]').getAttribute('aria-pressed'),
    dial: document.querySelector('[data-rc]').dataset.rcSpray,
    dialDisabled: document.querySelector('[data-spray]').disabled,
    rcState: document.querySelector('[data-rc]').dataset.rcState,
  }));
  console.log('chrome switch on: ', JSON.stringify(switched));

  await page.click('[data-spray-toggle]');
  const switchedOff = await page.evaluate(() => ({
    spraying: window.__drone.spraying,
    pressed: document.querySelector('[data-spray-toggle]').getAttribute('aria-pressed'),
    dial: document.querySelector('[data-rc]').dataset.rcSpray,
  }));
  console.log('chrome switch off:', JSON.stringify(switchedOff));

  // The whole ritual with the sound on: press, hold, link, then the dial. Nothing here
  // asserts what it sounded like; it asserts that every cue on the path ran.
  const p2 = await browser.newPage();
  p2.on('pageerror', (e) => errors.push('handover pageerror: ' + e.message));
  p2.on('console', (m) => { if (m.type() === 'error') errors.push('handover console: ' + m.text()); });
  await p2.setViewport({ width: 1280, height: 900 });
  await p2.goto(base, { waitUntil: 'networkidle0' });
  await p2.waitForSelector('html[data-ready="true"]');
  await p2.click('[data-sound-toggle]');
  await p2.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    document.querySelector('[data-act="10"]').scrollIntoView();
  });
  await new Promise((r) => setTimeout(r, 400));
  const at = await p2.$eval('[data-fly]', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await p2.click('[data-fly]');
  await p2.mouse.move(at.x, at.y);
  await p2.mouse.down();
  await new Promise((r) => setTimeout(r, 500));
  await p2.mouse.up();                       // an abort, which must fall away
  await p2.mouse.down();
  await new Promise((r) => setTimeout(r, 2300));
  await p2.mouse.up();                       // and the real one
  await new Promise((r) => setTimeout(r, 2800));   // the three power-on notes
  await p2.click('[data-spray]');
  await new Promise((r) => setTimeout(r, 900));
  const done = await p2.evaluate(() => ({
    armed: window.__drone.armed,
    link: window.__drone.link,
    spraying: window.__drone.spraying,
    dial: document.querySelector('[data-rc]').dataset.rcSpray,
    chrome: document.querySelector('[data-spray-toggle]').getAttribute('aria-pressed'),
    sound: window.__drone.sound.ctx.state,
  }));
  console.log('handover with sound:', JSON.stringify(done));
  await p2.click('[data-sound-toggle]');
  await new Promise((r) => setTimeout(r, 600));
  console.log('sound off:', JSON.stringify(await p2.evaluate(() => ({
    enabled: window.__drone.sound.enabled,
    pressed: document.querySelector('[data-sound-toggle]').getAttribute('aria-pressed'),
  }))));

  // The returning visitor whose first gesture is anywhere but the switch: the sound has to
  // come back on that gesture, and not before it.
  const p3 = await browser.newPage();
  p3.on('pageerror', (e) => errors.push('return pageerror: ' + e.message));
  await p3.setViewport({ width: 1280, height: 900 });
  await p3.goto(base, { waitUntil: 'networkidle0' });
  await p3.evaluate(() => localStorage.setItem('sound', 'on'));   // as a previous visit left it
  await p3.reload({ waitUntil: 'networkidle0' });
  await p3.waitForSelector('html[data-ready="true"]');
  const stored = await p3.evaluate(() => localStorage.getItem('sound'));
  const onLoad = await p3.evaluate(() => window.__drone.sound.enabled);
  await p3.click('.chrome__name');
  await new Promise((r) => setTimeout(r, 300));
  const afterGesture = await p3.evaluate(() => ({
    enabled: window.__drone.sound.enabled,
    state: window.__drone.sound.ctx?.state,
    pressed: document.querySelector('[data-sound-toggle]').getAttribute('aria-pressed'),
  }));
  console.log(`returning visitor (stored ${stored}): on load ${onLoad}, ` +
              `after one gesture ${JSON.stringify(afterGesture)}`);

  console.log(errors.length ? 'ERRORS:\n  ' + errors.join('\n  ') : 'no console errors');
} finally {
  await browser.close();
  server.close();
}
